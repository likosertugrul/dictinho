# Dictinho — Personal Language Learning & Dictionary App

@AGENTS.md

Mobile-first İtalyanca öğrenme/sözlük uygulaması. İlk dil çifti **EN → IT**;
şema i18n-ready (`source_language` / `target_language`).

## Stack

- **Expo SDK 54** (RN 0.81, React 19.1) + TypeScript + **Expo Router 6** (typed routes açık)
  — DİKKAT (2026-10-13): kullanıcının Expo Go client'ı kendini **57**'ye güncelledi
  (SDK 57 = RN 0.86, React 19.2.3). Expo Go tek seferde tek SDK destekler, bu yüzden
  SDK 54 projesi artık Expo Go'da AÇILMIYOR ("Project is incompatible with this
  version of Expo Go"). Eski "client 54'ü destekliyor" gerekçesi geçersiz.
  Şimdilik SDK 54'te kalındı; tablet/mobil doğrulama **tarayıcıdan dev server'a**
  bağlanarak yapılıyor (`npx expo start --port 8082` → `http://<LAN-IP>:8082`).
  Native Expo Go testi gerekirse iki yol var: SDK 54'lük Expo Go APK'sını yan yüklemek
  (`expo.dev/go?sdkVersion=54&platform=android`) veya projeyi SDK 57'ye yükseltmek
  (AGENTS.md zaten v57 dokümanını işaret ediyor)
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
- ✅ Cevap şekli seçilebilir (2026-08-10): `settings.answerMode` = 'typing' | 'choice'
  (varsayılan yazma). Practice ekranında "Answer with: Typing / Choices" ve
  Settings'te aynı kontrol. Çoktan seçmelide şıklar `buildChoices()` (srs.ts) ile
  kullanıcının kendi kelimelerinden üretiliyor: önce aynı kelime türünden, kartın
  kabul ettiği eşanlamlılar hariç (yoksa "yanlış" şık doğru olurdu), 4 şık,
  karıştırılmış. Şıklar kart başına cache'leniyor (`choiceCache`) — her render'da
  yeniden üretilse cevap parmağın altında yer değiştirirdi. Havuz yetersizse
  (tek kelime) otomatik yazmaya düşer. Yakın-hata ("So close") yalnızca yazmada
