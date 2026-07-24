// Generate conjugation tables for all seed verbs in the base lexicon via Claude,
// and store them in the `conjugations` table (linked to lexicon_entries).
// Usage: node scripts/generate-conjugations.mjs   (reads .env; idempotent — skips
// verbs that already have conjugations)

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* rely on exported vars */
  }
}
loadEnv(resolve(process.cwd(), '.env'));

const { EXPO_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
// Provider: Groq (free tier) when GROQ_API_KEY is set, else Anthropic
const USE_GROQ = Boolean(process.env.GROQ_API_KEY);
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
if (!url || !serviceKey || (!USE_GROQ && !process.env.ANTHROPIC_API_KEY)) {
  console.error('Missing env — need Supabase vars plus GROQ_API_KEY or ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const anthropic = USE_GROQ ? null : new Anthropic(); // reads ANTHROPIC_API_KEY
console.log(`provider: ${USE_GROQ ? `groq (${GROQ_MODEL})` : 'anthropic (claude-opus-4-8)'}`);

// Keep in sync with src/lib/italian.ts
const TENSES = [
  'presente',
  'passato_prossimo',
  'imperfetto',
  'futuro_semplice',
  'condizionale_presente',
  'congiuntivo_presente',
];
const COMPOUND_TENSES = new Set(['passato_prossimo']);
const PERSONS = ['io', 'tu', 'lui_lei', 'noi', 'voi', 'loro'];

const personSchema = {
  type: 'object',
  additionalProperties: false,
  required: PERSONS,
  properties: Object.fromEntries(PERSONS.map((p) => [p, { type: 'string' }])),
};

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tenses'],
  properties: {
    tenses: {
      type: 'object',
      additionalProperties: false,
      required: TENSES,
      properties: Object.fromEntries(TENSES.map((t) => [t, personSchema])),
    },
  },
};

function buildPrompt(verb) {
  const reflexive = /rsi$/.test(verb.lemma);
  return (
    `Conjugate the Italian verb "${verb.lemma}" (auxiliary: ${verb.auxiliary}) ` +
    `in indicativo ${TENSES.join(', ')} (condizionale_presente = condizionale, ` +
    `congiuntivo_presente = congiuntivo) for all six persons. ` +
    `For passato_prossimo give the full compound form (e.g. "ho avuto", "è andato" — ` +
    `use masculine singular participle agreement for essere verbs, "sono andato" for io). ` +
    (reflexive
      ? `This is a REFLEXIVE verb: include the reflexive pronoun in every form ` +
        `(e.g. "mi avvicino", "ti avvicini"; passato prossimo with essere: "mi sono avvicinato"). `
      : `Do not include subject pronouns inside the forms. `) +
    `Return only the conjugation forms.`
  );
}

function validate(parsed, verb) {
  for (const t of TENSES)
    for (const p of PERSONS)
      if (!parsed.tenses?.[t]?.[p]?.trim()) throw new Error(`missing ${t}/${p} for ${verb.lemma}`);
  return parsed.tenses;
}

async function conjugateAnthropic(verb) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2500,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: outputSchema } },
    messages: [{ role: 'user', content: buildPrompt(verb) }],
  });
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  return validate(JSON.parse(text), verb);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function conjugateGroq(verb, attempt = 1) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an expert Italian grammarian. Reply with valid JSON only, exactly in the requested shape.',
        },
        {
          role: 'user',
          content:
            buildPrompt(verb) +
            ` Respond as JSON: {"tenses": {${TENSES.map((t) => `"${t}": {"io": "...", "tu": "...", "lui_lei": "...", "noi": "...", "voi": "...", "loro": "..."}`).join(', ')}}}`,
        },
      ],
    }),
  });
  if (res.status === 429 && attempt <= 5) {
    // Free-tier rate limit — honor retry-after (default 15s)
    const wait = Number(res.headers.get('retry-after') ?? 15) * 1000;
    await sleep(wait);
    return conjugateGroq(verb, attempt + 1);
  }
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  try {
    return validate(JSON.parse(data.choices[0].message.content), verb);
  } catch (e) {
    if (attempt <= 2) return conjugateGroq(verb, attempt + 1); // malformed shape — one retry
    throw e;
  }
}

const conjugate = (verb) => (USE_GROQ ? conjugateGroq(verb) : conjugateAnthropic(verb));

// ── main ─────────────────────────────────────────────────────────────────────
const { data: verbs, error: vErr } = await supabase
  .from('lexicon_entries')
  .select('id, lemma, auxiliary')
  .eq('target_language', 'it')
  .eq('pos', 'verb')
  .order('frequency_rank');
if (vErr) throw new Error(vErr.message);

// Skip verbs that already have conjugations (idempotent re-runs).
// NOTE: page through results — PostgREST caps a single select at 1000 rows,
// which once silently truncated this set and caused duplicate-key retries.
const done = new Set();
for (let from = 0; ; from += 1000) {
  const { data: page, error: pageErr } = await supabase
    .from('conjugations')
    .select('lexicon_ref')
    .not('lexicon_ref', 'is', null)
    .range(from, from + 999);
  if (pageErr) throw new Error(pageErr.message);
  for (const r of page ?? []) done.add(r.lexicon_ref);
  if (!page || page.length < 1000) break;
}
const todo = verbs.filter((v) => !done.has(v.id));
console.log(`${verbs.length} verbs, ${todo.length} to generate…`);

let ok = 0,
  failed = 0;
const CONCURRENCY = 3;
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  const batch = todo.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (verb) => {
      try {
        const tenses = await conjugate(verb);
        const rows = TENSES.flatMap((tense) =>
          PERSONS.map((person) => ({
            lexicon_ref: verb.id,
            tense,
            mood: 'indicativo',
            person,
            form: tenses[tense][person].trim(),
            is_compound: COMPOUND_TENSES.has(tense),
            source: 'ai',
          })),
        );
        const { error } = await supabase.from('conjugations').insert(rows);
        if (error) throw new Error(error.message);
        ok++;
        console.log(`✓ ${verb.lemma} (${ok + failed}/${todo.length})`);
      } catch (e) {
        failed++;
        console.error(`✗ ${verb.lemma}: ${e.message}`);
      }
    }),
  );
}
console.log(`Done: ${ok} generated, ${failed} failed.`);

// Spot check
const { data: probe } = await supabase
  .from('conjugations')
  .select('person, form, lexicon_entries!inner(lemma)')
  .eq('tense', 'presente')
  .eq('lexicon_entries.lemma', 'avere');
console.log('avere presente →', (probe ?? []).map((r) => `${r.person}:${r.form}`).join(' '));
