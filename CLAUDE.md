# Dictinho — Personal Language Learning & Dictionary App

@AGENTS.md

Mobile-first İtalyanca öğrenme/sözlük uygulaması. İlk dil çifti **EN → IT**;
şema i18n-ready (`source_language` / `target_language`).

## Stack

- **Expo SDK 54** (RN 0.81, React 19.1) + TypeScript + **Expo Router 6** (typed routes açık)
  — SDK 54'e sabit: kullanıcının Expo Go client'ı (1017756) bu sürümü destekliyor, YÜKSELTME
- `babel-preset-expo` devDependency olarak açıkça ekli (SDK 54'te hoist edilmiyor)
- **NativeWind 4** (Tailwind 3) — renkler `tailwind.config.js` ↔ `src/theme/tokens.ts` SENKRON tutulur
- **Supabase** (Postgres + Auth + Edge Functions) — henüz bağlanmadı (Faz 1)
- **Claude API** — sadece Edge Function proxy üzerinden (`enrich-word`, `generate-conjugations`, `generate-sentences`); anahtar asla client'a girmez
- TanStack Query + Zustand, react-hook-form + zod, react-native-reanimated
- TTS: `src/services/speech.ts` — UI yalnızca `SpeechService` interface'ine bağımlı olmalı (Faz 7'de expo-speech)

## Komutlar

- `npm run web` / `ios` / `android` — dev server (port 8081)
- `npx tsc --noEmit` — tip kontrolü (Stop hook zaten çalıştırıyor)
- Dev server yeniden başlatma: `~/.claude/scripts/dev-restart.sh 8081`

## Yapı

```
src/app/            Expo Router ekranları
  (tabs)/           index (Home deck), stats, profile, settings
  word/add.tsx      (Faz 2, modal) autocomplete'li ekleme
  verb/[id].tsx     (Faz 3, modal) çekim tablosu
  srs/index.tsx     (Faz 5) flashcard
src/theme/tokens.ts Design token'ları (tek kaynak; tailwind.config.js aynada)
src/services/       speech.ts (TTS soyutlaması)
src/lib/            (Faz 1+) supabase client, schemas.ts (zod), srs.ts (SM-2)
docs/               PLAN.md (yol haritası+durum), DATABASE.md (şema), DESIGN.md
supabase/           (Faz 1+) migrations, edge functions
```

## Tasarım dili (docs/design-reference.png)

Dark-first: bg `#141414`, surface `#1E1E1E`, primary mercan `#F5654E`,
pastel deck kartları (cream/yellow/mint/blush) üstünde siyah metin,
radius: card 24 / pill, 4pt spacing grid. Detay: `docs/DESIGN.md`.
UI dili **İngilizce** (kullanıcı EN→IT öğreniyor); kod/commit İngilizce.

## Kurallar

- Kelime türleri: `verb|noun|adj|adv|prep|...`; fiillerde `auxiliary: essere|avere`.
- Şahıs anahtarları her yerde: `io, tu, lui_lei, noi, voi, loro`.
- Zaman anahtarları: `presente, passato_prossimo, imperfetto, futuro_semplice, ...`
  (snake_case, İtalyanca adlar) — DB, API JSON ve UI aynı anahtarları kullanır.
- Base lexicon (herkese açık) ile kişisel `user_words` ayrı tablolar; şema için `docs/DATABASE.md`.
- Her faz sonu doğrulama: tsc + Expo web'i tarayıcıda gerçekten tıklayarak kontrol.

## Durum (2026-07-23)

- ✅ Faz 0: iskelet (SDK 54), NativeWind, tema token'ları, 4 tab, SpeechService no-op
- ✅ Faz 1: `.env` dolu ve doğrulandı (`scripts/check-env.mjs`), migration'lar uygulandı
  (0001 şema + 0002 search tuning; `supabase db push --db-url`), seed 228/228,
  `search_lexicon` canlı: "ave" → avere, avvertire. Tipler: `src/lib/database.types.ts`
  **elle bakımlı** — migration değişince güncelle (Docker yok, gen types çalışmıyor)
- ✅ Faz 2 (çekirdek): autocomplete + word/add modalı + Home "My words" (POS filtre
  barlı) — kullanıcı tarayıcı+mobilde doğruladı; anonim auth aktif. Kalan: enrich-word
  Edge Function (lexicon dışı kelimeler için AI zenginleştirme) + tema tag'leri
- ✅ Faz 3: fiil çekimleri — `scripts/generate-conjugations.mjs` (Claude opus-4-8,
  structured output) 80 seed fiil × 6 zaman × 6 şahıs (2880 satır) üretti, 0 hata;
  spot-check (essere/andare/fare + essere-aux çoğul uyumu) doğru. Add formunda tense
  çipleri (varsayılan Presente+Passato Prossimo); kayıtta seçili zamanlar user_word'e
  kopyalanıyor (lexicon dışı düzenli fiillerde `src/lib/conjugator.ts` fallback,
  source='rule'); `word/[id]` modalı sekmeli çekim tablosu; listeden fiile tıkla → modal.
  RLS'li uçtan uca akış Node simülasyonuyla doğrulandı (12 satır kopya + cascade delete)
