// Upsert a curated list of common verbs into the base lexicon.
// Usage: node scripts/add-verbs.mjs [path-to-json]  (default: data/seed/extra_verbs.json)
// Follow with: node scripts/generate-conjugations.mjs  (fills tables for new verbs)

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
if (!url || !serviceKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}
const supabase = createClient(url, serviceKey);

const normalize = (s) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const file = process.argv[2] || 'data/seed/extra_verbs.json';
const verbs = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
console.log(`Upserting ${verbs.length} verbs from ${file}…`);

let added = 0;
for (const v of verbs) {
  const { data: entry, error } = await supabase
    .from('lexicon_entries')
    .upsert(
      {
        target_language: 'it',
        lemma: v.lemma.trim().toLowerCase(),
        normalized: normalize(v.lemma),
        pos: 'verb',
        gender: null,
        auxiliary: v.auxiliary,
        is_irregular: v.is_irregular ?? false,
        cefr: v.cefr ?? null,
        frequency_rank: null,
        source: 'seed',
      },
      { onConflict: 'target_language,lemma,pos' },
    )
    .select('id')
    .single();
  if (error) {
    console.error(`✗ ${v.lemma}: ${error.message}`);
    continue;
  }
  await supabase.from('lexicon_translations').delete().eq('entry_id', entry.id);
  await supabase.from('lexicon_translations').insert(
    v.translations.map((t, order) => ({
      entry_id: entry.id,
      source_language: 'en',
      translation: t,
      sense_order: order,
    })),
  );
  added++;
}
console.log(`Done: ${added}/${verbs.length} verbs upserted.`);
