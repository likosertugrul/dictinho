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

    // 1) Classify, in the target language. Two directions:
    //    - target word   → validate + classify it
    //    - English word  → translate to the most common target-language word
    const userPrompt = fromEnglish
      ? `The ${srcName} word or phrase is "${inputTerm}". Give the single most common ${langName} ` +
        `dictionary word for it. Respond as JSON: ` +
        `{"valid": true|false (false if not translatable to a real ${langName} word), ` +
        `"lemma": "the ${langName} dictionary form, lowercase, infinitive for verbs, singular for nouns", ` +
        `"pos": "verb"|"noun"|"adj"|"adv"|"prep"|"pron"|"conj"|"interj"|"phrase", ` +
        `"gender": "m"|"f"|null (nouns only), ` +
        auxNote +
        `"is_irregular": true|false, "cefr": "A1".."C2", ` +
        `"translations": ["1-3 accurate ${srcName} translations, including \\"${inputTerm}\\""]}`
      : `Analyze the ${langName} word "${inputTerm}". Respond as JSON: ` +
        `{"valid": true|false, "lemma": "dictionary form, lowercase, infinitive for verbs, singular for nouns", ` +
        `"pos": "verb"|"noun"|"adj"|"adv"|"prep"|"pron"|"conj"|"interj"|"phrase", ` +
        `"gender": "m"|"f"|null (nouns only), ` +
        auxNote +
        `"is_irregular": true|false, "cefr": "A1".."C2", ` +
        `"translations": ["1-3 accurate ${srcName} translations"]}`;

    const info = await groqJson([
      {
        role: 'system',
        content:
          `You are an expert ${langName} lexicographer. Reply with valid JSON only. ` +
          `If the input does not map to a real ${langName} dictionary word, set "valid": false.`,
      },
      { role: 'user', content: userPrompt },
    ]);

    if (!info.valid || !info.pos || !Array.isArray(info.translations) || !info.translations.length) {
      return new Response(JSON.stringify({ error: 'not_a_word' }), {
        status: 404,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const canonical = String(info.lemma ?? lemma).trim().toLowerCase();
    const pos = String(info.pos);

    // Already in the lexicon? Return it (idempotent).
    const { data: existing } = await supabase
      .from('lexicon_entries')
      .select('id')
      .eq('target_language', target)
      .eq('lemma', canonical)
      .eq('pos', pos)
      .maybeSingle();

    let entryId = existing?.id as string | undefined;

    if (!entryId) {
      const { data: inserted, error: insErr } = await supabase
        .from('lexicon_entries')
        .insert({
          target_language: target,
          lemma: canonical,
          normalized: normalize(canonical),
          pos,
          gender: pos === 'noun' ? (info.gender ?? null) : null,
          auxiliary: pos === 'verb' ? (info.auxiliary ?? 'avere') : null,
          is_irregular: Boolean(info.is_irregular),
          cefr: info.cefr ?? null,
          frequency_rank: null,
          source: 'ai',
        })
        .select('id')
        .single();
      if (insErr) throw new Error(insErr.message);
      entryId = inserted.id;

      await supabase.from('lexicon_translations').insert(
        (info.translations as string[]).slice(0, 3).map((t, order) => ({
          entry_id: entryId,
          source_language: source,
          translation: String(t).trim(),
          sense_order: order,
        })),
      );

      // 2) Verbs: generate + store conjugation tables (Italian only; other
      //    languages currently store word + translation without tables)
      if (pos === 'verb' && target === 'it') {
        const aux = (info.auxiliary ?? 'avere') as string;
        const reflexive = /rsi$/.test(canonical);
        const conjMessages = [
          {
            role: 'system',
            content: 'You are an expert Italian grammarian. Reply with valid JSON only.',
          },
          {
            role: 'user',
            content:
              `Conjugate "${canonical}" (auxiliary: ${aux}) in indicativo ${TENSES.join(', ')} ` +
              `(condizionale_presente = condizionale, congiuntivo_presente = congiuntivo) for all six persons. ` +
              `passato_prossimo: full compound form with masculine agreement (io: "${aux === 'essere' ? 'sono ...ato' : 'ho ...ato'}"). ` +
              (reflexive
                ? 'This is REFLEXIVE: include the reflexive pronoun in every form. '
                : 'No subject pronouns inside the forms. ') +
              `Respond as JSON: {"tenses": {${TENSES.map((t) => `"${t}": {${PERSONS.map((p) => `"${p}":"..."`).join(',')}}`).join(',')}}}`,
          },
        ];

        // Retry until every tense/person is present (bulk jobs can rate-limit us)
        let rows: unknown[] = [];
        for (let attempt = 1; attempt <= 3 && rows.length < TENSES.length * PERSONS.length; attempt++) {
          try {
            const conj = await groqJson(conjMessages);
            const tenses = (conj.tenses ?? {}) as Record<string, Record<string, string>>;
            const complete = TENSES.every((t) => PERSONS.every((p) => tenses[t]?.[p]?.trim()));
            if (!complete) continue;
            rows = TENSES.flatMap((t) =>
              PERSONS.map((p) => ({
                lexicon_ref: entryId,
                tense: t,
                mood: 'indicativo',
                person: p,
                form: tenses[t][p].trim(),
                is_compound: COMPOUND.has(t),
                source: 'ai',
              })),
            );
          } catch (_) {
            /* retry */
          }
        }
        // Only insert a complete set — a partial table is worse than none
        // (the app's rule-based fallback fills regular verbs on save otherwise)
        if (rows.length === TENSES.length * PERSONS.length) {
          await supabase.from('conjugations').insert(rows);
        }
      }
    }

    // Return in the same shape as the search_lexicon RPC row
    const { data: row } = await supabase
      .from('lexicon_entries')
      .select('id, lemma, pos, gender, auxiliary, cefr')
      .eq('id', entryId)
      .single();
    const { data: tr } = await supabase
      .from('lexicon_translations')
      .select('translation')
      .eq('entry_id', entryId)
      .order('sense_order')
      .limit(1);

    return new Response(
      JSON.stringify({ ...row, translation: tr?.[0]?.translation ?? null }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