- ✅ Deploy (Vercel, proje `dictinho`, canlı: https://dictinho.vercel.app):
  `vercel.json` → build `expo export -p web`, output `dist`, SPA rewrite.
  Build-time env: `EXPO_PUBLIC_SUPABASE_URL` + `_ANON_KEY` (Production'da tanımlı).
  2026-08-11'e kadar proje GitHub'a BAĞLI DEĞİLDİ — push deploy tetiklemiyordu,
  bu yüzden canlı site 13 gün eskiydi. `vercel git connect` ile bağlandı;
  artık main'e her push otomatik production deploy'u tetikliyor
  (doğrulama: push → `● Ready`, alias `dictinho.vercel.app` yeni deployment'ta).
  AMA otomatik tetikleme her seferinde çalışmadı (3 push'un 2'sinde tetiklendi,
  birinde hiç deployment oluşmadı — sebebi dışarıdan teşhis edilemedi, `gh` yok).
  Bu yüzden push sonrası CANLI BUNDLE HASH'İNİ doğrula:
  `npx expo export -p web` çıktısındaki `entry-*.js` ile
  `curl -s https://dictinho.vercel.app | grep -o 'entry-[a-f0-9]*\.js'` aynı olmalı.
  Değilse `npm run deploy` (build + `vercel --prod --yes`)
- ✅ Çekimli form araması (2026-08-12): "vado" araması `andare`'yi hiç bulmuyordu,
  kullanıcı da çekimli formu kelime diye kaydediyordu. `search_lexicon` artık
  `conjugations` tablosunu da tarıyor (yalnızca TAM eşleşme; 7k form üzerinde
  fuzzy arama lemma sonuçlarını boğardı) ve `matched_form` döndürüyor (0018).
  Add ekranında: kesin eşleşmede "«vado» is a form of andare" şeridi + "Use it",
  ve `hasExactMatch` true olduğu için "kendin ekle/AI ile ekle" bloğu gizleniyor.
  İsim/sıfat çekimleri DB'de olmadığından orada `isNearMiss` ile yumuşak
  "Did you mean finestra?" ipucu var (yönlendirme değil, öneri).
  AI yolu zaten sözlük formuna çeviriyor (vado→andare, rosse→rosso, scritto→scrivere)
- 🟡 El yazısı notlar — Faz A (2026-10-13): tablet kalemiyle yazma. `react-native-svg`
  (Expo Go'ya gömülü, custom native modül YOK) + RN pointer olayları — `pointerType`,
  `pressure`, `tiltX/Y` hem Android native'de hem web'de aynı API'den geliyor
  (react-native-web bu prop'ları doğrudan DOM'a geçiriyor), yani TEK uygulama iki
  platformu karşılıyor. `src/components/ink/`: `strokes.ts` (sabit sanal uzay
  1000×520, RDP sadeleştirme, basınca göre değişken kalınlıklı tek `<Path fill>`
  outline — stroke'lu path tek kalınlık verirdi), `ink-canvas.tsx` (yakalama;
  pointer hedefi SVG'nin ÜSTÜNDEKİ overlay View — yoksa `offsetX` path'e göre
  ölçülürdü; avuç reddi: bir kez gerçek kalem görülünce `touch` yok sayılır;
  canlı çizgi ref + rAF, yoksa 120Hz kalem her örnekte render tetikler),
  `ink-pad.tsx` (krem sayfa + çizgili kılavuz, 2 renk/3 kalınlık/silgi/geri al/temizle),
  `word-ink.tsx` (kelime kartında KAPALI başlar — yazılı not birincil).
  `src/lib/ink.ts` hook'ları, migration `0019_ink_drawings.sql`.
  Kart ScrollView'ı kalem inince donuyor (`scrollEnabled={!penDown}`).
  `0019` uygulandı ve uçtan uca doğrulandı (iki anonim oturumla: insert, stroke
  verisi bozulmadan dönüyor, RLS yabancıya kapalı, check kısıtı kelimesiz 'word'
  çizimini reddediyor, updated_at trigger'ı ilerliyor). Web bundle'ında sızıntı yok
  (yalnız anon key gömülü). KALAN: tablette kalemle görsel doğrulama (tarayıcıdan,
  bkz. SDK notu) ve Faz B (pratikte elle cevap) + Faz C (defter sekmesi) — ikisi de
  planlandı, yazılmadı
- 🟡 El yazısı — Faz B (2026-10-13): pratikte elle cevap. `settings.answerMode`
  üçüncü değeri **`'handwriting'`** (Practice ve Settings sekmelerindeki "Answer with"
  seçicilerine "Writing" eklendi). Kart çıkar → kalemle yazarsın → **"Show answer"**
  → cevap görünür ve **kendin puanlarsın**: "Missed it" / "Got it" / "Easy".
  OCR YOK; uygulama el yazısını okumadığı için otomatik bir hüküm vermiyor —
  bu yüzden açılan rozet "Correct!/Not quite" değil nötr **"Check your writing"**.
  `next(rating, selfVerdict?)` kullanıcının hükmünü alıyor (state async olduğu için
  `wasCorrect`'i okumak güvenli değildi). Yakın hata ("So close") yazmada kalıyor:
  karşılaştırılacak metin olmadığı için el yazısında ölçülemez.
  Çizim oturumla sınırlı, DB'ye yazılmıyor (pratik karalaması) ama `history`'de
  tutuluyor → "look back" ekranında "what you wrote" altında kendi yazın görünüyor.
  `InkCanvas`/`InkPad` artık `vh` prop'u alıyor (`INK_LINE_H = 260`, tek satırlık
  pad; kılavuz çizgileri yükseklikten hesaplanıyor), kart pad'i varsayılan `INK_H`.
  Pratik ScrollView'ı da kalem inince donuyor
- 🟡 El yazısı — Faz C (2026-10-14): **Notebook sekmesi** (5. tab, Practice ile Profile
  arası, `book-outline`). `(tabs)/notebook.tsx` sayfa ızgarası (telefon 2 / tablet 3 /
  xl 4 sütun; her kart krem sayfa + gerçek ink önizlemesi, "Untitled page",
  "Today/Yesterday/3 days ago/14 Oct"), `note/[id].tsx` düzenleyici (root layout'ta
  modal). Sayfalar `ink_drawings`'te `kind='page'` (0019 zaten hazırdı; yeni migration
  YOK), `src/lib/notebook.ts` hook'ları — oluşturmada `position = son + 1`.
  Kaydırma/zoom YOK: sayfa, kalan boşluğa sığacak şekilde ölçekleniyor
  (`min(boxW, boxH × INK_W/INK_PAGE_H)`, `INK_PAGE_H = 1400` ≈ A4 oranı) — bilinçli
  karar, yarım yamalak pinch-zoom yerine "daha fazla yer lazımsa yeni sayfa".
  Bu yüzden `InkPad`'in araç çubuğu `InkToolbar` olarak ayrıldı: sayfa ölçülen
  alanın içinde, çubuk dışında kalmalı. Başlık yerinde düzenleniyor (blur/submit'te
  kaydediliyor), silme iki adımlı onay, kapatırken kaydedilmemiş çizim otomatik
  kaydediliyor ("Discard" ile atılabiliyor).
  DB'ye karşı doğrulandı (gerçek anon oturumla: create ×2 → position 1,2 artıyor;
  strokes kaydı; rename; liste sorgusu; tek sayfa; kind='word' satırları listeye
  karışmıyor; silme → 0 kaldı). KALAN: tablette görsel doğrulama; sayfa sıralamasını
  elle değiştirme (reorder) UI'ı yapılmadı — `position` kolonu hazır
- ✅ El yazısı — kalem/kâğıt rötuşları (2026-10-14, kullanıcı Samsung tabletinde
  kalemi doğruladı: basınç + avuç reddi çalışıyor):
  • **Donanım silgisi**: S Pen yan düğmesi basılı dokunuş silgiye geçiyor.
    W3C'ye göre `pointerType` her zaman `'pen'` kalır, ayrı 'eraser' tipi YOK —
    sinyal düğmelerde: S Pen yan düğmesi **barrel** bit'i (`buttons & 2`),
    USI/Wacom silgi ucu **eraser** bit'i (`buttons & 32` / `button === 5`).
    `penWantsEraser()` yalnız `pointerType === 'pen'` için bakıyor (parmak/fare asla
    silmez) ve karar **pointerdown'da bir kez** veriliyor (`erasingStroke` ref) —
    düğme çizgi ortasında bırakılırsa davranış değişmesin diye
  • **Kâğıt seçimi**: `0020` ile `ink_drawings.paper` + `.rule`; anahtarlar
    `src/lib/paper.ts` (5 kâğıt: cream/white/mint/blush/sky — hepsi AÇIK renk,
    çünkü 5 mürekkebin hepsi her kâğıtta okunur kalmalı; 4 çizgi stili:
    lines/grid/dots/blank). Defter düzenleyicisinde palet butonu → panel,
    seçim anında kaydediliyor. Izgara ve noktalı kâğıt TEK `<Path>` olarak
    üretiliyor (`gridPath`/`dotsPath` — 204 nokta 204 SVG düğümü olmasın diye),
    çizgili kâğıt yükseklikten hesaplanıyor (`ruleGuides`)
  • **Araç çubuğu**: 5 mürekkep rengi + 3 kalınlık (1. satır), etiketli **Eraser**
    + geri al + temizle (2. satır). İki satır, çünkü 11 kontrol telefon genişliğine
    tek satırda sığmıyor. Yeni renkler `tokens.ts` → `colors.inks` ve
    `tailwind.config.js` aynasına eklendi (DESIGN.md kuralı)
  Doğrulamalar: tsc temiz, web build ok, DB'ye karşı paper/rule round-trip
  (null→varsayılan, sky/grid yazıldı, liste getiriyor), geometri testi
  (sayfa 8 baseline / kart 3 / tek satır 1 — eski sabit 170,330,490 ile birebir aynı)
- ✅ Defter sabit yerleşim düzeltmesi (2026-10-14, kullanıcı bildirdi: "her
  dokunduğumda boyut değişiyor"): sayfa `flex-1` kutuya sığdırıldığı için ALTTAKİ
  bloğun yüksekliği değişince sayfa da yeniden ölçekleniyordu. Üç ayrı kaynak vardı:
  (1) `dirty` olunca ipucu metni Save/Discard satırına dönüşüyordu — artık buton
  satırı HER ZAMAN duruyor, temizken pasif ve "Saved" yazıyor; (2) `InkPad`'in
  "Write with your stylus…" ipucu ilk çizgide kayboluyordu — artık sabit 34px'lik
  bir yuvada (kelime kartı ve flashcard'ı da etkiliyordu); (3) kâğıt paneli ve silme
  onayı kolonun içindeydi — artık `Overlay` ile ekranın üstünde yüzüyor (karartma
  rgba, NativeWind alpha'ya güvenilmedi), hata mesajları da absolute toast.
  KURAL: bu ekranda sayfa alanının yüksekliğini değiştiren hiçbir şey kolona
  eklenmemeli — koşullu yükseklik = çizim ortasında yeniden ölçeklenen sayfa
- 🟡 iPad Safari düzeltmeleri (2026-10-14; Samsung tablet+kalem ÇALIŞIYOR, kullanıcı
  doğruladı — iPad Safari'de "çiziyor ama sayfa kayıyor/zıplıyor"):
  • iPad Safari **pinch-zoom ve çift-dokunma zoom'unu `touch-action: none` ile
    ENGELLEMİYOR** — avuç cama değince sayfa yakınlaşıyor. Tek yol WebKit'e özgü
    `gesturestart/gesturechange/gestureend` + çok parmaklı `touchmove`'da
    `preventDefault()`; bunlar RN prop yüzeyinde yok, bu yüzden `InkCanvas`'ta
    web'e özel DOM dinleyicileri var (overlay ref'i üzerinden). Yalnızca çizim
    yüzeyine bağlı: uygulamanın geri kalanında zoom çalışmaya devam ediyor.
    Tek parmaklı `touchmove` KASITLI olarak engellenmiyor — onu iptal etmek
    çizgi ortasında pointer akışını kesebilir
  • `pointercancel` artık çizgiyi ATMIYOR (`finish(e, true)`): Safari bu olayı
    Android'den çok daha kolay tetikliyor, eski davranış mürekkebi sessizce yutuyordu
  • `WebkitUserSelect` + `WebkitTouchCallout` eklendi (Safari yalnız önekli
    biçimleri dikkate alıyor; callout açıkken uzun basışta kendi menüsü açılıyordu)
  • DİKKAT: effect bağımlılığı `edit` DEĞİL `editable` (boolean) — `edit` her
    render'da yeni nesne ve tuval çizim sırasında her animasyon karesinde
    render ediliyor, yoksa dinleyiciler saniyede ~60 kez sökülüp takılırdı
  • Belgeye (index.html) dokunulmadı: Expo varsayılanında `body{overflow:hidden}`
    zaten var, ayrıca `+html.tsx` dokümana göre statik render için ve proje
    `output:'single'` kullanıyor — orada uygulanacağı garanti değil.
    Zıplama sürerse sıradaki adım viewport meta (`maximum-scale=1`) ve
    `overscroll-behavior:none`, ama önce +html.tsx'in SPA'da işlediği ölçülmeli
  KALAN: iPad'de yeniden test (henüz deploy edilmedi, commit bekliyor)
- ⬜ Faz 5: SRS, ⬜ kalan polish: stats ekranı, onboarding
- ⬜ enrich-word Edge Function — deploy için kullanıcıdan Supabase access token gerekli
- Not: claude-in-chrome extension bu makinede bağlanmıyor; görsel doğrulama için
  headless Chrome + CDP script'i çalışıyor (bkz. global memory
  `headless-chrome-cdp-screenshots`) — Playwright'a gerek yok
