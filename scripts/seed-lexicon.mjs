// Seed the base Italian lexicon into Supabase.
// Usage: node scripts/seed-lexicon.mjs   (reads .env in project root)
// Requires: EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role,
// because lexicon_* tables are write-protected by RLS).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// -- tiny .env loader (no extra dependency) -----------------------------------
function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env optional if vars already exported */
  }
}
loadEnv(resolve(process.cwd(), '.env'));

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example)');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

/** lower + strip diacritics — MUST match the RPC's lower(unaccent(...)) behaviour */
const normalize = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const entries = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/seed/it_lexicon.json'), 'utf8'),
);

console.log(`Seeding ${entries.length} lexicon entries…`);

let ok = 0;
for (const [i, e] of entries.entries()) {
  const { data: entry, error } = await supabase
    .from('lexicon_entries')
    .upsert(
      {
        target_language: 'it',
        lemma: e.lemma,
        normalized: normalize(e.lemma),
        pos: e.pos,
        gender: e.gender ?? null,
        auxiliary: e.auxiliary ?? null,
        is_irregular: e.is_irregular ?? false,
        cefr: e.cefr ?? null,
        frequency_rank: i + 1, // seed file is ordered by frequency
        source: 'seed',
      },
      { onConflict: 'target_language,lemma,pos' },
    )
    .select('id')
    .single();

  if (error) {
    console.error(`✗ ${e.lemma} (${e.pos}):`, error.message);
    continue;
  }

  // Replace translations idempotently
  await supabase.from('lexicon_translations').delete().eq('entry_id', entry.id);
  const { error: trError } = await supabase.from('lexicon_translations').insert(
    e.translations.map((t, order) => ({
      entry_id: entry.id,
      source_language: 'en',
      translation: t,
      sense_order: order,
    })),
  );
  if (trError) {
    console.error(`✗ translations for ${e.lemma}:`, trError.message);
    continue;
  }
  ok++;
}

console.log(`Done: ${ok}/${entries.length} entries seeded.`);

// Smoke test the autocomplete RPC
const { data: probe, error: probeErr } = await supabase.rpc('search_lexicon', {
  q: 'ave',
  target: 'it',
  max_results: 5,
});
if (probeErr) console.error('RPC probe failed:', probeErr.message);
else console.log('search_lexicon("ave") →', probe.map((r) => r.lemma).join(', '));
