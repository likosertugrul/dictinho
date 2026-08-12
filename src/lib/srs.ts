import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { withArticle } from '@/lib/italian';
import { hasGrammar, useTargetLang } from '@/lib/lang';
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
  wrong_count: z.number().default(0),
  /** The last wrong answer was only a slip (a letter or two off). */
  last_near_miss: z.boolean().default(false),
});

const CARD_COLS =
  'id, ref_id, ease_factor, interval_days, repetitions, due_at, last_rating, wrong_count, last_near_miss';

/** Words wrong this many times count as "tough". */
export const TOUGH_THRESHOLD = 3;

export interface DueCard {
  card: z.infer<typeof cardSchema>;
  word: UserWord;
  /** All acceptable Italian answers for this prompt (synonyms sharing a meaning). */
  accept: string[];
}

/** What the learner has to produce — nouns are drilled with their article. */
export function answerText(word: UserWord): string {
  return hasGrammar(word.target_language) && word.pos === 'noun'
    ? withArticle(word.lemma, word.gender)
    : word.lemma;
}

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Options for a multiple-choice card: the answer plus distractors taken from
 * the user's own words — same word class first, so the choice can't be made on
 * shape alone. Anything the card would accept (synonyms) is excluded, or a
 * "wrong" option could actually be right.
 */
export function buildChoices(card: DueCard, pool: UserWord[], count = 4): string[] {
  const answer = answerText(card.word);
  const taken = new Set([answer.toLowerCase(), ...card.accept.map((l) => l.toLowerCase())]);
  const distractors: string[] = [];

  const consider = (w: UserWord) => {
    if (distractors.length >= count - 1) return;
    if (w.id === card.word.id) return;
    const text = answerText(w);
    const key = text.toLowerCase();
    if (taken.has(key) || taken.has(w.lemma.toLowerCase())) return;
    taken.add(key);
    distractors.push(text);
  };

  for (const w of shuffled(pool.filter((w) => w.pos === card.word.pos))) consider(w);
  for (const w of shuffled(pool.filter((w) => w.pos !== card.word.pos))) consider(w);

  // Fewer than two options isn't a choice — the screen falls back to typing
  return distractors.length === 0 ? [] : shuffled([answer, ...distractors]);
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
 * 'wrong'   → words really missed last time (mistakes list), anytime
 * 'near'    → words whose last answer was only a letter or two off, anytime
 * 'tough'   → words answered wrong many times (>= TOUGH_THRESHOLD), anytime
 * 'topics'  → every word in the chosen themes, anytime (a topic mix)
 * 'picked'  → exactly the words the user selected, anytime
 * 'random'  → everything you're still learning, schedule ignored
 *
 * The last two ignore the schedule on purpose: the user asked for those words,
 * so handing them "nothing due" would be useless.
 */
export type PracticeMode =
  | 'due'
  | 'flagged'
  | 'wrong'
  | 'near'
  | 'tough'
  | 'topics'
  | 'picked'
  | 'random';

export interface PracticeFilter {
  mode?: PracticeMode;
  /** Single word class to focus on. */
  pos?: string;
  includeKnown?: boolean;
  /** Themes to mix, for mode 'topics'. */
  topics?: string[];
  /** Explicit user_word ids, for mode 'picked'. */
  ids?: string[];
}

export function useDueCards({
  mode = 'due',
  pos,
  includeKnown = false,
  topics = [],
  ids = [],
}: PracticeFilter = {}) {
  const target = useTargetLang();
  const topicKey = [...topics].sort().join(',');
  const idKey = [...ids].sort().join(',');
  return useQuery({
    queryKey: [
      'srs',
      mode,
      pos ?? 'all',
      includeKnown ? 'withknown' : 'noknown',
      topicKey,
      idKey,
      target,
    ],
    enabled: isSupabaseConfigured,
    staleTime: 0,
    queryFn: async (): Promise<DueCard[]> => {
      const session = await ensureSession();
      const supabase = getSupabase();
      const userId = session!.user.id;

      // Fetch this language's words (synonyms computed within it); the mode
      // scoping happens on the cards below.
      const { data: wordsRaw, error: wErr } = await supabase
        .from('user_words')
        .select('*')
        .eq('target_language', target)
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
      const missing =
        mode === 'wrong' || mode === 'near' ? [] : words.filter((w) => !haveRef.has(w.id));
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
      const idSet = new Set(ids);
      const topicSet = new Set(topics);
      const inScope = (c: (typeof cards)[number]) => {
        const w = wordById.get(c.ref_id);
        if (!w) return false;
        if (pos && w.pos !== pos) return false; // optional word-class focus
        // Hand-picked words come through exactly as chosen
        if (mode === 'picked') return idSet.has(w.id);
        if (mode === 'tough') return c.wrong_count >= TOUGH_THRESHOLD;
        // Slips get their own list, so Mistakes stays "words I didn't know"
        if (mode === 'near') return c.last_rating != null && c.last_rating < 3 && c.last_near_miss;
        if (mode === 'wrong')
          return c.last_rating != null && c.last_rating < 3 && !c.last_near_miss;
        if (mode === 'flagged') return w.flagged;
        // No topic, no schedule — just everything worth drilling
        if (mode === 'random') return includeKnown || w.status !== 'known';
        // Words never classified fall in the "other" bucket
        if (mode === 'topics') {
          if (topicSet.size > 0 && !topicSet.has(w.topic ?? 'other')) return false;
          return includeKnown || w.status !== 'known';
        }
        // 'due' drills words you're still learning — skip known unless asked
        if (!includeKnown && w.status === 'known') return false;
        return new Date(c.due_at).getTime() <= now;
      };
      // Shuffled, never in due_at order: cards added together share a due date,
      // so sorting by it just replayed the order the words were added in, and
      // the answer started coming from remembering the sequence. The drill
      // screen builds its queue once and stores it, so a session that is
      // resumed keeps the run it started with.
      const scoped = cards.filter(inScope);
      for (let i = scoped.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [scoped[i], scoped[j]] = [scoped[j], scoped[i]];
      }
      return scoped
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
    mutationFn: async ({
      card,
      rating,
      nearMiss = false,
    }: {
      card: DueCard['card'];
      rating: Rating;
      /** The wrong answer was only a slip — kept off the Mistakes list. */
      nearMiss?: boolean;
    }) => {
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
          // Always written: answering correctly clears a previous slip
          last_near_miss: quality < 3 && nearMiss,
          wrong_count: card.wrong_count + (quality < 3 ? 1 : 0),
        })
        .eq('id', card.id);
      if (error) throw new Error(error.message);

      await supabase.from('srs_reviews').insert({ card_id: card.id, rating: quality });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['srs'] }),
  });
}

