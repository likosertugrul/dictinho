import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Container } from '@/components/container';
import { useEnrichWord } from '@/hooks/use-enrich-word';
import { useLexiconSearch, type SearchLang } from '@/hooks/use-lexicon-search';
import { MAX_W } from '@/hooks/use-responsive';
import { conjugateRegular } from '@/lib/conjugator';
import { adjectiveForms, nounForms } from '@/lib/inflect';
import { hasGrammar, langInfo, useSourceLang, useTargetLang } from '@/lib/lang';
import { closeModal } from '@/lib/nav';
import {
  AUXILIARIES,
  isNearMiss,
  matchesLemma,
  PERSON_LABELS,
  PERSONS,
  POS_VALUES,
  TENSE_LABELS,
  TENSES,
  withArticle,
  withArticlePlural,
  type Auxiliary,
  type Person,
  type Pos,
  type Tense,
} from '@/lib/italian';
import type { LexiconSuggestion, WordStatus } from '@/lib/schemas';
import { TOPIC_ICONS, TOPIC_LABELS, TOPIC_VALUES, type Topic } from '@/lib/topics';
import { useAddWord, useLexiconConjugations, useRecentWords } from '@/lib/words';
import { speechService } from '@/services/speech';
import { colors } from '@/theme/tokens';

/** Tap-to-listen speaker button (TTS in the given language). */
function Speaker({ text, lang, size = 16 }: { text: string; lang: string; size?: number }) {
  if (!speechService.isAvailable || !text.trim()) return null;
  return (
    <Pressable
      accessibilityLabel={`Listen to ${text}`}
      hitSlop={8}
      onPress={(e) => {
        e.stopPropagation?.();
        speechService.speak(text, { language: lang });
      }}
      className="h-7 w-7 items-center justify-center">
      <Ionicons name="volume-medium-outline" size={size} color={colors.textLo} />
    </Pressable>
  );
}

function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' }) {
  return (
    <View
      className={`rounded-full px-2.5 py-0.5 ${tone === 'primary' ? 'bg-primary' : 'bg-surfaceAlt'}`}>
      <Text className={`text-xs font-semibold ${tone === 'primary' ? 'text-white' : 'text-textLo'}`}>
        {label}
      </Text>
    </View>
  );
}