- ✅ Ekstralar: kelime upsert/birleştirme + unique index (0003), not düzenleme,
  tense ekle/çıkar, kelime silme, POS filtre + çift yönlü sıralama, isimlerde artikel
  (0004: RPC gender + backfill), EN→IT ters arama (0005: `search_lexicon_en`),
  lexicon genişletme 228→942 (`scripts/expand-lexicon.mjs`)
- ✅ AI üretimi Groq'a taşındı (`GROQ_API_KEY` varsa Groq `llama-3.3-70b-versatile`,
  yoksa Anthropic; ücretsiz tier) — kalan 75 fiil çekimi tamamlandı (191 fiil × 36 =
  6876 satır; dönüşlü fiiller `-rsi` dahil, spot-check temiz). Anthropic kredisi bitik
- ✅ Login (Faz 6 çekirdeği): Profile sekmesi = hesap ekranı; misafir(anonim)→kalıcı
  dönüşüm `updateUser({email,password})` ile veri kaybısız; sign in/out; auth
  değişiminde query invalidation (`use-auth.ts`). Dashboard'da "Confirm email" KAPALI
- 🟡 Faz 4: cümle üretimi `scripts/generate-sentences.mjs` (Groq, batch'li, idempotent)
  arka planda; UI hazır (detayda Examples bölümü, tense rozetli)
- ✅ Responsive web (2026-08-06): `src/hooks/use-responsive.ts` (breakpoint'ler
  md 768 / lg 1024 / xl 1360, `MAX_W`, `useColumns`) + `src/components/container.tsx`
  (içeriği ortalar, max genişlik) + `src/components/word-list.tsx` (tek kart ↔ grid).
  Desktop'ta (≥1024) tab bar sol kenar çubuğu (`tabBarPosition:'left'` +
  `tabBarVariant:'material'`; navigator'ın minWidth'i pencerenin %25'i olduğu için
  tabBarStyle'da width+minWidth 240 ZORUNLU). ≥768'de FAB yerine header'da
  "Add word" butonu, kelime listeleri 2–3 sütun, word card modal ortalanmış dialog.
  `useWindowDimensions` sayesinde pencere küçülünce reload'suz mobil tasarıma döner
- ✅ Deyimler + alternatif anlamlar (2026-08-08): `enrich-word` artık boşluk içeren
  girdiyi (veya `kind:'phrase'`) deyim olarak işliyor — gerçek anlam + `literal`
  kelimesi kelimesine karşılık (Notes'a "Literally: …" olarak dolduruluyor),
  pos='phrase'. Ayrıca `other_senses`: aynı lemmanın diğer kelime türleri
  (bleach → fiil + isim) sözlüğe yazılıyor, add ekranında "also works as" listesi
  olarak çıkıyor; tikleyince ikinci kelime olarak birlikte kaydediliyor
  ("Save 2 words"). Alternatif fiillere çekim üretilmiyor (yavaşlatır);
  `ensureConjugations` sonradan tamamlıyor. Sözlükten gelen kelimelerde alternatif
  anlamlar autocomplete sonuçlarından hesaplanıyor (ekstra sorgu yok)
- ✅ Çok dillilik düzeltmeleri: `languages` tablosunda sadece en/it/es vardı →
  tr/fr/de/pt eklendi (0013); FK reddi yüzünden Türkçe konuşan kullanıcıya HİÇ
  çeviri yazılamıyordu (insert hatası sessizce yutuluyordu — artık throw ediyor).
  `search_lexicon`/`search_lexicon_en` artık `src` parametresi alıyor (0012),
  yoksa Türk kullanıcı İspanyolca çeviri görüyordu. `auxiliary` (essere/avere)
  yalnızca İtalyanca'da yazılıyor; İngilizce fiillerdeki hatalı "avere" temizlendi (0014)
- ✅ Pratikte geri gitme (2026-08-08): hem flashcard (`srs/index.tsx`) hem artikel
  alıştırması (`srs/articles.tsx`) oturum içi `history` tutuyor; header'daki geri
  oku ile önceki kelimelere dönülüyor ("Earlier · 2 of 5"). Geri dönülen kartta
  **cevap gizli** ("Answer hidden — try to recall it first"), yalnızca "Show answer"
  ile açılıyor (açılınca TTS de okuyor). Geri gezinme SRS'i etkilemez — tekrar
  puanlama/mutation yok; "Back to session" canlı kartı kaldığı yerden döndürür.
  Bitiş ekranında "Look back" ile de geçmişe girilebiliyor
- ✅ `closeModal()` (`src/lib/nav.ts`): URL ile doğrudan açılan modal'da
  `router.back()` hiçbir şey yapmıyordu (kaydettikten sonra ekranda kalıyordu)
- ✅ Konu (topic) ekseni (2026-08-08): kelimeler `pos` gibi ikinci bir eksende de
  gruplanıyor — `src/lib/topics.ts` (19 sabit anahtar + etiket + Ionicons ikonu),
  DB'de `lexicon_entries.topic` / `user_words.topic` (0015; iki arama RPC'si de
  topic döndürüyor). enrich-word konuyu da üretiyor; add ekranında konu çipleri,
  kelime kartında "Topic → Change", Home ve words ekranında konu filtre barı.
  Practice'te konular tiklenip **mix** oturumu açılıyor (`mode=topics&topics=a,b`),
  words ekranında "Select" ile tek tek kelime seçilip (`mode=picked`) pratik
  yapılıyor — seçim URL'e sığmayacağı için `src/lib/practice-selection.ts`
  bellek store'unda (reload'da kayboluyor, ekran bunu söylüyor)