async function fetchCardWords(
  target: string,
  kind: 'wrong' | 'tough' | 'near',
): Promise<UserWord[]> {
  const supabase = getSupabase();
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return [];

  const base = supabase.from('srs_cards').select('ref_id, last_reviewed').eq('card_type', 'word');
  const { data: cards, error } =
    kind === 'tough'
      ? await base.gte('wrong_count', TOUGH_THRESHOLD)
      : kind === 'near'
        ? await base.lt('last_rating', 3).eq('last_near_miss', true)
        : await base.lt('last_rating', 3).eq('last_near_miss', false);
  if (error) throw new Error(error.message);
  const rows = (cards ?? []) as { ref_id: string; last_reviewed: string | null }[];
  if (rows.length === 0) return [];

  const { data: wordsRaw, error: wErr } = await supabase
    .from('user_words')
    .select('*')
    .eq('target_language', target)
    .in(
      'id',
      rows.map((r) => r.ref_id),
    );
  if (wErr) throw new Error(wErr.message);
  const words = z.array(userWordSchema).parse(wordsRaw ?? []);
  const reviewedAt = new Map(rows.map((r) => [r.ref_id, r.last_reviewed ?? '']));
  return words.sort((a, b) => (reviewedAt.get(b.id) ?? '').localeCompare(reviewedAt.get(a.id) ?? ''));
}

/** Words really missed last time (slips excluded) — the mistakes list. */
export function useWrongWords() {
  const target = useTargetLang();
  return useQuery({
    queryKey: ['srs', 'wrong-list', target],
    enabled: isSupabaseConfigured,
    queryFn: () => fetchCardWords(target, 'wrong'),
  });
}

/** Words whose last answer was only a letter or two off — the "almost" list. */
export function useNearMissWords() {
  const target = useTargetLang();
  return useQuery({
    queryKey: ['srs', 'near-list', target],
    enabled: isSupabaseConfigured,
    queryFn: () => fetchCardWords(target, 'near'),
  });
}

/** Words answered wrong many times (>= threshold) — the "tough words" list. */
export function useToughWords() {
  const target = useTargetLang();
  return useQuery({
    queryKey: ['srs', 'tough-list', target],
    enabled: isSupabaseConfigured,
    queryFn: () => fetchCardWords(target, 'tough'),
  });
}
