// Pre-generate example sentences for every base-lexicon entry via Groq
// (free tier). Two sentences per word; verbs get one presente + one
// passato_prossimo. Idempotent: skips entries that already have sentences.
// Usage: node scripts/generate-sentences.mjs

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

const { EXPO_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, GROQ_API_KEY } = process.env;
if (!url || !serviceKey || !GROQ_API_KEY) {
  console.error('Missing env — need Supabase vars + GROQ_API_KEY');
  process.exit(1);
}
const supabase = createClient(url, serviceKey);
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const BATCH_SIZE = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function groqJson(messages, attempt = 1) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  if (res.status === 429 && attempt <= 6) {
    const wait = Number(res.headers.get('retry-after') ?? 15) * 1000;
    await sleep(wait);
    return groqJson(messages, attempt + 1);
  }
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function generateBatch(entries) {
  const list = entries
    .map(
      (e, i) =>
        `${i}: "${e.lemma}" (${e.pos}${e.translation ? `, meaning: ${e.translation}` : ''})`,
    )
    .join('\n');
  const parsed = await groqJson([
    {
      role: 'system',
      content:
        'You write simple, natural Italian example sentences for language learners (CEFR A1-B1) with accurate English translations. Reply with valid JSON only.',
    },
    {
      role: 'user',
      content:
        `For each Italian word below, write 2 short example sentences using that word, with English translations.\n` +
        `For VERBS: sentence 1 in presente, sentence 2 in passato prossimo (set "tense" accordingly).\n` +
        `For all other words: everyday sentences, "tense" must be null.\n\n${list}\n\n` +
        `Respond as JSON: {"items": [{"index": 0, "sentences": [{"it": "...", "en": "...", "tense": "presente"|"passato_prossimo"|null}, {...}]}, ...]} ` +
        `— one item per input line, keep the given index.`,
    },
  ]);
  return parsed.items ?? [];
}

// ── main ─────────────────────────────────────────────────────────────────────
// All lexicon entries with their first translation (paged past the 1000-row cap)
const entries = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from('lexicon_entries')
    .select('id, lemma, pos, lexicon_translations(translation, sense_order)')
    .order('frequency_rank', { nullsFirst: false })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const e of data ?? [])
    entries.push({
      id: e.id,
      lemma: e.lemma,
      pos: e.pos,
      translation: (e.lexicon_translations ?? []).sort((a, b) => a.sense_order - b.sense_order)[0]
        ?.translation,
    });
  if (!data || data.length < 1000) break;
}

// Skip entries that already have sentences (paged)
const done = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from('example_sentences')
    .select('lexicon_ref')
    .not('lexicon_ref', 'is', null)
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) done.add(r.lexicon_ref);
  if (!data || data.length < 1000) break;
}
const todo = entries.filter((e) => !done.has(e.id));
console.log(`${entries.length} entries, ${todo.length} need sentences…`);

let ok = 0,
  failed = 0;
const CONCURRENCY = 2;
const batches = [];
for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));

for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const group = batches.slice(i, i + CONCURRENCY);
  await Promise.all(
    group.map(async (batch) => {
      try {
        const items = await generateBatch(batch);
        const rows = [];
        for (const item of items) {
          const entry = batch[item.index];
          if (!entry) continue;
          for (const s of (item.sentences ?? []).slice(0, 2)) {
            if (!s?.it?.trim() || !s?.en?.trim()) continue;
            rows.push({
              lexicon_ref: entry.id,
              target_text: s.it.trim(),
              source_text: s.en.trim(),
              tense: s.tense === 'presente' || s.tense === 'passato_prossimo' ? s.tense : null,
              source: 'ai',
            });
          }
        }
        if (rows.length) {
          const { error } = await supabase.from('example_sentences').insert(rows);
          if (error) throw new Error(error.message);
        }
        ok += rows.length;
      } catch (e) {
        failed++;
        console.error(`✗ batch [${batch.map((b) => b.lemma).slice(0, 3).join(',')}…]: ${e.message}`);
      }
    }),
  );
  if (i % 10 === 0) console.log(`progress: batch ${i + group.length}/${batches.length}, ${ok} sentences`);
}

const { count } = await supabase
  .from('example_sentences')
  .select('*', { count: 'exact', head: true })
  .not('lexicon_ref', 'is', null);
console.log(`Done: +${ok} sentences inserted, ${failed} failed batches. Total: ${count} sentences.`);
