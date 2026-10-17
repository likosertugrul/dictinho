# App Store gönderim notları

App Store Connect'e kopyalanacak metinler ve cevaplar. Karakter sayıları
Apple'ın sınırlarına göre doğrulandı. Uygulama değiştikçe burası da değişir.

## Temel

| Alan | Değer |
|---|---|
| Bundle ID | `com.likosertugrul.dictinho` (ilk gönderimden sonra değiştirilemez) |
| Birincil kategori | Education |
| İkincil kategori | Reference |
| Yaş sınırı | 4+ (uygunsuz içerik yok; el yazısı notlar yalnızca kullanıcının kendisine görünür, paylaşım özelliği yok) |
| Birincil dil | English (UK veya US — uygulama arayüzü İngilizce) |
| Fiyat | Ücretsiz |
| Gizlilik politikası URL'si | `https://dictinho.vercel.app/privacy` |
| Destek URL'si | `https://dictinho.vercel.app/support` |

## App Name — 8/30

```
Dictinho
```

⚠️ Bu ad App Store'da global olarak benzersiz olmak zorunda. App Store Connect'te
uygulama kaydı oluştururken alınmışsa alternatif gerekir (örn. `Dictinho — Write
to Learn`, 25 karakter).

## Subtitle — 28/30

```
Vocabulary you write by hand
```

## Promotional Text — 96/170

Gönderim gerektirmeden istediğin zaman değiştirilebilen tek alan.

```
Add a word, write it by hand, and let spaced repetition bring it back just before you forget it.
```

## Keywords — 82/100

Virgülle ayrılır, **boşluk kullanma** (boşluk da karakter sayılır). Ad ve
alt başlıktaki kelimeler zaten indeksleniyor, burada tekrar etme.

```
italian,flashcards,handwriting,stylus,conjugation,verbs,srs,notebook,spanish,learn
```

## Description — 1848/4000

```
Dictinho is a vocabulary notebook for people learning a language — and the only one built around writing words by hand.

BUILD YOUR OWN DICTIONARY
Type a word in your language and add it in a tap. Dictinho fills in the part of speech, the gender of nouns, the auxiliary of verbs and example sentences. Words it doesn't know yet, it works out and remembers.

Search works both ways: look up "to go" or look up "andare". Type a word in the wrong form — "vado" — and it finds "andare" for you.

VERBS, PROPERLY
Full conjugation tables across six tenses and six persons, with compound tenses and reflexive verbs handled correctly. Pick which tenses you want to learn; the rest stay out of your way.

PRACTICE THAT ADAPTS
Spaced repetition schedules each word for the moment you're about to forget it. Answer by typing, by picking from options, or by writing the word with your stylus and checking yourself. Sessions resume where you left them.

Near misses are kept apart from real mistakes — a word you missed by one letter isn't the same as one you didn't know.

WRITE BY HAND
With a stylus, every pen stroke carries real pressure, and a resting palm is ignored. Add a handwritten note to any word, answer flashcards in your own writing, or keep free-form pages in the notebook: grammar tables, lesson notes, anything. Choose the paper and the ruling — cream or white, ruled, squared, dotted or blank.

ORGANISED THE WAY YOU THINK
Browse by word class or by topic — food, travel, work, home and more. Filter, sort, star the ones you keep missing, and practise exactly the set you choose.

ON EVERY SCREEN
Phone, tablet and the web, with your words synced between them. Start on the bus, carry on at your desk.

Dictinho shows no ads, tracks nothing and shares nothing. Your account and everything in it can be deleted from inside the app at any time.
```

## What's New (ilk sürüm)

```
First release.
```

## App Privacy anketi

Koda bakarak verilen cevaplar. Analitik SDK'sı, reklam SDK'sı ve üçüncü taraf
takip yok — `package.json`'da böyle bir bağımlılık bulunmuyor.

| Veri | Toplanıyor? | Kimliğe bağlı? | Takip için? | Amaç |
|---|---|---|---|---|
| Contact Info → Email Address | Evet (hesap açarsa) | Evet | Hayır | App Functionality |
| Identifiers → User ID | Evet | Evet | Hayır | App Functionality |
| User Content → Other User Content (kelimeler, notlar, el yazısı sayfalar) | Evet | Evet | Hayır | App Functionality |
| Usage Data | Hayır | — | — | — |
| Diagnostics | Hayır | — | — | — |

**Tracking:** "No, we do not track." (Uygulama ATT izni istemiyor, reklam
tanımlayıcısı kullanmıyor.)

Not: misafir (anonim) hesapta e-posta toplanmıyor; yalnızca rastgele bir
kullanıcı kimliği oluşuyor.

## Gönderimden önce kapatılacaklar

- [ ] **İletişim adresi** şu an kullanıcının kişisel gmail'i — İKİ yerde:
      `src/app/privacy.tsx` ve `src/app/support.tsx` (`CONTACT` sabiti).
      Ayrı adres alınınca ikisini de değiştir.
- [ ] **Veri sorumlusu adı** — `privacy.tsx` içinde `CONTROLLER` şu an
      "the developer of Dictinho". GDPR gerçek bir isim istiyor.
- [ ] **Supabase DPA'sını kabul et** (dashboard, ücretsiz). AB/UK kullanıcısı
      olduğu anda ABD'ye veri aktarımının hukuki dayanağı bu.
- [ ] **KVKK**: Türkçe kaynak dil desteklendiği için Türkiye'ye yönelik
      sayılabilir → Türkçe aydınlatma metni gerekebilir. VERBİS'te küçük ölçekli
      veri sorumlusu muafiyeti büyük ihtimalle geçerli, teyit edilmeli.
- [ ] **Ekran görüntüleri** — iPhone 6.7" ve iPad 13" zorunlu
      (`supportsTablet: true` olduğu için iPad'siz gönderilemiyor).
- [ ] **iPad yerleşimi** simülatörde kontrol edilmeli — Apple incelemeyi iPad'de
      de yapıyor.
- [ ] Hesap silme akışı cihazda bir kez daha denenmeli (Edge Function canlı ve
      doğrulandı, ama inceleyici gerçek cihazda deneyecek).
