import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  PERSON_LABELS,
  PERSONS,
  TENSE_LABELS,
  TENSES,
  withArticle,
  type Person,
  type Tense,
} from '@/lib/italian';
import {
  useAddTenses,
  useConjugations,
  useDeleteWord,
  useExamples,
  useRemoveTense,
  useToggleFlag,
  useUpdateNotes,
  useWord,
} from '@/lib/words';
import { speechService } from '@/services/speech';
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

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const word = useWord(id);
  const conjugations = useConjugations(id);
  const updateNotes = useUpdateNotes();
  const addTenses = useAddTenses();
  const removeTense = useRemoveTense();
  const deleteWord = useDeleteWord();
  const examples = useExamples(word.data);
  const toggleFlag = useToggleFlag();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Tenses that actually have saved forms, in canonical order
  const availableTenses = useMemo(() => {
    const present = new Set(conjugations.data?.map((c) => c.tense));
    return TENSES.filter((t) => present.has(t));
  }, [conjugations.data]);
  const missingTenses = useMemo(
    () => TENSES.filter((t) => !availableTenses.includes(t)),
    [availableTenses],
  );

  const [activeTense, setActiveTense] = useState<Tense | null>(null);
  const tense = activeTense && availableTenses.includes(activeTense) ? activeTense : availableTenses[0];

  // Notes editing
  const [notesDraft, setNotesDraft] = useState('');
  useEffect(() => {
    if (word.data) setNotesDraft(word.data.notes ?? '');
  }, [word.data]);
  const notesDirty = word.data != null && notesDraft !== (word.data.notes ?? '');

  const forms = useMemo(() => {
    const map = {} as Record<Person, string>;
    for (const c of conjugations.data ?? []) {
      if (c.tense === tense) map[c.person as Person] = c.form;
    }
    return map;
  }, [conjugations.data, tense]);

  if (word.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const w = word.data;
  if (!w) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <Text className="text-textLo">Word not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-start justify-between px-5 py-3">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-3xl font-bold text-textHi">
              {w.pos === 'noun' ? withArticle(w.lemma, w.gender) : w.lemma}
            </Text>
            {/* TTS — wired up in Faz 7; hidden while unavailable */}
            {speechService.isAvailable && (
              <Pressable
                accessibilityLabel="Pronounce"
                onPress={() => speechService.speak(w.lemma, { language: 'it' })}
                className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
                <Ionicons name="volume-medium" size={18} color={colors.textHi} />
              </Pressable>
            )}
          </View>
          <Text className="mt-1 text-base text-textLo">{w.translation}</Text>
          <View className="mt-2 flex-row items-center gap-1.5">
            <Badge label={w.pos} />
            {w.auxiliary ? <Badge label={w.auxiliary} tone="primary" /> : null}
            {w.gender ? <Badge label={w.gender} /> : null}
            {w.cefr ? <Badge label={w.cefr} /> : null}
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          {/* Flag for review */}
          <Pressable
            accessibilityLabel={w.flagged ? 'Unflag word' : 'Flag for review'}
            onPress={() => toggleFlag.mutate({ id: w.id, flagged: !w.flagged })}
            className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
            <Ionicons
              name={w.flagged ? 'star' : 'star-outline'}
              size={18}
              color={w.flagged ? colors.pastel.yellow : colors.textHi}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Close"
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
            <Ionicons name="close" size={20} color={colors.textHi} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-8"
          keyboardShouldPersistTaps="handled">
          {/* Conjugation tables */}
          {w.pos === 'verb' && (
            <View className="mt-2">
              <Text className="mb-3 text-lg font-bold text-textHi">Conjugation</Text>

              {availableTenses.length > 0 && tense && (
                <>
                  {/* Tense tabs */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-3"
                    contentContainerClassName="gap-2">
                    {availableTenses.map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setActiveTense(t)}
                        className={`rounded-full px-4 py-1.5 ${t === tense ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                        <Text
                          className={`text-sm font-semibold ${t === tense ? 'text-white' : 'text-textLo'}`}>
                          {TENSE_LABELS[t]}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {/* Person table */}
                  <View className="overflow-hidden rounded-card bg-surface">
                    {PERSONS.map((p, i) => (
                      <View
                        key={p}
                        className={`flex-row items-center justify-between px-4 py-3 ${
                          i > 0 ? 'border-t border-border' : ''
                        }`}>
                        <Text className="text-sm font-semibold text-textLo">{PERSON_LABELS[p]}</Text>
                        <Text className="text-base font-semibold text-textHi">{forms[p] ?? '—'}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Remove the active tense */}
                  <Pressable
                    accessibilityLabel={`Remove ${TENSE_LABELS[tense]}`}
                    disabled={removeTense.isPending}
                    onPress={() => removeTense.mutate({ wordId: w.id, tense })}
                    className="mt-2 flex-row items-center justify-end gap-1 px-1 py-1">
                    {removeTense.isPending ? (
                      <ActivityIndicator size="small" color={colors.textLo} />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={14} color={colors.textLo} />
                        <Text className="text-xs font-semibold text-textLo">
                          Remove {TENSE_LABELS[tense]}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {removeTense.isError && (
                    <Text className="mt-1 text-right text-sm text-primary">
                      {removeTense.error.message}
                    </Text>
                  )}
                </>
              )}

              {!conjugations.isLoading && availableTenses.length === 0 && (
                <Text className="mb-1 text-sm text-textLo">
                  No conjugations saved for this verb yet — add a tense below.
                </Text>
              )}

              {/* Add missing tenses */}
              {missingTenses.length > 0 && (
                <View className="mt-4">
                  <Text className="mb-2 text-sm font-semibold text-textLo">Add tenses</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {missingTenses.map((t) => (
                      <Pressable
                        key={t}
                        disabled={addTenses.isPending}
                        onPress={() => addTenses.mutate({ word: w, tenses: [t] })}
                        className="flex-row items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5">
                        <Ionicons name="add" size={14} color={colors.primary} />
                        <Text className="text-sm font-semibold text-textHi">{TENSE_LABELS[t]}</Text>
                      </Pressable>
                    ))}
                    {addTenses.isPending && (
                      <ActivityIndicator size="small" color={colors.primary} />
                    )}
                  </View>
                  {addTenses.isError && (
                    <Text className="mt-2 text-sm text-primary">{addTenses.error.message}</Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Notes — editable */}
          <View className="mt-6">
            <Text className="mb-2 text-lg font-bold text-textHi">Notes</Text>
            <View className="rounded-card bg-surface px-4">
              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                placeholder="Add a note for this word…"
                placeholderTextColor={colors.textLo}
                multiline
                className="min-h-20 py-3 text-sm text-textHi"
              />
            </View>
            {notesDirty && (
              <Pressable
                accessibilityLabel="Save notes"
                disabled={updateNotes.isPending}
                onPress={() => updateNotes.mutate({ id: w.id, notes: notesDraft })}
                className="mt-3 items-center rounded-full bg-primary py-3">
                {updateNotes.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text className="text-sm font-bold text-white">Save notes</Text>
                )}
              </Pressable>
            )}
            {updateNotes.isError && (
              <Text className="mt-2 text-sm text-primary">{updateNotes.error.message}</Text>
            )}
          </View>

          {/* Example sentences */}
          {(examples.data?.length ?? 0) > 0 && (
            <View className="mt-6">
              <Text className="mb-2 text-lg font-bold text-textHi">Examples</Text>
              <View className="overflow-hidden rounded-card bg-surface">
                {examples.data!.map((ex, i) => (
                  <View
                    key={`${ex.target_text}-${i}`}
                    className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <View className="flex-row items-start justify-between gap-2">
                      <Text className="flex-1 text-base font-semibold text-textHi">
                        {ex.target_text}
                      </Text>
                      {ex.tense ? (
                        <View className="rounded-full bg-surfaceAlt px-2 py-0.5">
                          <Text className="text-[10px] font-semibold text-textLo">
                            {TENSE_LABELS[ex.tense as Tense] ?? ex.tense}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="mt-1 text-sm text-textLo">{ex.source_text}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Delete word — two-step inline confirm (works on web too) */}
          <View className="mt-10">
            {!confirmingDelete ? (
              <Pressable
                accessibilityLabel="Delete word"
                onPress={() => setConfirmingDelete(true)}
                className="flex-row items-center justify-center gap-1.5 rounded-full border border-border py-3">
                <Ionicons name="trash-outline" size={16} color={colors.primary} />
                <Text className="text-sm font-semibold text-primary">Delete word</Text>
              </Pressable>
            ) : (
              <View className="rounded-card bg-surface p-4">
                <Text className="text-center text-sm text-textHi">
                  Delete “{w.lemma}” and all its conjugations?
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    accessibilityLabel="Cancel delete"
                    disabled={deleteWord.isPending}
                    onPress={() => setConfirmingDelete(false)}
                    className="flex-1 items-center rounded-full bg-surfaceAlt py-3">
                    <Text className="text-sm font-bold text-textHi">Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Confirm delete"
                    disabled={deleteWord.isPending}
                    onPress={() =>
                      deleteWord.mutate(w.id, { onSuccess: () => router.back() })
                    }
                    className="flex-1 items-center rounded-full bg-primary py-3">
                    {deleteWord.isPending ? (
                      <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                      <Text className="text-sm font-bold text-white">Delete</Text>
                    )}
                  </Pressable>
                </View>
                {deleteWord.isError && (
                  <Text className="mt-2 text-center text-sm text-primary">
                    {deleteWord.error.message}
                  </Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
