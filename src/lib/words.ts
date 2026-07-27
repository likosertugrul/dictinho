import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { conjugateRegular } from '@/lib/conjugator';
import type { Auxiliary, Cefr, Pos, Tense } from '@/lib/italian';
import { PERSONS } from '@/lib/italian';
import { useLangStore, useTargetLang } from '@/lib/lang';
import { userWordSchema, type UserWord, type WordStatus } from '@/lib/schemas';
import { ensureSession, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export interface NewWord {
  lemma: string;
  translation: string;
  pos: Pos;
  gender: 'm' | 'f' | null;
  auxiliary: Auxiliary | null;
  cefr: Cefr | null;
  lexicon_ref: string | null;
  notes: string | null;
  status: WordStatus;
  /** Verbs only: tenses whose conjugation tables should be attached. */
  tenses: Tense[];
}

interface ConjugationTarget {
  lemma: string;
  auxiliary: Auxiliary | null;
  lexicon_ref: string | null;
}

/**
 * Attach conjugation rows to a saved verb for the given tenses, skipping
 * tenses the word already has. Prefers the pre-generated tables on the base
 * lexicon entry; falls back to the rule-based conjugator for regular verbs.
 */
export async function attachConjugations(
  wordId: string,
  word: ConjugationTarget,
  tenses: Tense[],
): Promise<void> {
  const supabase = getSupabase();

  // Idempotent: only add tenses that aren't saved yet
  const { data: existing, error: exErr } = await supabase
    .from('conjugations')
    .select('tense')
    .eq('user_word_id', wordId);
  if (exErr) throw new Error(exErr.message);
  const have = new Set((existing ?? []).map((r) => r.tense));
  const missing = tenses.filter((t) => !have.has(t));
  if (missing.length === 0) return;

  let rows: {
    user_word_id: string;
    tense: string;
    person: string;
    form: string;
    is_compound: boolean;
    source: string;
  }[] = [];

  if (word.lexicon_ref) {
    const { data, error } = await supabase
      .from('conjugations')
      .select('tense, person, form, is_compound')
      .eq('lexicon_ref', word.lexicon_ref)
      .in('tense', missing);
    if (error) throw new Error(error.message);
    rows = (data ?? []).map((c) => ({
      user_word_id: wordId,
      tense: c.tense,
      person: c.person,
      form: c.form,
      is_compound: c.is_compound,
      source: 'ai',
    }));
  }

  if (rows.length === 0) {
    // Custom verb — rule-based fallback (regular verbs only)
    for (const tense of missing) {
      const forms = conjugateRegular(word.lemma, tense, word.auxiliary ?? 'avere');
      if (!forms) continue;
      for (const person of PERSONS) {
        rows.push({
          user_word_id: wordId,
          tense,
          person,
          form: forms[person],
          is_compound: tense === 'passato_prossimo',
          source: 'rule',
        });
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('conjugations').insert(rows);
    if (error) throw new Error(error.message);
  }
}

export function useAddWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (word: NewWord) => {
      const session = await ensureSession();
      const supabase = getSupabase();
      const { tenses, ...fields } = word;
      const lemma = fields.lemma.trim();
      const target = useLangStore.getState().target ?? 'it';

      // Upsert: re-adding an existing word merges into it instead of duplicating
      // (DB also enforces unique user_id + lower(lemma) + pos)
      const { data: dup, error: dupErr } = await supabase
        .from('user_words')
        .select('*')
        .eq('user_id', session!.user.id)
        .eq('target_language', target)
        .eq('pos', fields.pos)
        .ilike('lemma', lemma) // case-insensitive equality (no wildcards)
        .maybeSingle();
      if (dupErr) throw new Error(dupErr.message);

      let saved: UserWord;
      if (dup) {
        const { data, error } = await supabase
          .from('user_words')
          .update({
            translation: fields.translation,
            status: fields.status, // re-adding can move a word between lists
            // fill in fields the older entry may be missing; keep existing notes
            lexicon_ref: fields.lexicon_ref ?? dup.lexicon_ref,
            auxiliary: fields.auxiliary ?? dup.auxiliary,
            gender: fields.gender ?? dup.gender,
            cefr: fields.cefr ?? dup.cefr,
            notes: fields.notes ?? dup.notes,
          })
          .eq('id', dup.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        saved = userWordSchema.parse(data);
      } else {
        const { data, error } = await supabase
          .from('user_words')
          .insert({
            user_id: session!.user.id,
            source_language: 'en',
            target_language: target,
            ...fields,
            lemma,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        saved = userWordSchema.parse(data);
      }

      if (word.pos === 'verb' && tenses.length > 0) {
        await attachConjugations(saved.id, saved, tenses);
      }
      return saved;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['user-words'] });
      qc.invalidateQueries({ queryKey: ['conjugations', saved.id] });
    },
  });
}

export function useToggleFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, flagged }: { id: string; flagged: boolean }) => {
      const { data, error } = await getSupabase()
        .from('user_words')
        .update({ flagged })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return userWordSchema.parse(data);
    },
    // Optimistic: flip immediately in both the list and the detail cache
    onMutate: async ({ id, flagged }) => {
      await qc.cancelQueries({ queryKey: ['user-words'] });
      qc.setQueriesData<UserWord[]>({ queryKey: ['user-words', 'recent'] }, (old) =>
        old?.map((w) => (w.id === id ? { ...w, flagged } : w)),
      );
      qc.setQueryData<UserWord>(['user-words', 'detail', id], (old) =>
        old ? { ...old, flagged } : old,
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ['user-words'] }),
    onSuccess: (saved) => {
      qc.setQueryData(['user-words', 'detail', saved.id], saved);
    },
  });
}

