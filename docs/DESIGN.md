# Dictinho — Tasarım Sistemi

Referans: `docs/design-reference.png` (kullanıcının verdiği mock).
Kaynak kod token'ları: `src/theme/tokens.ts` (tailwind.config.js ile senkron).

## Karakter

Dark-first, premium, oyunlaştırılmış. Mercan vurgu + pastel deck kartları,
line-art illüstrasyon, pill butonlar, büyük radius, subtle gölge.

## Renkler

| Token | Değer | Kullanım |
|---|---|---|
| `bg` | `#141414` | App arka planı |
| `surface` | `#1E1E1E` | Kart/tab bar/modal |
| `surfaceAlt` | `#232323` | Chip, ikincil yüzey |
| `primary` | `#F5654E` | Mercan — CTA, aktif tab, rozet |
| `textHi` | `#FFFFFF` | Başlık/birincil metin |
| `textLo` | `#A0A0A0` | İkincil metin |
| `border` | `#2C2C2C` | Ayırıcılar |
| `pastel.cream` | `#F3ECDD` | Deck kartı |
| `pastel.yellow` | `#F4C542` | Deck kartı |
| `pastel.mint` | `#CFE6C9` | Deck kartı |
| `pastel.blush` | `#F2D6CE` | Deck kartı |
| `pastel.sky` | `#BFE3F2` | Deck kartı / dil pill |
| `onPastel` | `#141414` | Pastel üstü metin (her zaman koyu) |

## Şekil & Boşluk

- Radius: sm 12 / md 20 / **card 24** / pill 999
- Spacing: 4pt grid (4, 8, 12, 16, 24, 32)
- Deck kartları: üst üste hafif bindirme (−12 marginTop), tam genişlik
- Butonlar: pill (tam yuvarlak), primary dolgu + beyaz metin

## Tipografi

- h1 28/bold, h2 22/bold, body 15, caption 13 — system font (ileride Inter/Spline Sans)

## Ekran desenleri

1. **Home**: üst bar (avatar + 🔥 streak + 💎 gem chip'leri) → pastel deck kartları
   (tag koleksiyonları) → sağ altta mercan FAB (+) → alt tab bar (icon-only:
   home, stats, profile, settings; aktif = primary)
2. **Ekleme formu (modal)**: arama input'u → altında öneri listesi (lemma + pos
   rozeti + CEFR chip); seçimde alanlar otomatik dolar; fiilse essere/avere
   rozeti + zaman çipleri
3. **Çekim modalı (bottom sheet)**: lemma + auxiliary rozeti → zaman sekmeleri →
   io/tu/lui_lei/noi/voi/loro tablosu → örnek cümleler → TTS ikonu (pasif)
4. **SRS flashcard**: tam ekran kart; tap ile çevir; altta Again/Hard/Good/Easy
   pill butonları; üstte ilerleme çubuğu (primary)
5. **Onboarding dil seçimi**: renkli pill satırları + bayrak; Continue primary pill

## Kurallar

- Pastel yüzeylerde daima koyu metin (`onPastel`); dark yüzeylerde `textHi/textLo`.
- UI dili İngilizce. Placeholder metin bırakma (teslim öncesi grep).
- Yeni renk eklerken önce `tokens.ts`, sonra `tailwind.config.js` güncellenir.
