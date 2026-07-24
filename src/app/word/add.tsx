import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
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

import { useEnrichWord } from '@/hooks/use-enrich-word';
import { useLexiconSearch, type SearchLang } from '@/hooks/use-lexicon-search';
import { conjugateRegular } from '@/lib/conjugator';
import {
  AUXILIARIES,
  PERSON_LABELS,
  PERSONS,
  POS_VALUES,
  TENSE_LABELS,
  TENSES,
  withArticle,
  type Auxiliary,
  type Person,
  type Pos,
  type Tense,
} from '@/lib/italian';
import type { LexiconSuggestion } from '@/lib/schemas';
import { useAddWord, useLexiconConjugations } from '@/lib/words';
import { colors } from '@/theme/tokens';

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

export default function AddWordScreen() {
  const [query, setQuery] = useState('');
  const [searchLang, setSearchLang] = useState<SearchLang>('it');
  const [selected, setSelected] = useState<LexiconSuggestion | null>(null);
  const [translation, setTranslation] = useState('');
  const [notes, setNotes] = useState('');
  // Only Presente is pre-selected; the user can add more tenses per verb
  const [tenses, setTenses] = useState<Tense[]>(['presente']);

  // Manual attributes — used when the word isn't in the base lexicon
  const [manualPos, setManualPos] = useState<Pos>('noun');
  const [manualGender, setManualGender] = useState<'m' | 'f' | null>(null);
  const [manualAux, setManualAux] = useState<Auxiliary>('avere');

  const effectivePos: Pos = selected?.pos ?? manualPos;
  const isVerb = effectivePos === 'verb';
  // Manual add only makes sense when typing Italian — an unmatched English
  // query must not become an Italian lemma
  const isCustom = !selected && searchLang === 'it' && query.trim().length >= 2;

  const toggleTense = (t: Tense) =>
    setTenses((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const search = useLexiconSearch(query, searchLang);
  const addWord = useAddWord();
  const enrich = useEnrichWord();
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

  const pick = (s: LexiconSuggestion) => {
    Keyboard.dismiss();
    setSelected(s);
    setQuery(s.lemma);
    setTranslation(s.translation ?? '');
  };

  const runEnrich = () => {
    const term = query.trim();
    if (!term) return;
    enrich.mutate(term, {
      onSuccess: (s) => {
        pick(s); // treat the AI-added entry exactly like a dictionary match
        if (s.pos === 'verb') setTenses(['presente']);
      },
    });
  };

  const reset = () => {
    setSelected(null);
    setTranslation('');
  };

  const canSave = query.trim().length > 0 && translation.trim().length > 0 && !addWord.isPending;

  const save = () => {
    addWord.mutate(
      {
        lemma: selected?.lemma ?? query.trim(),
        translation: translation.trim(),
        pos: effectivePos,
        gender: selected?.gender ?? (effectivePos === 'noun' ? manualGender : null),
        auxiliary: selected?.auxiliary ?? (isVerb ? manualAux : null),
        cefr: selected?.cefr ?? null,
        lexicon_ref: selected?.id ?? null,
        notes: notes.trim() || null,
        tenses: isVerb ? tenses : [],
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-3">
          <Text className="text-2xl font-bold text-textHi">Add word</Text>
          <Pressable
            accessibilityLabel="Close"
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
            <Ionicons name="close" size={20} color={colors.textHi} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-6"
          keyboardShouldPersistTaps="handled">
          {/* Search input + language direction toggle */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-textLo">
              {searchLang === 'it' ? 'Italian word' : 'Search in English'}
            </Text>
            <View className="flex-row gap-1.5">
              {(
                [
                  { key: 'it', label: 'IT 🇮🇹' },
                  { key: 'en', label: 'EN 🇬🇧' },
                ] as const
              ).map(({ key, label }) => (
                <Pressable
                  key={key}
                  accessibilityLabel={key === 'it' ? 'Search Italian words' : 'Search by English meaning'}
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
          <View className="rounded-2xl bg-surface px-4">
            <TextInput
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                if (selected && t !== selected.lemma) reset();
              }}
              placeholder={searchLang === 'it' ? 'e.g. avere' : 'e.g. to have'}
              placeholderTextColor={colors.textLo}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              className="py-3.5 text-base text-textHi"
            />
          </View>

          {searchLang === 'en' &&
            !selected &&
            query.trim().length >= 2 &&
            !search.isFetching &&
            suggestions.length === 0 && (
              <Text className="mt-2 px-1 text-xs text-textLo">
                No match found — switch to IT and type the Italian word to add it (with AI).
              </Text>
            )}

          {search.isFetching && !selected && (
            <View className="mt-2 flex-row items-center gap-2 px-1">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text className="text-xs text-textLo">Searching…</Text>
            </View>
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
                  </View>
                  <View className="flex-row items-center gap-1.5">
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

          {/* Manual attributes — shown when the word isn't found in the dictionary */}
          {isCustom && (
            <>
              {!search.isFetching && suggestions.length === 0 && (
                <>
                  {/* AI look-up: fills type/meaning/auxiliary + correct conjugations */}
                  <Pressable
                    accessibilityLabel="Add with AI"
                    disabled={enrich.isPending}
                    onPress={runEnrich}
                    className="mt-3 flex-row items-center justify-center gap-2 rounded-full bg-primary py-3.5">
                    {enrich.isPending ? (
                      <>
                        <ActivityIndicator color={colors.onPrimary} />
                        <Text className="text-sm font-bold text-white">Looking up “{query.trim()}”…</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={16} color={colors.onPrimary} />
                        <Text className="text-sm font-bold text-white">
                          Add “{query.trim()}” with AI
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
                    onPress={() => setManualPos(p)}
                    className={`rounded-full px-3.5 py-1.5 ${manualPos === p ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                    <Text
                      className={`text-sm font-semibold ${manualPos === p ? 'text-white' : 'text-textLo'}`}>
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {manualPos === 'noun' && (
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

              {manualPos === 'verb' && (
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
                        <Text className="text-sm font-semibold text-textHi">
                          {forms[p] ?? '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}

          {/* English meaning */}
          <Text className="mb-2 mt-6 text-sm font-semibold text-textLo">English meaning</Text>
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
        </ScrollView>

        {/* Save */}
        <View className="px-5 pb-2 pt-2">
          <Pressable
            accessibilityLabel="Save word"
            disabled={!canSave}
            onPress={save}
            className={`items-center rounded-full py-4 ${canSave ? 'bg-primary' : 'bg-surfaceAlt'}`}>
            {addWord.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text className={`text-base font-bold ${canSave ? 'text-white' : 'text-textLo'}`}>
                Save word
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