export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WordStatus }) => {
      const { data, error } = await getSupabase()
        .from('user_words')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return userWordSchema.parse(data);
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['user-words'] });
      qc.setQueriesData<UserWord[]>({ queryKey: ['user-words', 'recent'] }, (old) =>
        old?.map((w) => (w.id === id ? { ...w, status } : w)),
      );
      qc.setQueryData<UserWord>(['user-words', 'detail', id], (old) =>
        old ? { ...old, status } : old,
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ['user-words'] }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['user-words'] });
      qc.setQueryData(['user-words', 'detail', saved.id], saved);
    },
  });
}

export function useUpdateNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data, error } = await getSupabase()
        .from('user_words')
        .update({ notes: notes.trim() || null })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return userWordSchema.parse(data);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['user-words'] });
      qc.setQueryData(['user-words', 'detail', saved.id], saved);
    },
  });
}

export function useAddTenses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ word, tenses }: { word: UserWord; tenses: Tense[] }) => {
      await attachConjugations(word.id, word, tenses);
      return word.id;
    },
    onSuccess: (wordId) => qc.invalidateQueries({ queryKey: ['conjugations', wordId] }),
  });
}

export function useDeleteWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Cascades: conjugations, example_sentences, tag links (FK on delete cascade)
      const { error } = await getSupabase().from('user_words').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['user-words'] });
      qc.removeQueries({ queryKey: ['user-words', 'detail', id] });
      qc.removeQueries({ queryKey: ['conjugations', id] });
    },
  });
}

/** Read-only conjugation tables of a BASE lexicon entry (public rows). */
export function useLexiconConjugations(lexiconRef: string | null) {
  return useQuery({
    queryKey: ['lexicon-conjugations', lexiconRef],
    enabled: isSupabaseConfigured && !!lexiconRef,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('conjugations')
        .select('tense, person, form, is_compound')
        .eq('lexicon_ref', lexiconRef!);
      if (error) throw new Error(error.message);
      return z.array(conjugationRowSchema).parse(data ?? []);
    },
  });
}

const exampleRowSchema = z.object({
  target_text: z.string(),
  source_text: z.string(),
  tense: z.string().nullable(),
});
export type ExampleRow = z.infer<typeof exampleRowSchema>;

/**
 * Example sentences for a word: rows attached to the word itself plus the
 * shared ones on its base-lexicon entry.
 */
