import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { userWordSchema, type UserWord } from '@/lib/schemas';
import { ensureSession, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

// ── SM-2 spaced-repetition algorithm ────────────────────────────────────────
export interface SrsState {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
}

/** Review button → SM-2 quality (0–5). */
export const RATINGS = {
  again: 2,
  hard: 3,
  good: 4,
  easy: 5,
} as const;
export type Rating = keyof typeof RATINGS;

/** Pure SM-2 step. Returns the next scheduling state + days until due. */
export function sm2(prev: SrsState, quality: number): SrsState & { intervalDays: number } {
  let { repetitions, interval_days: interval } = prev;

  if (quality < 3) {
    // Lapse — restart the ladder, see it again very soon
    repetitions = 0;
    interval = 0;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * prev.ease_factor);
  }

  // Ease adjustment (clamped at 1.3)
  const ease = Math.max(
    1.3,
    prev.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  return {
    ease_factor: Number(ease.toFixed(2)),
    interval_days: interval,
    repetitions,
    intervalDays: interval,
  };
}

// ── Card + word bundle for the review session ───────────────────────────────
const cardSchema = z.object({
  id: z.uuid(),
  ref_id: z.uuid(),
  ease_factor: z.number(),
  interval_days: z.number(),
  repetitions: z.number(),
  due_at: z.string(),
  last_rating: z.number().nullable().default(null),
});

const CARD_COLS = 'id, ref_id, ease_factor, interval_days, repetitions, due_at, last_rating';

export interface DueCard {
  card: z.infer<typeof cardSchema>;
  word: UserWord;
  /** All acceptable Italian answers for this prompt (synonyms sharing a meaning). */
  accept: string[];
}

/** Meaning tokens of an English translation, for synonym matching. */
function meaningTokens(translation: string): string[] {
  return translation
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // drop parenthetical notes: "how many (quanti, quante)"
    .split(/[,/;]|\bor\b/) // split on , / ; or
    .map((t) => t.replace(/^to\s+/, '').trim()) // "to have" → "have"
    .filter((t) => t.length > 0);
}

/**
 * 'due'     → cards scheduled for today
 * 'flagged' → all starred words, anytime
 * 'wrong'   → words whose last answer was wrong (mistakes list), anytime
 */
export type PracticeMode = 'due' | 'flagged' | 'wrong';

export function useDueCards(mode: PracticeMode = 'due', pos?: string) {
  return useQuery({
    queryKey: ['srs', mode, pos ?? 'all'],
    enabled: isSupabaseConfigured,
    staleTime: 0,
    queryFn: async (): Promise<DueCard[]> => {
      const session = await ensureSession();
      const supabase = getSupabase();
      const userId = session!.user.id;

      // Fetch ALL words (needed to compute synonyms across the whole vocabulary);
      // the mode scoping happens on the cards below.
      const { data: wordsRaw, error: wErr } = await supabase
        .from('user_words')
        .select('*')
        .order('created_at', { ascending: false });
      if (wErr) throw new Error(wErr.message);
      const words = z.array(userWordSchema).parse(wordsRaw ?? []);
      if (words.length === 0) return [];

      // Existing word cards
      const { data: cardsRaw, error: cErr } = await supabase
        .from('srs_cards')
        .select(CARD_COLS)
        .eq('card_type', 'word');
      if (cErr) throw new Error(cErr.message);
      let cards = z.array(cardSchema).parse(cardsRaw ?? []);

      // Create missing cards, due immediately. Set due_at explicitly in the
      // past (not the server default now()) so clock skew between Supabase and
      // the device can't make a freshly-added word look "not yet due".
      // 'wrong' never needs new cards (a word with no card can't be a mistake).
      const haveRef = new Set(cards.map((c) => c.ref_id));
      const missing = mode === 'wrong' ? [] : words.filter((w) => !haveRef.has(w.id));
      if (missing.length > 0) {
        const dueNow = new Date(Date.now() - 60_000).toISOString();
        const { data: inserted, error: insErr } = await supabase
          .from('srs_cards')
          .insert(
            missing.map((w) => ({
              user_id: userId,
              card_type: 'word',
              ref_id: w.id,
              due_at: dueNow,
            })),
          )
          .select(CARD_COLS);
        if (insErr) throw new Error(insErr.message);
        cards = cards.concat(z.array(cardSchema).parse(inserted ?? []));
      }

      // Synonym index: meaning token → set of lemmas that share it
      const byMeaning = new Map<string, Set<string>>();
      for (const w of words) {
        for (const tok of meaningTokens(w.translation)) {
          if (!byMeaning.has(tok)) byMeaning.set(tok, new Set());
          byMeaning.get(tok)!.add(w.lemma);
        }
      }
      const acceptableFor = (w: UserWord): string[] => {
        const set = new Set<string>([w.lemma]);
        for (const tok of meaningTokens(w.translation))
          for (const lemma of byMeaning.get(tok) ?? []) set.add(lemma);
        return [...set];
      };

      // Restrict to this mode's cards. 'flagged'/'wrong' ignore the schedule so
      // the user can drill those lists any time.
      const wordById = new Map(words.map((w) => [w.id, w]));
      const now = Date.now() + 30_000; // small buffer for residual clock skew
      const inScope = (c: (typeof cards)[number]) => {
        const w = wordById.get(c.ref_id);
        if (!w) return false;
        if (pos && w.pos !== pos) return false; // optional word-class focus
        if (mode === 'wrong') return c.last_rating != null && c.last_rating < 3;
        if (mode === 'flagged') return w.flagged;
        // 'due' drills words you're still learning — skip ones marked known
        return w.status !== 'known' && new Date(c.due_at).getTime() <= now;
      };
      return cards
        .filter(inScope)
        .sort((a, b) => a.due_at.localeCompare(b.due_at))
        .map((card) => {
          const word = wordById.get(card.ref_id)!;
          return { card, word, accept: acceptableFor(word) };
        });
    },
  });
}

export function useReviewCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ card, rating }: { card: DueCard['card']; rating: Rating }) => {
      const supabase = getSupabase();
      const quality = RATINGS[rating];
      const next = sm2(card, quality);
      const dueAt = new Date(Date.now() + next.intervalDays * 86400_000).toISOString();

      const { error } = await supabase
        .from('srs_cards')
        .update({
          ease_factor: next.ease_factor,
          interval_days: next.interval_days,
          repetitions: next.repetitions,
          due_at: dueAt,
          last_reviewed: new Date().toISOString(),
          last_rating: quality,
        })
        .eq('id', card.id);
      if (error) throw new Error(error.message);

      await supabase.from('srs_reviews').insert({ card_id: card.id, rating: quality });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['srs'] }),
  });
}

/** Words whose last review was wrong (rating < 3) — the mistakes list. */
export function useWrongWords() {
  return useQuery({
    queryKey: ['srs', 'wrong-list'],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<UserWord[]> => {
      const supabase = getSupabase();
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return [];

      const { data: cards, error } = await supabase
        .from('srs_cards')
        .select('ref_id, last_reviewed')
        .eq('card_type', 'word')
        .lt('last_rating', 3);
      if (error) throw new Error(error.message);
      const rows = (cards ?? []) as { ref_id: string; last_reviewed: string | null }[];
      if (rows.length === 0) return [];

      const { data: wordsRaw, error: wErr } = await supabase
        .from('user_words')
        .select('*')
        .in(
          'id',
          rows.map((r) => r.ref_id),
        );
      if (wErr) throw new Error(wErr.message);
      const words = z.array(userWordSchema).parse(wordsRaw ?? []);

      // Most recently missed first
      const reviewedAt = new Map(rows.map((r) => [r.ref_id, r.last_reviewed ?? '']));
      return words.sort((a, b) => (reviewedAt.get(b.id) ?? '').localeCompare(reviewedAt.get(a.id) ?? ''));
    },
  });
}
