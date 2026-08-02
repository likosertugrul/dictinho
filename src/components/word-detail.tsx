import { Ionicons } from '@expo/vector-icons';
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

import { ArticleInfo } from '@/components/article-info';
import { Speaker } from '@/components/speaker';
import { adjectiveForms } from '@/lib/inflect';
import {
  PERSON_LABELS,
  PERSONS,
  TENSE_LABELS,
  TENSES,
  withArticle,
  type Person,
  type Tense,
} from '@/lib/italian';
import { hasGrammar } from '@/lib/lang';
import type { UserWord } from '@/lib/schemas';
import {
  useAddTenses,
  useConjugations,
  useDeleteWord,
  useExamples,
  useRecheckConjugations,
  useRecheckForms,
  useRemoveTense,
  useSetStatus,
  useToggleFlag,
  useUpdateNotes,
  useWord,
} from '@/lib/words';
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

function FormsHeader({
  recheck,
  word,
}: {
  recheck: ReturnType<typeof useRecheckForms>;
  word: UserWord;
}) {
  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-textHi">Forms</Text>
        {/* Fix irregular/invariable inflection with a stronger AI model. */}
        <Pressable
          accessibilityLabel="Re-check forms with AI"
          disabled={recheck.isPending}
          onPress={() => recheck.mutate(word)}
          className="flex-row items-center gap-1 rounded-full bg-surfaceAlt px-3 py-1.5">
          {recheck.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="sparkles" size={13} color={colors.primary} />
          )}
          <Text className="text-xs font-bold text-textHi">
            {recheck.isPending ? 'Checking…' : 'Re-check with AI'}
          </Text>
        </Pressable>
      </View>
      {recheck.isError && <Text className="mb-2 text-sm text-primary">{recheck.error.message}</Text>}
      {recheck.isSuccess && !recheck.isPending && (
        <Text className="mb-2 text-xs" style={{ color: colors.pastel.mint }}>
          Forms refreshed.
        </Text>
      )}
    </View>
  );
}