function PreviewRow({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-2.5 ${border ? 'border-t border-border' : ''}`}>
      <Text className="text-xs font-semibold text-textLo">{label}</Text>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-semibold text-textHi">{value}</Text>
        <Speaker text={value} lang="it" />
      </View>
    </View>
  );
}

export default function AddWordScreen() {
  const targetLang = useTargetLang();
  const sourceLang = useSourceLang();
  const grammar = hasGrammar(targetLang); // conjugation/forms only for Italian
  const [query, setQuery] = useState('');
  const [searchLang, setSearchLang] = useState<SearchLang>('it');
  const [selected, setSelected] = useState<LexiconSuggestion | null>(null);
  const [translation, setTranslation] = useState('');
  const [notes, setNotes] = useState('');
  // Other word classes of the picked lemma, and which of them to save too
  const [aiAlternatives, setAiAlternatives] = useState<LexiconSuggestion[]>([]);
  const [extraSenses, setExtraSenses] = useState<string[]>([]);
  // Only Presente is pre-selected; the user can add more tenses per verb
  const [tenses, setTenses] = useState<Tense[]>(['presente']);

  // Which list to file it under
  const [status, setStatus] = useState<WordStatus>('learning');

  // Manual attributes — used when the word isn't in the base lexicon
  const [manualPos, setManualPos] = useState<Pos>('noun');
  const [posTouched, setPosTouched] = useState(false);
  const [manualGender, setManualGender] = useState<'m' | 'f' | null>(null);
  // Theme bucket; the dictionary/AI entry pre-selects it, the user can change it
  const [topic, setTopic] = useState<Topic | null>(null);
  const [manualAux, setManualAux] = useState<Auxiliary>('avere');

  // Anything with a space is an idiom / set phrase ("in bocca al lupo"), which
  // the AI look-up and the word-class default both key off.
  const isPhraseInput = /\s/.test(query.trim());
  // Until the user picks a class themselves, follow what they typed.
  const effectiveManualPos: Pos = posTouched ? manualPos : isPhraseInput ? 'phrase' : 'noun';

  const pickPos = (p: Pos) => {
    setManualPos(p);
    setPosTouched(true);
  };

  const effectivePos: Pos = selected?.pos ?? effectiveManualPos;
  // Verb tense selection / conjugation UI only for languages with grammar (Italian)
  const isVerb = effectivePos === 'verb' && grammar;

  const toggleTense = (t: Tense) =>
    setTenses((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const search = useLexiconSearch(query, searchLang, targetLang, sourceLang);
  const addWord = useAddWord();
  const enrich = useEnrichWord();
  const myWords = useRecentWords();

  // Is a given Italian lemma+pos already in the user's list? (which one)
  const ownedStatus = (lemma: string, p: string): WordStatus | null =>
    (myWords.data ?? []).find((w) => w.pos === p && matchesLemma(lemma, w.lemma))?.status ?? null;
  // Live conjugation preview for the picked verb (custom verbs: rule-based)
  const lexConjugations = useLexiconConjugations(
    selected?.pos === 'verb' ? selected.id : null,
  );

  const previewForms = (tense: Tense): Partial<Record<Person, string>> | null => {
    if (selected?.pos === 'verb') {
      const rows = (lexConjugations.data ?? []).filter((c) => c.tense === tense);
      if (rows.length === 0) return null;
      const map: Partial<Record<Person, string>> = {};
      for (const c of rows) map[c.person as Person] = c.form;
      return map;
    }
    return conjugateRegular(query, tense, manualAux);
  };

  const suggestions = search.data ?? [];
  const showSuggestions = !selected && query.trim().length >= 2 && suggestions.length > 0;

  // Fuzzy search returns near-matches ("laurea" → là, lago…), so "no results"
  // rarely fires. Offer AI-add / manual entry whenever nothing EXACTLY matches.
  // Typing an inflected form counts as a match: "vado" is andare, and saving it
  // as its own word is exactly the mistake this avoids.
  const inflectedHit = suggestions.find(
    (s) => s.matched_form && matchesLemma(query, s.matched_form),
  );
  const hasExactMatch =
    suggestions.some((s) => matchesLemma(query, s.lemma)) || inflectedHit != null;

  // Noun and adjective inflections aren't in the database the way conjugations
  // are, so "finestre" can only be guessed at: a dictionary word one or two
  // letters away is probably what the user meant. A hint, not a redirect.
  const didYouMean =
    !selected && !hasExactMatch
      ? suggestions.find((s) => isNearMiss(query, [s.lemma]))
      : undefined;
  const canAddCustom =
    !selected && searchLang === 'it' && query.trim().length >= 2 && !hasExactMatch;
  const isCustom = canAddCustom; // manual attribute pickers gate on the same flag

  const pick = (s: LexiconSuggestion) => {
    Keyboard.dismiss();
    setSelected(s);
    setQuery(s.lemma);
    setTranslation(s.translation ?? '');
    setTopic(s.topic ?? null);
    setExtraSenses([]);
  };

  const runEnrich = () => {
    const term = query.trim();
    if (!term) return;
    enrich.mutate(
      {
        term,
        lang: searchLang,
        target: targetLang,
        source: sourceLang,
        kind: isPhraseInput ? 'phrase' : 'word',
      },
      {
        onSuccess: (s) => {
          if (searchLang === 'en') setSearchLang('it'); // switch to show the target word
          pick(s); // treat the AI-added entry exactly like a dictionary match
          if (s.pos === 'verb') setTenses(['presente']);
          setAiAlternatives(s.alternatives);
          // Idioms: keep the word-for-word reading, the meaning alone hides it
          if (s.literal && !notes.trim()) setNotes(`Literally: ${s.literal}`);
        },
      },
    );
  };

  const reset = () => {
    setSelected(null);
    setTranslation('');
    setTopic(null);
    setAiAlternatives([]);
    setExtraSenses([]);
  };

  /**
   * The same lemma in other word classes — "bleach" the verb also being a noun.
   * They come from the AI look-up and from autocomplete (which, once a word is
   * picked, is searching that exact lemma anyway).
   */
  const otherSenses = useMemo(() => {
    if (!selected) return [];
    const seen = new Set<string>([selected.pos]);
    const out: LexiconSuggestion[] = [];
    for (const s of [...aiAlternatives, ...suggestions]) {
      if (seen.has(s.pos) || !matchesLemma(s.lemma, selected.lemma)) continue;
      seen.add(s.pos);
      out.push(s);
    }
    return out;
  }, [selected, aiAlternatives, suggestions]);

  const toggleExtraSense = (id: string) =>
    setExtraSenses((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canSave = query.trim().length > 0 && translation.trim().length > 0 && !addWord.isPending;

  const save = async () => {
    try {
      await addWord.mutateAsync({
        lemma: selected?.lemma ?? query.trim(),
        translation: translation.trim(),
        pos: effectivePos,
        gender: selected?.gender ?? (effectivePos === 'noun' ? manualGender : null),
        auxiliary: selected?.auxiliary ?? (isVerb ? manualAux : null),
        cefr: selected?.cefr ?? null,
        topic,
        lexicon_ref: selected?.id ?? null,
        notes: notes.trim() || null,
        status,
        tenses: isVerb ? tenses : [],
      });
      // Ticked extra senses are saved as their own words (same lemma, own class)
      for (const s of otherSenses.filter((o) => extraSenses.includes(o.id))) {
        await addWord.mutateAsync({
          lemma: s.lemma,
          translation: s.translation ?? '',
          pos: s.pos,
          gender: s.gender,
          auxiliary: s.auxiliary,
          cefr: s.cefr,
          topic: s.topic ?? topic,
          lexicon_ref: s.id,
          notes: null,
          status,
          tenses: s.pos === 'verb' && grammar ? tenses : [],
        });
      }
      closeModal();
    } catch {
      /* the error is rendered from addWord.error below */
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View className="px-5 py-3">
          <Container max={MAX_W.content}>
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold text-textHi">Add word</Text>
              <Pressable
                accessibilityLabel="Close"
                onPress={closeModal}
                className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
                <Ionicons name="close" size={20} color={colors.textHi} />
              </Pressable>
            </View>
          </Container>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-6"
          keyboardShouldPersistTaps="handled">
          <Container max={MAX_W.content}>
          {/* Search input + language direction toggle */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-textLo">
              {searchLang === 'it'
                ? `${langInfo(targetLang).name} word`
                : `Search in ${langInfo(sourceLang).name}`}
            </Text>
            <View className="flex-row gap-1.5">
              {(
                [
                  { key: 'it', label: `${targetLang.toUpperCase()} ${langInfo(targetLang).flag}` },
                  {
                    key: 'en',
                    label: `${sourceLang.toUpperCase()} ${langInfo(sourceLang).flag}`,
                  },
                ] as const
              ).map(({ key, label }) => (
                <Pressable
                  key={key}
                  accessibilityLabel={key === 'it' ? 'Search target-language words' : 'Search by English meaning'}
                  onPress={() => {
                    if (key !== searchLang) {
                      setSearchLang(key);
                      setQuery('');
                      reset();
                    }
                  }}
                  className={`rounded-full px-3 py-1.5 ${searchLang === key ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                  <Text
                    className={`text-xs font-semibold ${searchLang === key ? 'text-white' : 'text-textLo'}`}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View className="flex-row items-center rounded-2xl bg-surface px-4">
            <TextInput
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                if (selected && t !== selected.lemma) reset();
              }}
              placeholder={
                searchLang === 'it'
                  ? `a ${langInfo(targetLang).name} word…`
                  : `a ${langInfo(sourceLang).name} word…`
              }
              placeholderTextColor={colors.textLo}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              className="flex-1 py-3.5 text-base text-textHi"
            />
            {query.length > 0 && (
              <Pressable
                accessibilityLabel="Clear"
                hitSlop={8}
                onPress={() => {
                  setQuery('');
                  reset();
                }}>
                <Ionicons name="close-circle" size={20} color={colors.textLo} />
              </Pressable>
            )}
          </View>

          {/* Source-language mode, no dictionary match → let AI find the word */}
          {searchLang === 'en' &&
            !selected &&
            query.trim().length >= 2 &&
            !search.isFetching &&
            !hasExactMatch && (
              <>
                {suggestions.length > 0 && (
                  <Text className="mb-2 mt-4 px-1 text-xs text-textLo">
                    Not the meaning you meant? Let AI find it:
                  </Text>
                )}
                <Pressable
                  accessibilityLabel={`Find the ${langInfo(targetLang).name} ${
                    isPhraseInput ? 'expression' : 'word'
                  } with AI`}
                  disabled={enrich.isPending}
                  onPress={runEnrich}
                  className={`flex-row items-center justify-center gap-2 rounded-full bg-primary py-3.5 ${
                    suggestions.length > 0 ? '' : 'mt-3'
                  }`}>
                  {enrich.isPending ? (
                    <>
                      <ActivityIndicator color={colors.onPrimary} />
                      <Text className="text-sm font-bold text-white">
                        Finding the {langInfo(targetLang).name} for “{query.trim()}”…
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={16} color={colors.onPrimary} />
                      <Text className="text-sm font-bold text-white">
                        {isPhraseInput
                          ? `Find the ${langInfo(targetLang).name} expression for “${query.trim()}”`
                          : `Find the ${langInfo(targetLang).name} for “${query.trim()}” with AI`}
                      </Text>
                    </>
                  )}
                </Pressable>
                {isPhraseInput && !enrich.isPending && (
                  <Text className="mt-2 px-1 text-xs text-textLo">
                    Idioms get their real meaning, not a word-for-word translation.
                  </Text>
                )}
                {enrich.isError && (
                  <Text className="mt-2 px-1 text-xs text-primary">{enrich.error.message}</Text>
                )}
              </>
            )}

          {search.isFetching && !selected && (
            <View className="mt-2 flex-row items-center gap-2 px-1">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text className="text-xs text-textLo">Searching…</Text>
            </View>
          )}

          {/* Typed a conjugated form — point at the word it belongs to */}
          {!selected && inflectedHit && (
            <Pressable
              accessibilityLabel={`Add ${inflectedHit.lemma} instead`}
              onPress={() => pick(inflectedHit)}
              className="mt-3 flex-row items-center gap-2 rounded-2xl border border-primary bg-surface px-3 py-2.5">
              <Ionicons name="git-branch-outline" size={16} color={colors.primary} />
              <Text className="flex-1 text-xs text-textHi">
                “{inflectedHit.matched_form}” is a form of{' '}
                <Text className="font-bold">{inflectedHit.lemma}</Text> — words are saved in
                their dictionary form.
              </Text>
              <View className="rounded-full bg-primary px-3 py-1.5">
                <Text className="text-xs font-bold text-white">Use it</Text>
              </View>
            </Pressable>
          )}

          {showSuggestions && (
            <View className="mt-2 overflow-hidden rounded-2xl bg-surface">
              {suggestions.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => pick(s)}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}>
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-textHi">
                      {s.pos === 'noun' ? withArticle(s.lemma, s.gender) : s.lemma}
                    </Text>
                    {s.translation ? (
                      <Text className="mt-0.5 text-xs text-textLo">{s.translation}</Text>
                    ) : null}
                    {s.matched_form ? (
                      <Text className="mt-0.5 text-[11px] text-textLo">
                        form: {s.matched_form}
                      </Text>
                    ) : null}
                    {ownedStatus(s.lemma, s.pos) && (
                      <View className="mt-1 flex-row items-center gap-1">
                        <Ionicons name="checkmark-circle" size={12} color={colors.pastel.mint} />
                        <Text className="text-[11px] font-semibold" style={{ color: colors.pastel.mint }}>
                          In your {ownedStatus(s.lemma, s.pos) === 'known' ? 'Known' : 'To learn'} list
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Speaker text={s.pos === 'noun' ? withArticle(s.lemma, s.gender) : s.lemma} lang={targetLang} />
                    <Badge label={s.pos} />
                    {s.auxiliary ? <Badge label={s.auxiliary} tone="primary" /> : null}
                    {s.gender ? <Badge label={s.gender} /> : null}
                    {s.cefr ? <Badge label={s.cefr} /> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Auto-filled details for the picked entry */}
          {selected && (
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <Badge label={selected.pos} />
              {selected.auxiliary ? <Badge label={selected.auxiliary} tone="primary" /> : null}
              {selected.gender ? (
                <Badge label={withArticle(selected.lemma, selected.gender)} tone="primary" />
              ) : null}
              {selected.cefr ? <Badge label={selected.cefr} /> : null}
              <Text className="text-xs text-textLo">auto-filled — tap a field to edit</Text>
            </View>
          )}

          {/* Other word classes of the same lemma — "bleach" is also a noun.
              Ticked ones are saved as their own words alongside this one. */}
          {otherSenses.length > 0 && (
            <View className="mt-4">
              <Text className="mb-2 text-sm font-semibold text-textLo">
                “{selected!.lemma}” also works as: {otherSenses.map((s) => s.pos).join(', ')}
              </Text>
              <View className="overflow-hidden rounded-2xl bg-surface">
                {otherSenses.map((s, i) => {
                  const checked = extraSenses.includes(s.id);
                  const owned = ownedStatus(s.lemma, s.pos);
                  return (
                    <Pressable
                      key={s.id}
                      accessibilityLabel={`${checked ? 'Do not add' : 'Also add'} the ${s.pos} sense of ${s.lemma}`}
                      onPress={() => toggleExtraSense(s.id)}
                      className={`flex-row items-center gap-3 px-4 py-3 ${
                        i > 0 ? 'border-t border-border' : ''
                      }`}>
                      <View
                        className={`h-5 w-5 items-center justify-center rounded-md border ${
                          checked ? 'border-primary bg-primary' : 'border-border'
                        }`}>
                        {checked && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Badge label={s.pos} />
                          {s.gender ? <Badge label={s.gender} /> : null}
                          {s.auxiliary ? <Badge label={s.auxiliary} tone="primary" /> : null}
                        </View>
                        <Text className="mt-1 text-sm text-textHi">{s.translation}</Text>
                        {owned && (
                          <Text
                            className="mt-0.5 text-[11px] font-semibold"
                            style={{ color: colors.pastel.mint }}>
                            already in your list
                          </Text>
                        )}
                      </View>
                      {/* Switch the form to this sense instead of adding both */}
                      <Pressable
                        accessibilityLabel={`Edit the ${s.pos} sense instead`}
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          pick(s);
                        }}
                        className="rounded-full bg-surfaceAlt px-3 py-1.5">
                        <Text className="text-xs font-bold text-textHi">Edit this</Text>
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="mt-2 px-1 text-xs text-textLo">
                Tick a sense to save it as a second word.
              </Text>
            </View>
          )}

          {/* Already-in-list note for the picked / typed word */}
          {(() => {
            const lemma = selected?.lemma ?? query.trim();
            const p = selected?.pos ?? effectiveManualPos;
            const owned = lemma.length >= 2 ? ownedStatus(lemma, p) : null;
            if (!owned) return null;
            return (
              <View className="mt-3 flex-row items-center gap-1.5 rounded-2xl bg-surface px-3 py-2.5">
                <Ionicons name="information-circle" size={16} color={colors.pastel.mint} />
                <Text className="flex-1 text-xs text-textHi">
                  Already in your {owned === 'known' ? 'Known' : 'To learn'} list — saving will
                  update it.
                </Text>
              </View>
            );
          })()}

          {/* Manual attributes — shown when the typed word isn't an exact match */}
          {isCustom && (
            <>
              {didYouMean && !search.isFetching && (
                <Pressable
                  accessibilityLabel={`Add ${didYouMean.lemma} instead`}
                  onPress={() => pick(didYouMean)}
                  className="mt-4 flex-row items-center gap-2 rounded-2xl bg-surface px-3 py-2.5">
                  <Ionicons name="help-circle-outline" size={16} color={colors.pastel.yellow} />
                  <Text className="flex-1 text-xs text-textHi">
                    Did you mean <Text className="font-bold">{didYouMean.lemma}</Text>? Words are
                    saved in their dictionary form.
                  </Text>
                  <View className="rounded-full bg-surfaceAlt px-3 py-1.5">
                    <Text className="text-xs font-bold text-textHi">Use it</Text>
                  </View>
                </Pressable>
              )}

              {!search.isFetching && (
                <>
                  {suggestions.length > 0 && (
                    <Text className="mb-2 mt-4 px-1 text-xs text-textLo">
                      Not the {isPhraseInput ? 'expression' : 'word'} you meant? Add it directly:
                    </Text>
                  )}
                  {/* AI look-up: fills type/meaning/auxiliary + correct conjugations */}
                  <Pressable
                    accessibilityLabel={isPhraseInput ? 'Add expression with AI' : 'Add with AI'}
                    disabled={enrich.isPending}
                    onPress={runEnrich}
                    className={`flex-row items-center justify-center gap-2 rounded-full bg-primary py-3.5 ${
                      suggestions.length > 0 ? '' : 'mt-3'
                    }`}>
                    {enrich.isPending ? (
                      <>
                        <ActivityIndicator color={colors.onPrimary} />
                        <Text className="text-sm font-bold text-white">Looking up “{query.trim()}”…</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={16} color={colors.onPrimary} />
                        <Text className="text-sm font-bold text-white">
                          {isPhraseInput
                            ? `Add the expression “${query.trim()}” with AI`
                            : `Add “${query.trim()}” with AI`}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {enrich.isError && (
                    <Text className="mt-2 px-1 text-xs text-primary">{enrich.error.message}</Text>
                  )}
                  <Text className="mt-3 px-1 text-xs text-textLo">
                    …or set the details manually below and save it as-is.
                  </Text>
                </>
              )}

              <Text className="mb-2 mt-6 text-sm font-semibold text-textLo">Word type</Text>
              <View className="flex-row flex-wrap gap-2">
                {POS_VALUES.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => pickPos(p)}
                    className={`rounded-full px-3.5 py-1.5 ${effectiveManualPos === p ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                    <Text
                      className={`text-sm font-semibold ${effectiveManualPos === p ? 'text-white' : 'text-textLo'}`}>
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {effectiveManualPos === 'noun' && (
                <>
                  <Text className="mb-2 mt-4 text-sm font-semibold text-textLo">Gender</Text>
                  <View className="flex-row gap-2">
                    {(['m', 'f'] as const).map((g) => (
                      <Pressable
                        key={g}
                        onPress={() => setManualGender((prev) => (prev === g ? null : g))}
                        className={`rounded-full px-4 py-1.5 ${manualGender === g ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                        <Text
                          className={`text-sm font-semibold ${manualGender === g ? 'text-white' : 'text-textLo'}`}>
                          {g === 'm' ? 'maschile (il)' : 'femminile (la)'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {effectiveManualPos === 'verb' && (
                <>
                  <Text className="mb-2 mt-4 text-sm font-semibold text-textLo">Auxiliary</Text>
                  <View className="flex-row gap-2">
                    {AUXILIARIES.map((a) => (
                      <Pressable
                        key={a}
                        onPress={() => setManualAux(a)}
                        className={`rounded-full px-4 py-1.5 ${manualAux === a ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                        <Text
                          className={`text-sm font-semibold ${manualAux === a ? 'text-white' : 'text-textLo'}`}>
                          {a}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* Tense selection — verbs only */}
          {isVerb && (
            <>
              <Text className="mb-2 mt-6 text-sm font-semibold text-textLo">
                Conjugation tenses
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {TENSES.map((t) => {
                  const active = tenses.includes(t);
                  return (
                    <Pressable
                      key={t}
                      onPress={() => toggleTense(t)}
                      className={`rounded-full px-3.5 py-1.5 ${active ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                      <Text
                        className={`text-sm font-semibold ${active ? 'text-white' : 'text-textLo'}`}>
                        {TENSE_LABELS[t]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="mt-2 text-xs text-textLo">
                Full conjugation tables for the selected tenses will be saved with this verb.
              </Text>

              {/* Live conjugation preview for each selected tense */}
              {TENSES.filter((t) => tenses.includes(t)).map((t) => {
                const forms = previewForms(t);
                if (!forms) return null;
                return (
                  <View key={t} className="mt-3 overflow-hidden rounded-2xl bg-surface">
                    <View className="border-b border-border px-4 py-2">
                      <Text className="text-xs font-bold uppercase tracking-wide text-textLo">
                        {TENSE_LABELS[t]}
                      </Text>
                    </View>
                    {PERSONS.map((p, i) => (
                      <View
                        key={p}
                        className={`flex-row items-center justify-between px-4 py-2 ${
                          i > 0 ? 'border-t border-border' : ''
                        }`}>
                        <Text className="text-xs font-semibold text-textLo">
                          {PERSON_LABELS[p]}
                        </Text>
                        <View className="flex-row items-center gap-1">
                          <Text className="text-sm font-semibold text-textHi">
                            {forms[p] ?? '—'}
                          </Text>
                          {forms[p] ? <Speaker text={forms[p]!} lang="it" /> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}

          {/* Forms preview — nouns (sg/pl) and adjectives (gender × number). Italian only. */}
          {grammar &&
            (() => {
            const lemma = (selected?.lemma ?? query).trim();
            if (lemma.length < 2) return null;
            const gender = selected?.gender ?? manualGender;
            if (effectivePos === 'noun') {
              const f = nounForms(lemma, gender);
              return (
                <View className="mt-6">
                  <Text className="mb-2 text-sm font-semibold text-textLo">Forms</Text>
                  <View className="overflow-hidden rounded-2xl bg-surface">
                    <PreviewRow label="Singular" value={withArticle(f.singular, gender)} />
                    <PreviewRow label="Plural" value={withArticlePlural(f.plural, gender)} border />
                  </View>
                </View>
              );
            }
            if (effectivePos === 'adj') {
              const f = adjectiveForms(lemma);
              return (
                <View className="mt-6">
                  <Text className="mb-2 text-sm font-semibold text-textLo">Forms</Text>
                  <View className="overflow-hidden rounded-2xl bg-surface">
                    <PreviewRow label="Masc. sing." value={f.m_sg} />
                    <PreviewRow label="Fem. sing." value={f.f_sg} border />
                    <PreviewRow label="Masc. plur." value={f.m_pl} border />
                    <PreviewRow label="Fem. plur." value={f.f_pl} border />
                  </View>
                </View>
              );
            }
            return null;
          })()}

          {/* Topic — the theme this word belongs to (food, travel…) */}
          <Text className="mb-2 mt-6 text-sm font-semibold text-textLo">Topic</Text>
          <View className="flex-row flex-wrap gap-2">
            {TOPIC_VALUES.map((t) => {
              const active = topic === t;
              return (
                <Pressable
                  key={t}
                  accessibilityLabel={`Topic ${TOPIC_LABELS[t]}`}
                  onPress={() => setTopic(active ? null : t)}
                  className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 ${
                    active ? 'bg-primary' : 'bg-surfaceAlt'
                  }`}>
                  <Ionicons
                    name={TOPIC_ICONS[t]}
                    size={13}
                    color={active ? colors.onPrimary : colors.textLo}
                  />
                  <Text
                    className={`text-sm font-semibold ${active ? 'text-white' : 'text-textLo'}`}>
                    {TOPIC_LABELS[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Which list */}
          <Text className="mb-2 mt-6 text-sm font-semibold text-textLo">Add to</Text>
          <View className="flex-row gap-2">
            {(
              [
                { key: 'learning', label: 'To learn', icon: 'school-outline' },
                { key: 'known', label: 'Known', icon: 'checkmark-circle-outline' },
              ] as const
            ).map(({ key, label, icon }) => (
              <Pressable
                key={key}
                onPress={() => setStatus(key)}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl py-3 ${
                  status === key ? 'bg-primary' : 'bg-surface'
                }`}>
                <Ionicons
                  name={icon}
                  size={16}
                  color={status === key ? colors.onPrimary : colors.textLo}
                />
                <Text
                  className={`text-sm font-bold ${status === key ? 'text-white' : 'text-textLo'}`}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* English meaning */}
          <Text className="mb-2 mt-6 text-sm font-semibold text-textLo">
            {langInfo(sourceLang).name} meaning
          </Text>
          <View className="rounded-2xl bg-surface px-4">
            <TextInput
              value={translation}
              onChangeText={setTranslation}
              placeholder="e.g. to have"
              placeholderTextColor={colors.textLo}
              autoCapitalize="none"
              className="py-3.5 text-base text-textHi"
            />
          </View>

          {/* Notes */}
          <Text className="mb-2 mt-6 text-sm font-semibold text-textLo">Notes (optional)</Text>
          <View className="rounded-2xl bg-surface px-4">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything to remember…"
              placeholderTextColor={colors.textLo}
              multiline
              className="min-h-20 py-3.5 text-base text-textHi"
            />
          </View>

          {addWord.isError && (
            <Text className="mt-4 text-sm text-primary">{addWord.error.message}</Text>
          )}
          </Container>
        </ScrollView>

        {/* Save */}
        <View className="px-5 pb-2 pt-2">
          <Container max={MAX_W.content}>
            <Pressable
              accessibilityLabel="Save word"
              disabled={!canSave}
              onPress={save}
              className={`items-center rounded-full py-4 ${canSave ? 'bg-primary' : 'bg-surfaceAlt'}`}>
              {addWord.isPending ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text className={`text-base font-bold ${canSave ? 'text-white' : 'text-textLo'}`}>
                  {extraSenses.length > 0 ? `Save ${extraSenses.length + 1} words` : 'Save word'}
                </Text>
              )}
            </Pressable>
          </Container>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
