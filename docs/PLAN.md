# Dictinho — Yol Haritası & Durum

Onaylanan mimari kararlar:
1. Expo (React Native) + TypeScript + Expo Router
2. Supabase (Postgres) — autocomplete için `pg_trgm`, base lexicon, auth
3. Hibrit veri: seed'lenmiş base İtalyanca lexicon (anlık typeahead) + Claude API
   ile zenginleştirme (anlam/tür/auxiliary + çekim tablosu + örnek cümle)
4. Supabase Auth baştan; login ekranı akış sonunda
5. TTS modüler `SpeechService` (no-op → expo-speech, Faz 7)

## Fazlar

### ✅ Faz 0 — İskele (2026-07-23)
- Expo SDK 57 + TS + Expo Router + NativeWind kurulumu
- `src/theme/tokens.ts` (design-reference.png paleti), dark tema, 4 tab iskeleti
- `SpeechService` interface (no-op), `.env.example`, docs

### ⬜ Faz 1 — Veri katmanı (SIRADA)
- Supabase şeması (migration SQL, `docs/DATABASE.md`), RLS
- `pg_trgm` + `unaccent` extension'ları, `search_lexicon` RPC
- Seed script: frekans sıralı ~2-5k İtalyanca lemma (açık veri seti)
- TanStack Query client + `src/lib/supabase.ts` + zod şemaları (`src/lib/schemas.ts`)
- Önkoşul: kullanıcıdan Supabase projesi + Claude API key (.env.example listesi)

### ⬜ Faz 2 — Kelime ekleme + autocomplete
- `word/add.tsx` modal formu; 200ms debounce → `search_lexicon` → öneri listesi
- Edge Function `enrich-word` (Claude proxy) → pos/anlam/auxiliary otomatik dolum
- Tag sistemi (tema + CEFR) + ana listede filtre; deck kartları gerçek tag'lere bağlanır

### ⬜ Faz 3 — Fiiller & çekim
- essere/avere rozeti, zaman seçici çipler
- Edge Function `generate-conjugations` → `conjugations` tablosu
- `verb/[id].tsx` çekim modalı (sekmeli zaman tablosu, io..loro)

### ⬜ Faz 4 — Örnek cümleler
- Edge Function `generate-sentences` → `example_sentences`; detay ekranında gösterim

### ⬜ Faz 5 — SRS
- SM-2 (`src/lib/srs.ts`), `srs_cards` due sorgusu, `srs/index.tsx` flashcard UI
- Again/Hard/Good/Easy → ease/interval güncelleme, `srs_reviews` log

### ⬜ Faz 6 — Auth + polish
- Supabase Auth login, onboarding dil seçimi ekranı
- Stats/Performance ekranı, streak/gem gamification, animasyon cilası

### ⬜ Faz 7 — Gelecek
- TTS (expo-speech ile `SpeechService` implementasyonu)
- Offline SQLite mirror (expo-sqlite), çoklu dil çifti

## API / JSON şekilleri (referans)

### Autocomplete — `search_lexicon(q, target, limit)`
```json
[{ "id": "...", "lemma": "avere", "pos": "verb", "auxiliary": "avere",
   "cefr": "A1", "translation": "to have" }]
```

### `enrich-word` → istek `{lemma, target, source}`
```json
{ "lemma": "avere", "pos": "verb", "auxiliary": "avere", "gender": null,
  "is_irregular": true, "cefr": "A1", "translations": ["to have", "to own"],
  "suggested_tenses": ["presente", "passato_prossimo", "imperfetto", "futuro_semplice"] }
```

### `generate-conjugations` → istek `{lemma, tenses[]}`
```json
{ "lemma": "avere", "auxiliary": "avere",
  "tenses": {
    "presente": { "io": "ho", "tu": "hai", "lui_lei": "ha",
                  "noi": "abbiamo", "voi": "avete", "loro": "hanno" },
    "passato_prossimo": { "compound": true, "aux": "avere",
                          "io": "ho avuto", "tu": "hai avuto", "lui_lei": "ha avuto",
                          "noi": "abbiamo avuto", "voi": "avete avuto", "loro": "hanno avuto" }
  } }
```

### `generate-sentences` → istek `{lemma, tense, count}`
```json
[{ "target_text": "Ho una macchina nuova.", "source_text": "I have a new car.",
   "tense": "presente" }]
```

## Doğrulama kriterleri (her faz sonunda)

- `tsc --noEmit` + Expo web tarayıcıda gerçek akış tıklama (claude-in-chrome)
- Autocomplete: "ave" → "avere/avvertire" önerileri
- Fiil: "avere" seç → auxiliary rozeti + io..loro çekim tablosu
- SRS: derecelendirme → `due_at` ilerlemesi
- Placeholder/çevrilmemiş metin grep taraması; RLS: yabancı user_id verisi görünmemeli
