// Edge Function: enrich a word that isn't in the base lexicon yet.
// Called from the app when autocomplete has no match. Uses Groq (server-side —
// the key never reaches the client) to derive pos/gender/auxiliary/translations
// and, for verbs, full conjugation tables, then inserts everything into the
// public lexicon so future searches find it instantly.
//
// Deploy: supabase functions deploy enrich-word --no-verify-jwt
// Secrets: supabase secrets set GROQ_API_KEY=... (SUPABASE_URL / _SERVICE_ROLE_KEY
//          are injected automatically by the platform)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const TENSES = [
  'presente',
  'passato_prossimo',
  'imperfetto',
  'futuro_semplice',
  'condizionale_presente',
  'congiuntivo_presente',
];
const COMPOUND = new Set(['passato_prossimo']);
const PERSONS = ['io', 'tu', 'lui_lei', 'noi', 'voi', 'loro'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function groqJson(
  messages: unknown[],
  attempt = 1,
  preferModel?: string,
): Promise<Record<string, unknown>> {
  // Fall back to the smaller/faster model on later attempts if the big one is
  // rate-limited (concurrent bulk jobs can saturate the free tier).
  const model = preferModel ?? (attempt >= 3 ? 'llama-3.1-8b-instant' : GROQ_MODEL);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  if (res.status === 429 && attempt <= 4) {
    const wait = Math.min(Number(res.headers.get('retry-after') ?? 3), 8) * 1000;
    await sleep(wait);
    return groqJson(messages, attempt + 1, preferModel);
  }
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function conjugateTables(lemma: string, aux: string): Promise<Record<string, Record<string, string>>> {
  const reflexive = /rsi$/.test(lemma);
  const messages = [
    { role: 'system', content: 'You are an expert Italian grammarian. Reply with valid JSON only.' },
    {
      role: 'user',
      content:
        `Conjugate "${lemma}" (auxiliary: ${aux}) in indicativo ${TENSES.join(', ')} ` +
        `(condizionale_presente = condizionale, congiuntivo_presente = congiuntivo) for all six persons. ` +
        `Be precise: io/tu/lui_lei/noi/voi/loro must each be the correct distinct form. ` +
        `passato_prossimo: full compound with masculine agreement. ` +
        (reflexive ? 'REFLEXIVE: include the reflexive pronoun. ' : 'No subject pronouns inside forms. ') +
        `Respond as JSON: {"tenses": {${TENSES.map((t) => `"${t}": {${PERSONS.map((p) => `"${p}":"..."`).join(',')}}`).join(',')}}}`,
    },
  ];
  // Prefer a stronger model for accuracy; validate completeness with retries.
  for (const model of ['openai/gpt-oss-120b', GROQ_MODEL, GROQ_MODEL]) {
    try {
      const out = await groqJson(messages, 1, model);
      const tenses = (out.tenses ?? {}) as Record<string, Record<string, string>>;
      if (TENSES.every((t) => PERSONS.every((p) => tenses[t]?.[p]?.trim()))) return tenses;
    } catch (_) {
      /* try next model */
    }
  }
  throw new Error('could not generate complete conjugations');
}

async function inflectForms(
  lemma: string,
  pos: string,
  gender: string | null,
): Promise<Record<string, string>> {
  const isNoun = pos === 'noun';
  const shape = isNoun
    ? `{"singular":"...","plural":"..."}`
    : `{"m_sg":"...","f_sg":"...","m_pl":"...","f_pl":"..."}`;
  const rules = isNoun
    ? `Give the correct singular and plural of the ${gender === 'f' ? 'feminine' : gender === 'm' ? 'masculine' : ''} noun. ` +
      `Watch for invariable nouns (la radio → le radio, la foto → le foto, la città → le città), ` +
      `-co/-go and -ca/-ga changes, and irregular plurals (l'uomo → gli uomini, il dito → le dita). ` +
      `Output the bare word without any article.`
    : `Give the four agreement forms of the adjective: masculine singular, feminine singular, ` +
      `masculine plural, feminine plural. For -e adjectives both genders share the singular ` +
      `(grande/grande) and plural (grandi/grandi). Watch invariable adjectives (blu, rosa, viola → unchanged).`;
  const messages = [
    { role: 'system', content: 'You are an expert Italian grammarian. Reply with valid JSON only.' },
    {
      role: 'user',
      content:
        `The Italian ${isNoun ? 'noun' : 'adjective'} is "${lemma}". ${rules} ` +
        `Respond as JSON: ${shape}`,
    },
  ];
  const keys = isNoun ? ['singular', 'plural'] : ['m_sg', 'f_sg', 'm_pl', 'f_pl'];
  for (const model of ['openai/gpt-oss-120b', GROQ_MODEL, GROQ_MODEL]) {
    try {
      const out = await groqJson(messages, 1, model);
      if (keys.every((k) => typeof out[k] === 'string' && (out[k] as string).trim())) {
        return Object.fromEntries(keys.map((k) => [k, String(out[k]).trim().toLowerCase()]));
      }
    } catch (_) {
      /* try next model */
    }
  }
  throw new Error('could not generate inflected forms');
}

/**
 * Make sure an Italian verb entry has its conjugation tables. Called for new
 * entries and to backfill ones inserted as an alternative sense (those skip
 * generation so the first response stays fast).
 * Only a COMPLETE set is inserted — a partial table is worse than none, because
 * the app's rule-based fallback fills regular verbs on save.
 */
async function ensureConjugations(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  entryId: string,
  lemma: string,
  aux: string,
  target: string,
): Promise<void> {
  if (target !== 'it') return;
  const { count } = await supabase
    .from('conjugations')
    .select('id', { count: 'exact', head: true })
    .eq('lexicon_ref', entryId);
  if ((count ?? 0) > 0) return;
  try {
    const tenses = await conjugateTables(lemma, aux);
    await supabase.from('conjugations').insert(
      TENSES.flatMap((t) =>
        PERSONS.map((p) => ({
          lexicon_ref: entryId,
          tense: t,
          mood: 'indicativo',
          person: p,
          form: tenses[t][p].trim(),
          is_compound: COMPOUND.has(t),
          source: 'ai',
        })),
      ),
    );
  } catch (_) {
    /* leave it to the rule-based fallback / "Re-check with AI" */
  }
}

/** Drop empty / "null" / over-long strings a model sometimes puts in the array. */
function cleanTranslations(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const t = String(raw ?? '').trim();
    if (!t || t.length > 120 || /^(null|none|n\/a|-)$/i.test(t)) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Insert one lexicon entry + its translations; idempotent on (lang, lemma, pos). */
async function upsertEntry(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  target: string,
  source: string,
  entry: {
    lemma: string;
    pos: string;
    gender?: string | null;
    auxiliary?: string | null;
    is_irregular?: boolean;
    cefr?: string | null;
    translations: string[];
  },
): Promise<string> {
  const translations = cleanTranslations(entry.translations);
  if (translations.length === 0) throw new Error(`no usable translation for ${entry.lemma}`);

  const { data: existing } = await supabase
    .from('lexicon_entries')
    .select('id')
    .eq('target_language', target)
    .eq('lemma', entry.lemma)
    .eq('pos', entry.pos)
    .maybeSingle();
  if (existing?.id) {
    // The entry may have been added by a speaker of another language — a
    // Turkish learner must not be handed the Spanish gloss.
    const { count } = await supabase
      .from('lexicon_translations')
      .select('id', { count: 'exact', head: true })
      .eq('entry_id', existing.id)
      .eq('source_language', source);
    if ((count ?? 0) === 0) {
      await supabase.from('lexicon_translations').insert(
        translations.slice(0, 3).map((t, order) => ({
          entry_id: existing.id,
          source_language: source,
          translation: t,
          sense_order: order,
        })),
      );
    }
    return existing.id as string;
  }

  const { data: inserted, error: insErr } = await supabase
    .from('lexicon_entries')
    .insert({
      target_language: target,
      lemma: entry.lemma,
      normalized: normalize(entry.lemma),
      pos: entry.pos,
      gender: entry.pos === 'noun' ? (entry.gender ?? null) : null,
      // essere/avere is an Italian thing — never stamp it on other languages
      auxiliary: entry.pos === 'verb' && target === 'it' ? (entry.auxiliary ?? 'avere') : null,
      is_irregular: Boolean(entry.is_irregular),
      cefr: entry.cefr ?? null,
      frequency_rank: null,
      source: 'ai',
    })
    .select('id')
    .single();
  if (insErr) throw new Error(insErr.message);

  // Not silent: an entry with no translation is useless to the learner (a
  // missing `languages` row used to fail this insert unnoticed).
  const { error: trErr } = await supabase.from('lexicon_translations').insert(
    translations.slice(0, 3).map((t, order) => ({
      entry_id: inserted.id,
      source_language: source,
      translation: t,
      sense_order: order,
    })),
  );
  if (trErr) throw new Error(`translations (${source}): ${trErr.message}`);
  return inserted.id as string;
}

/** The row shape the app expects (identical to the search_lexicon RPC). */
// deno-lint-ignore no-explicit-any
async function suggestionRow(supabase: any, entryId: string, source: string) {
  const { data: row } = await supabase
    .from('lexicon_entries')
    .select('id, lemma, pos, gender, auxiliary, cefr')
    .eq('id', entryId)
    .single();
  // Prefer the caller's language, fall back to whatever the entry has
  const { data: tr } = await supabase
    .from('lexicon_translations')
    .select('translation, source_language')
    .eq('entry_id', entryId)
    .order('sense_order');
  const list = (tr ?? []) as { translation: string; source_language: string }[];
  const mine = list.find((t) => t.source_language === source);
  return { ...row, translation: (mine ?? list[0])?.translation ?? null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const bodyIn = await req.json();

    // Action: regenerate inflected forms for a noun/adjective (no DB writes) —
    // the "Re-check with AI" button on non-verb word cards. Fixes irregular /
    // invariable words the rule-based inflection gets wrong (e.g. la radio).
    if (bodyIn.action === 'forms') {
      const lemma = String(bodyIn.lemma ?? '').trim().toLowerCase();
      const pos = bodyIn.pos === 'adj' ? 'adj' : 'noun';
      const gender = bodyIn.gender === 'f' ? 'f' : bodyIn.gender === 'm' ? 'm' : null;
      if (!lemma) {
        return new Response(JSON.stringify({ error: 'invalid lemma' }), {
          status: 400,
          headers: { ...cors, 'content-type': 'application/json' },
        });
      }
      const forms = await inflectForms(lemma, pos, gender);
      return new Response(JSON.stringify({ lemma, pos, forms }), {
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    // Action: regenerate conjugation tables for a verb (no DB writes) — used by
    // the "Re-check with AI" button on the word card.
    if (bodyIn.action === 'conjugate') {
      const lemma = String(bodyIn.lemma ?? '').trim().toLowerCase();
      const aux = bodyIn.auxiliary === 'essere' ? 'essere' : 'avere';
      if (!lemma) {
        return new Response(JSON.stringify({ error: 'invalid lemma' }), {
          status: 400,
          headers: { ...cors, 'content-type': 'application/json' },
        });
      }
      const tenses = await conjugateTables(lemma, aux);
      return new Response(JSON.stringify({ lemma, auxiliary: aux, tenses }), {
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const { lemma: rawLemma, english: rawEnglish, target = 'it', source = 'en' } = bodyIn;
    const fromEnglish = typeof rawEnglish === 'string' && rawEnglish.trim().length > 0;
    const inputTerm = String((fromEnglish ? rawEnglish : rawLemma) ?? '').trim();
    if (!inputTerm || inputTerm.length > 60) {
      return new Response(JSON.stringify({ error: 'invalid input' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }
    const lemma = inputTerm.toLowerCase();
    const LANG_NAME: Record<string, string> = {
      it: 'Italian',
      es: 'Spanish',
      en: 'English',
      tr: 'Turkish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
    };
    const langName = LANG_NAME[target] ?? 'Italian';
    const srcName = LANG_NAME[source] ?? 'English';
    const auxNote =
      target === 'it'
        ? `"auxiliary": "essere"|"avere"|null (verbs only, passato prossimo auxiliary), `
        : `"auxiliary": null, `;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Multi-word input (or an explicit request) is treated as an idiom/phrase:
    // no gender, no conjugation, and the MEANING matters more than the words.
    const isPhrase = bodyIn.kind === 'phrase' || /\s/.test(inputTerm);

    // Other word classes of the same spelling — English "bleach" is both a verb
    // and a noun; the app offers them alongside the sense the user asked for.
    const sensesNote =
      `"other_senses": [{"pos": "...", "gender": "m"|"f"|null, ` +
      (target === 'it' ? `"auxiliary": "essere"|"avere"|null, ` : `"auxiliary": null, `) +
      `"cefr": "A1".."C2", "translations": ["1-2 ${srcName} translations of THIS sense"]}] ` +
      `— other word classes the SAME ${langName} lemma has with a genuinely different ` +
      `meaning (max 2). Use [] when the lemma only works as one word class.`;

    // 1) Classify, in the target language. Two directions:
    //    - target word   → validate + classify it
    //    - English word  → translate to the most common target-language word
    const userPrompt = isPhrase
      ? fromEnglish
        ? `The ${srcName} expression is "${inputTerm}". Give the ${langName} expression a native ` +
          `speaker would actually use for it (an equivalent idiom, not a word-for-word translation). ` +
          `Respond as JSON: ` +
          `{"valid": true|false (false if there is no such ${langName} expression), ` +
          `"lemma": "the ${langName} expression in its canonical dictionary form, lowercase", ` +
          `"pos": "phrase", "gender": null, "auxiliary": null, "is_irregular": false, ` +
          `"cefr": "A1".."C2", ` +
          `"translations": ["what the expression MEANS in ${srcName}, idiomatic first"], ` +
          `"literal": "word-for-word ${srcName} gloss of the ${langName} expression, or null if it is literal", ` +
          `"other_senses": []}`
        : `The ${langName} expression is "${inputTerm}". Respond as JSON: ` +
          `{"valid": true|false (false if this is not something ${langName} speakers say), ` +
          `"lemma": "the expression in its canonical dictionary form, lowercase", ` +
          `"pos": "phrase", "gender": null, "auxiliary": null, "is_irregular": false, ` +
          `"cefr": "A1".."C2", ` +
          `"translations": ["what it MEANS in ${srcName} (idiomatic meaning first, not word-for-word)"], ` +
          `"literal": "word-for-word ${srcName} gloss, or null if the expression is literal", ` +
          `"other_senses": []}`
      : fromEnglish
        ? `The ${srcName} word or phrase is "${inputTerm}". Give the single most common ${langName} ` +
          `dictionary word for it. Respond as JSON: ` +
          `{"valid": true|false (false if not translatable to a real ${langName} word), ` +
          `"lemma": "the ${langName} dictionary form, lowercase, infinitive for verbs, singular for nouns", ` +
          `"pos": "verb"|"noun"|"adj"|"adv"|"prep"|"pron"|"conj"|"interj"|"phrase", ` +
          `"gender": "m"|"f"|null (nouns only), ` +
          auxNote +
          `"is_irregular": true|false, "cefr": "A1".."C2", ` +
          `"translations": ["1-3 accurate ${srcName} translations, including \\"${inputTerm}\\""], ` +
          sensesNote +
          `}`
        : `Analyze the ${langName} word "${inputTerm}". Respond as JSON: ` +
          `{"valid": true|false, "lemma": "dictionary form, lowercase, infinitive for verbs, singular for nouns", ` +
          `"pos": "verb"|"noun"|"adj"|"adv"|"prep"|"pron"|"conj"|"interj"|"phrase", ` +
          `"gender": "m"|"f"|null (nouns only), ` +
          auxNote +
          `"is_irregular": true|false, "cefr": "A1".."C2", ` +
          `"translations": ["1-3 accurate ${srcName} translations"], ` +
          sensesNote +
          `}`;

    const info = await groqJson([
      {
        role: 'system',
        content:
          (isPhrase
            ? `You are an expert ${langName} lexicographer specialising in idioms and set ` +
              `phrases. Reply with valid JSON only. If the input is not a real ${langName} ` +
              `expression, set "valid": false. `
            : `You are an expert ${langName} lexicographer. Reply with valid JSON only. ` +
              `If the input does not map to a real ${langName} dictionary word, set "valid": false. `) +
          // Models drift into a third language when target and source are both
          // non-English ("bleach" for a Turkish speaker came back as Spanish).
          `Every string in "translations" MUST be written in ${srcName} and nothing else. ` +
          `Omit a field entirely rather than filling it with the text "null".`,
      },
      { role: 'user', content: userPrompt },
    ]);

    const translations = cleanTranslations(info.translations);
    if (!info.valid || !info.pos || translations.length === 0) {
      return new Response(JSON.stringify({ error: 'not_a_word' }), {
        status: 404,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const canonical = String(info.lemma ?? lemma).trim().toLowerCase();
    // A multi-word result is a phrase whatever the model called it.
    const pos = /\s/.test(canonical) && isPhrase ? 'phrase' : String(info.pos);
    const literal =
      typeof info.literal === 'string' && info.literal.trim() && info.literal !== 'null'
        ? info.literal.trim()
        : null;

    const entryId = await upsertEntry(supabase, target, source, {
      lemma: canonical,
      pos,
      gender: info.gender as string | null,
      auxiliary: info.auxiliary as string | null,
      is_irregular: Boolean(info.is_irregular),
      cefr: info.cefr as string | null,
      translations,
    });

    // Verbs: conjugation tables (Italian only; other languages store the word
    // and its translation without tables).
    if (pos === 'verb') {
      await ensureConjugations(
        supabase,
        entryId,
        canonical,
        (info.auxiliary as string) ?? 'avere',
        target,
      );
    }

    // Other word classes of the same lemma ("bleach" the verb → "bleach" the
    // noun). Stored so the app can offer them, but WITHOUT conjugation tables:
    // generating those here would double the wait for a sense nobody may pick.
    // ensureConjugations backfills them if the user enriches that sense later.
    const alternatives: unknown[] = [];
    const rawSenses = Array.isArray(info.other_senses) ? info.other_senses : [];
    for (const sense of rawSenses.slice(0, 2)) {
      const s = sense as Record<string, unknown>;
      const sPos = String(s.pos ?? '').trim();
      const sTranslations = cleanTranslations(s.translations);
      if (!sPos || sPos === pos || sTranslations.length === 0) continue;
      try {
        const altId = await upsertEntry(supabase, target, source, {
          lemma: canonical,
          pos: sPos,
          gender: (s.gender as string) ?? null,
          auxiliary: (s.auxiliary as string) ?? null,
          cefr: (s.cefr as string) ?? null,
          translations: sTranslations,
        });
        alternatives.push(await suggestionRow(supabase, altId, source));
      } catch (_) {
        /* a bad extra sense must never fail the word the user asked for */
      }
    }

    // Return in the same shape as the search_lexicon RPC row
    const row = await suggestionRow(supabase, entryId, source);

    return new Response(JSON.stringify({ ...row, literal, alternatives }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