function FormRow({ label, value, border }: { label: string; value: string; border?: boolean }) {
  // Forms (noun/adjective inflection) are Italian-only.
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${border ? 'border-t border-border' : ''}`}>
      <Text className="text-sm font-semibold text-textLo">{label}</Text>
      <View className="flex-row items-center gap-1">
        <Text className="text-base font-semibold text-textHi">{value}</Text>
        <Speaker text={value} lang="it" />
      </View>
    </View>
  );
}

/**
 * The word card: headword, articles/forms, conjugations, notes and examples.
 * Used both as the `word/[id]` screen and as an overlay during practice
 * (`embedded` hides destructive actions so a drill session can't lose its card).
 */
export function WordDetail({
  id,
  onClose,
  embedded = false,
}: {
  id: string;
  onClose: () => void;
  embedded?: boolean;
}) {
  const word = useWord(id);
  const conjugations = useConjugations(id);
  const updateNotes = useUpdateNotes();
  const addTenses = useAddTenses();
  const removeTense = useRemoveTense();
  const recheck = useRecheckConjugations();
  const recheckForms = useRecheckForms();
  const deleteWord = useDeleteWord();
  const examples = useExamples(word.data);
  const toggleFlag = useToggleFlag();
  const setStatus = useSetStatus();
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
  const tense =
    activeTense && availableTenses.includes(activeTense) ? activeTense : availableTenses[0];

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
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const w = word.data;
  if (!w) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Text className="text-textLo">Word not found.</Text>
      </View>
    );
  }

  const headword =
    hasGrammar(w.target_language) && w.pos === 'noun' ? withArticle(w.lemma, w.gender) : w.lemma;

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="flex-row items-start justify-between px-5 py-3">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-3xl font-bold text-textHi">{headword}</Text>
            <Speaker
              text={headword}
              lang={w.target_language}
              variant="chip"
              label="Pronounce"
              size={18}
            />
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
            onPress={onClose}
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
          {/* Move between lists */}
          <View className="mt-1 flex-row gap-2">
            {(
              [
                { key: 'learning', label: 'To learn', icon: 'school-outline' },
                { key: 'known', label: 'Known', icon: 'checkmark-circle-outline' },
              ] as const
            ).map(({ key, label, icon }) => {
              const active = w.status === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setStatus.mutate({ id: w.id, status: key })}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl py-3 ${
                    active ? 'bg-primary' : 'bg-surface'
                  }`}>
                  <Ionicons name={icon} size={16} color={active ? colors.onPrimary : colors.textLo} />
                  <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-textLo'}`}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Nouns: every article + inflected form (definite/indefinite, sg/pl). */}
          {hasGrammar(w.target_language) && w.pos === 'noun' && (
            <View className="mt-4">
              <FormsHeader recheck={recheckForms} word={w} />
              <ArticleInfo word={w} title={null} />
            </View>
          )}

          {/* Adjectives: gender × number. w.forms is an AI-corrected override;
              otherwise fall back to rule-based inflection. */}
          {hasGrammar(w.target_language) &&
            w.pos === 'adj' &&
            (() => {
              const rule = adjectiveForms(w.lemma);
              const m_sg = w.forms?.m_sg ?? rule.m_sg;
              const f_sg = w.forms?.f_sg ?? rule.f_sg;
              const m_pl = w.forms?.m_pl ?? rule.m_pl;
              const f_pl = w.forms?.f_pl ?? rule.f_pl;
              const invariant = !w.forms && !rule.fourForms;
              return (
                <View className="mt-4">
                  <FormsHeader recheck={recheckForms} word={w} />
                  <View className="overflow-hidden rounded-card bg-surface">
                    <FormRow label="Masc. sing." value={m_sg} />
                    <FormRow label="Fem. sing." value={f_sg} border />
                    <FormRow label="Masc. plur." value={m_pl} border />
                    <FormRow label="Fem. plur." value={f_pl} border />
                  </View>
                  {invariant && (
                    <Text className="mt-2 px-1 text-xs text-textLo">
                      This adjective has the same form for both genders.
                    </Text>
                  )}
                </View>
              );
            })()}

          {/* Conjugation tables — Italian only */}
          {hasGrammar(w.target_language) && w.pos === 'verb' && (
            <View className="mt-2">
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-lg font-bold text-textHi">Conjugation</Text>
                {/* Re-check with a stronger AI model (fixes occasional errors) */}
                {availableTenses.length > 0 && (
                  <Pressable
                    accessibilityLabel="Re-check conjugations with AI"
                    disabled={recheck.isPending}
                    onPress={() => recheck.mutate(w)}
                    className="flex-row items-center gap-1 rounded-full bg-surfaceAlt px-3 py-1.5">
                    {recheck.isPending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="sparkles" size={13} color={colors.primary} />
                    )}
                    <Text className="text-xs font-bold text-textHi">
                      {recheck.isPending ? 'Checking…' : 'Re-check with AI'}
                    </Text>
                  </Pressable>
                )}
              </View>
              {recheck.isError && (
                <Text className="mb-2 text-sm text-primary">{recheck.error.message}</Text>
              )}
              {recheck.isSuccess && !recheck.isPending && (
                <Text className="mb-2 text-xs" style={{ color: colors.pastel.mint }}>
                  Conjugations refreshed.
                </Text>
              )}

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
                        <View className="flex-row items-center gap-1">
                          <Text className="text-base font-semibold text-textHi">
                            {forms[p] ?? '—'}
                          </Text>
                          {forms[p] ? <Speaker text={forms[p]!} lang="it" /> : null}
                        </View>
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
                    {addTenses.isPending && <ActivityIndicator size="small" color={colors.primary} />}
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
                      <View className="flex-row items-center gap-1">
                        {ex.tense ? (
                          <View className="rounded-full bg-surfaceAlt px-2 py-0.5">
                            <Text className="text-[10px] font-semibold text-textLo">
                              {TENSE_LABELS[ex.tense as Tense] ?? ex.tense}
                            </Text>
                          </View>
                        ) : null}
                        <Speaker text={ex.target_text} lang={w.target_language} />
                      </View>
                    </View>
                    <Text className="mt-1 text-sm text-textLo">{ex.source_text}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Delete word — two-step inline confirm (works on web too).
              Hidden while practicing: deleting the card under review breaks the session. */}
          {!embedded && (
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
                      onPress={() => deleteWord.mutate(w.id, { onSuccess: onClose })}
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
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