export function useExamples(word: UserWord | undefined) {
  return useQuery({
    queryKey: ['examples', word?.id, word?.lexicon_ref],
    enabled: isSupabaseConfigured && !!word,
    queryFn: async () => {
      const filters = [`user_word_id.eq.${word!.id}`];
      if (word!.lexicon_ref) filters.push(`lexicon_ref.eq.${word!.lexicon_ref}`);
      const { data, error } = await getSupabase()
        .from('example_sentences')
        .select('target_text, source_text, tense')
        .or(filters.join(','));
      if (error) throw new Error(error.message);
      return z.array(exampleRowSchema).parse(data ?? []);
    },
  });
}

/**
 * Re-generate a verb's conjugation tables via AI (stronger model) and replace
 * the word's existing tenses — the "Re-check with AI" button on the word card.
 */
export function useRecheckConjugations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (word: UserWord) => {
      const supabase = getSupabase();

      // Which tenses does this word currently have?
      const { data: have, error: hErr } = await supabase
        .from('conjugations')
        .select('tense')
        .eq('user_word_id', word.id);
      if (hErr) throw new Error(hErr.message);
      const tenses = [...new Set((have ?? []).map((r) => r.tense))];
      if (tenses.length === 0) throw new Error('No tenses to re-check yet.');

      // Fresh tables from the Edge Function
      const { data, error } = await supabase.functions.invoke('enrich-word', {
        body: { action: 'conjugate', lemma: word.lemma, auxiliary: word.auxiliary ?? 'avere' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const tables = (data?.tenses ?? {}) as Record<string, Record<string, string>>;

      // Replace each existing tense's rows
      const rows: {
        user_word_id: string;
        tense: string;
        person: string;
        form: string;
        is_compound: boolean;
        source: string;
      }[] = [];
      for (const t of tenses) {
        const forms = tables[t];
        if (!forms) continue;
        for (const p of PERSONS) {
          if (!forms[p]?.trim()) continue;
          rows.push({
            user_word_id: word.id,
            tense: t,
            person: p,
            form: forms[p].trim(),
            is_compound: t === 'passato_prossimo',
            source: 'ai',
          });
        }
      }
      if (rows.length === 0) throw new Error('AI returned no usable conjugations.');

      await supabase.from('conjugations').delete().eq('user_word_id', word.id).in('tense', tenses);
      const { error: insErr } = await supabase.from('conjugations').insert(rows);
      if (insErr) throw new Error(insErr.message);
      return word.id;
    },
    onSuccess: (wordId) => qc.invalidateQueries({ queryKey: ['conjugations', wordId] }),
  });
}

export function useRemoveTense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wordId, tense }: { wordId: string; tense: Tense }) => {
      const { error } = await getSupabase()
        .from('conjugations')
        .delete()
        .eq('user_word_id', wordId)
        .eq('tense', tense);
      if (error) throw new Error(error.message);
      return wordId;
    },
    onSuccess: (wordId) => qc.invalidateQueries({ queryKey: ['conjugations', wordId] }),
  });
}

export function useWord(id: string) {
  return useQuery({
    queryKey: ['user-words', 'detail', id],
    enabled: isSupabaseConfigured && !!id,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('user_words')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return userWordSchema.parse(data);
    },
  });
}

const conjugationRowSchema = z.object({
  tense: z.string(),
  person: z.string(),
  form: z.string(),
  is_compound: z.boolean(),
});
export type ConjugationRow = z.infer<typeof conjugationRowSchema>;

export function useConjugations(wordId: string) {
  return useQuery({
    queryKey: ['conjugations', wordId],
    enabled: isSupabaseConfigured && !!wordId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('conjugations')
        .select('tense, person, form, is_compound')
        .eq('user_word_id', wordId);
      if (error) throw new Error(error.message);
      return z.array(conjugationRowSchema).parse(data ?? []);
    },
  });
}

/** The user's words for the active target language (paged past the 1000-row cap). */
export function useRecentWords() {
  const target = useTargetLang();
  return useQuery({
    queryKey: ['user-words', 'recent', target],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const supabase = getSupabase();
      // No session yet → no words yet; skip the RLS-blocked query.
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return [];
      const all: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('user_words')
          .select('*')
          .eq('target_language', target)
          .order('created_at', { ascending: false })
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return z.array(userWordSchema).parse(all);
    },
  });
}
