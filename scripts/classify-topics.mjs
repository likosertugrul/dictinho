#!/usr/bin/env node
// Backfill `topic` on lexicon entries (and personal words that have no lexicon
// entry behind them) with Groq. Idempotent: only rows where topic is null are
// touched, so it can be re-run after an interruption.
//
//   node scripts/classify-topics.mjs            # lexicon, then orphan user words
//   node scripts/classify-topics.mjs --lexicon  # lexicon only
//   node scripts/classify-topics.mjs --words    # personal words only
//
// Needs GROQ_API_KEY + SUPABASE_URL/SERVICE_ROLE_KEY in .env.

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_KEY = env.GROQ_API_KEY;
if (!URL_BASE || !KEY || !GROQ_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GROQ_API_KEY');
  process.exit(1);
}

// Keep in sync with src/lib/topics.ts
const TOPICS = [
  'food', 'family', 'home', 'body', 'clothing', 'travel', 'city', 'nature',
  'animals', 'work', 'school', 'technology', 'sports', 'time', 'numbers',
  'emotions', 'communication', 'daily', 'other',
];

const BATCH = 40;
const rest = (path, init = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...init.headers },
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function groqJson(messages, attempt = 1) {
  const model = attempt >= 3 ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${GROQ_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages }),
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(Math.min(Number(res.headers.get('retry-after') ?? 5), 20) * 1000);
    return groqJson(messages, attempt + 1);
  }
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return JSON.parse((await res.json()).choices[0].message.content);
}

/** Ask for {lemma-index: topic} so a wrong lemma echo can't corrupt the mapping. */
async function classify(items, langName) {
  const list = items.map((w, i) => `${i}. ${w.lemma} (${w.pos}) = ${w.translation ?? '?'}`).join('\n');
  const out = await groqJson([
    {
      role: 'system',
      content:
        'You sort vocabulary into fixed theme buckets for a language-learning app. ' +
        'Reply with valid JSON only.',
    },
    {
      role: 'user',
      content:
        `Assign each ${langName} word below exactly one topic from this list:\n` +
        `${TOPICS.join(', ')}\n\n` +
        `Rules: pick the theme a learner would file the word under. Generic verbs and ` +
        `everyday actions go to "daily". Abstract words with no better fit go to "other". ` +
        `Use "other" sparingly.\n\n${list}\n\n` +
        `Respond as JSON: {"topics": {"0": "food", "1": "travel", ...}} with one entry per number.`,
    },
  ]);
  const map = out.topics ?? out;
  return items.map((w, i) => {
    const t = String(map?.[String(i)] ?? map?.[i] ?? '').trim().toLowerCase();
    return { ...w, topic: TOPICS.includes(t) ? t : 'other' };
  });
}

async function page(table, select, extraFilter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await rest(`${table}?${select}&${extraFilter}&limit=1000&offset=${from}`);
    if (!res.ok) throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 150)}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

const LANG_NAME = { it: 'Italian', es: 'Spanish', en: 'English' };

async function run(table) {
  const isLexicon = table === 'lexicon_entries';
  const select = isLexicon
    ? 'select=id,lemma,pos,target_language'
    : 'select=id,lemma,pos,translation,target_language';
  const filter = isLexicon ? 'topic=is.null' : 'topic=is.null&lexicon_ref=is.null';
  const rows = await page(table, select, filter);
  console.log(`${table}: ${rows.length} row(s) without a topic`);
  if (rows.length === 0) return;

  // Lexicon rows need their translation for context; fetch in one go
  if (isLexicon) {
    const translations = await page(
      'lexicon_translations',
      'select=entry_id,translation,sense_order',
      'sense_order=eq.0',
    );
    const byEntry = new Map(translations.map((t) => [t.entry_id, t.translation]));
    for (const r of rows) r.translation = byEntry.get(r.id) ?? null;
  }

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const lang = LANG_NAME[slice[0].target_language] ?? 'Italian';
    let classified;
    try {
      classified = await classify(slice, lang);
    } catch (e) {
      console.warn(`  batch ${i / BATCH + 1} failed (${e.message}) — retrying once`);
      await sleep(3000);
      classified = await classify(slice, lang);
    }
    // One PATCH per topic bucket keeps the request count low
    const byTopic = new Map();
    for (const r of classified) {
      if (!byTopic.has(r.topic)) byTopic.set(r.topic, []);
      byTopic.get(r.topic).push(r.id);
    }
    for (const [topic, ids] of byTopic) {
      const res = await rest(`${table}?id=in.(${ids.join(',')})`, {
        method: 'PATCH',
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) throw new Error(`patch ${topic}: ${res.status} ${(await res.text()).slice(0, 150)}`);
    }
    done += slice.length;
    process.stdout.write(`\r  ${done}/${rows.length} classified`);
  }
  console.log('');
}

const only = process.argv.slice(2);
if (only.length === 0 || only.includes('--lexicon')) await run('lexicon_entries');
if (only.length === 0 || only.includes('--words')) await run('user_words');

// Personal words inherit the topic of the lexicon entry they came from
const res = await rest('rpc/backfill_user_word_topics', { method: 'POST', body: '{}' });
if (res.status === 404) {
  console.log('\n(no backfill RPC — run migration 0016 to copy lexicon topics onto user words)');
} else if (!res.ok) {
  console.warn('backfill rpc:', res.status, (await res.text()).slice(0, 200));
} else {
  console.log('user_words topics backfilled from the lexicon:', await res.text());
}
console.log('done');