- ✅ Konu backfill: `scripts/classify-topics.mjs` (Groq, 40'lık batch, idempotent)
  1224 lexicon kaydını sınıflandırdı; `backfill_user_word_topics()` RPC'si (0016)
  ile 399 kişisel kelime lexicon'dan devraldı, lexicon'suz 15 kelime ayrıca
  sınıflandırıldı → 414/414 kelimede konu var
- ✅ Oturum devamlılığı (2026-08-08): flashcard oturumu `src/lib/practice-session.ts`
  ile AsyncStorage'a yazılıyor (kalan kelime id'leri sırasıyla + done/total,
  drill kimliği `sessionKey(params)`, 7 günden eski oturum bayat sayılır).
  Ekran açılınca kaldığı yerden devam ediyor; Practice sekmesinde "Continue where
  you left off — 3 of 9 done · 6 words left" kartı var; başlıkta "Continued —
  start over" ile sıfırlanabiliyor. `mode=picked` oturumu kayıttaki id'lerden
  yeniden kuruluyor (reload'a dayanıklı).
  DİKKAT: kart kuyruğu artık sadece BİR kez kuruluyor (`built` state) — her
  cevapta query invalidate olduğu için eski kod kuyruğu ortada sıfırlıyordu; ayrıca
  kuyruk kurulmadan "Nothing due" render edilirse kayıtlı oturum siliniyordu
  (ikisi de düzeltildi, ilki zaten mevcut bir hataydı)
- ✅ Artikel drill'i de kalıcı: store artık drill başına kayıt tutuyor (key'li map,
  eski tek-oturum formatı okunuyor). Soru tekil/çoğul rastgele seçildiği için
  `numbers[]` de saklanıyor, yoksa devam ederken soru değişirdi. Practice sekmesi
  yarım kalan TÜM oturumları listeliyor ("Continue Article drill" vb.)
- ✅ Rastgele pratik: `mode=random` — konu/takvim gözetmeksizin tüm öğrenilecek
  kelimeler karıştırılır (karıştırma bir kez yapılır, oturum kaydında sabitlenir);
  Practice'te "Random mix" kartı
- ✅ Çoğul kuralı düzeltildi (`inflect.ts`): `-io` isimlerde son o düşer
  (formaggio → formaggi, figlio → figli); vurgulu `-ìo` listesi ile zio → zii
- ✅ Otomatik telaffuz anahtarı (2026-08-08): `src/lib/settings.ts` (lang.ts ile aynı
  useSyncExternalStore + AsyncStorage deseni, `autoSpeak` varsayılan açık).
  Her iki drill'in başlığında hoparlör butonu (anında susuyor, kalıcı),
  Settings sekmesinde "Read answers out loud" satırı. Kapalıyken manuel hoparlör
  butonları çalışmaya devam eder — sadece otomatik okuma susar
- ✅ "So close" (yakın hata) ayrımı (2026-08-09): `isNearMiss()` (`italian.ts`,
  kapaklı Levenshtein — 1 harf, 8+ harfli kelimede 2) ile tek harf hatası
  ayrılıyor: kartta "Not quite" yerine sarı **"So close!"** + "just a letter or
  two off", buton "Nearly — try it again later". `srs_cards.last_near_miss`
  (0017) son cevabı niteliyor (doğru cevapta sıfırlanır); Mistakes listesi artık
  yalnızca gerçek bilinmeyenler, yakın hatalar ayrı "So close" grubunda
  (`mode=near`, `/words?list=near`, `useNearMissWords`)
- ⬜ Faz 5: SRS, ⬜ kalan polish: stats ekranı, onboarding
- ⬜ enrich-word Edge Function — deploy için kullanıcıdan Supabase access token gerekli
- Not: claude-in-chrome extension bu makinede bağlanmıyor; görsel doğrulama için
  headless Chrome + CDP script'i çalışıyor (bkz. global memory
  `headless-chrome-cdp-screenshots`) — Playwright'a gerek yok
