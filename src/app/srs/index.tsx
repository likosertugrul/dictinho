import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

import { ArticleInfo } from '@/components/article-info';
import { Container } from '@/components/container';
import { Speaker } from '@/components/speaker';
import { WordCardModal } from '@/components/word-card-modal';
import { MAX_W } from '@/hooks/use-responsive';
import { matchesLemma, withArticle } from '@/lib/italian';
import { hasGrammar, langInfo, useTargetLang } from '@/lib/lang';
import { getPickedWords, setPickedWords } from '@/lib/practice-selection';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionKey,
  type SavedSession,
} from '@/lib/practice-session';
import { setAutoSpeak, useAutoSpeak } from '@/lib/settings';
import { topicLabel } from '@/lib/topics';
import type { UserWord } from '@/lib/schemas';
import { useDueCards, useReviewCard, type DueCard, type PracticeMode, type Rating } from '@/lib/srs';
import { useToggleFlag } from '@/lib/words';
import { speechService } from '@/services/speech';
import { colors } from '@/theme/tokens';

/** A card the user has already answered in this session. */
interface AnsweredCard {
  card: DueCard;
  guess: string;
  wasCorrect: boolean;
}

/** What the learner should have written — nouns are drilled with their article. */
function answerText(word: UserWord): string {
  return hasGrammar(word.target_language) && word.pos === 'noun'
    ? withArticle(word.lemma, word.gender)
    : word.lemma;
}

export default function SrsScreen() {
  const {
    mode: modeParam,
    pos: posParam,
    known: knownParam,
    topics: topicsParam,
    ids: idsParam,
  } = useLocalSearchParams<{
    mode?: string;
    pos?: string;
    known?: string;
    topics?: string;
    ids?: string;
  }>();
  const MODES: PracticeMode[] = ['flagged', 'wrong', 'tough', 'topics', 'picked', 'random'];
  const mode: PracticeMode = MODES.find((m) => m === modeParam) ?? 'due';
  const pos = posParam && posParam !== 'all' ? posParam : undefined;
  const topics = (topicsParam ?? '').split(',').filter(Boolean);
  const urlIds = (idsParam ?? '').split(',').filter(Boolean);

  // A half-finished drill is restored before the cards are fetched, so the
  // query can be built from the words that are actually still queued.
  const [resume, setResume] = useState<SavedSession | null>(null);
  const [restored, setRestored] = useState(false);
  const params = useMemo(() => {
    const p: Record<string, string> = { mode };
    if (pos) p.pos = pos;
    if (knownParam === '1') p.known = '1';
    if (topics.length > 0) p.topics = topics.join(',');
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pos, knownParam, topicsParam]);
  const key = sessionKey(params);

  useEffect(() => {
    let alive = true;
    loadSession(key).then((saved) => {
      if (!alive) return;
      setResume(saved);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // Hand-picked sessions carry their ids in memory (a URL can't hold hundreds).
  // A restored session brings its own list, which also survives a reload.
  const ids = useMemo(() => {
    if (!restored) return [];
    if (urlIds.length > 0) return urlIds;
    const picked = getPickedWords();
    if (picked.length > 0) return picked;
    if (mode === 'picked' && resume) {
      setPickedWords(resume.remaining);
      return resume.remaining;
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, resume, idsParam, mode]);
  const due = useDueCards({ mode, pos, includeKnown: knownParam === '1', topics, ids });
  const sessionTitle =
    mode === 'flagged'
      ? 'Starred words'
      : mode === 'picked'
        ? 'Selected words'
        : mode === 'topics'
          ? topics.length === 1
            ? topicLabel(topics[0])
            : `${topics.length} topics`
          : mode === 'random'
            ? 'Random mix'
            : 'Flashcards';
  // Prompts name the language actually being learned (EN→ES asks for Spanish)
  const langName = langInfo(useTargetLang()).name;
  const review = useReviewCard();
  const toggleFlag = useToggleFlag();
  // Reading the answer out loud on reveal can be turned off mid-drill
  const autoSpeak = useAutoSpeak();

  // Local session queue (snapshot of due cards; "Again" re-queues)
  const [queue, setQueue] = useState<DueCard[]>([]);
  const [guess, setGuess] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [cardOpen, setCardOpen] = useState(false);
  // Cards already answered this session, so the user can look back at them.
  // Going back never re-schedules anything — it's reading, not reviewing.
  const [history, setHistory] = useState<AnsweredCard[]>([]);
  const [pastIndex, setPastIndex] = useState<number | null>(null);
  // A revisited card starts with the answer hidden: seeing it for free would
  // undo the recall practice. The user asks for it when they want it.
  const [pastRevealed, setPastRevealed] = useState(false);
  // >0 while the drill was picked up mid-way (drives the "Start over" hint)
  const [resumedCount, setResumedCount] = useState(0);
  const initialTotal = useMemo(() => due.data?.length ?? 0, [due.data]);

  // Build the queue once: later refetches (every answer invalidates the SRS
  // query) must not shuffle the drill the user is in the middle of.
  const [built, setBuilt] = useState(false);
  const building = useRef(false);
  useEffect(() => {
    if (!restored || !due.data || building.current) return;
    building.current = true;
    setBuilt(true);
    if (resume) {
      const byWord = new Map(due.data.map((d) => [d.word.id, d]));
      const ordered = resume.remaining
        .map((id) => byWord.get(id))
        .filter((d): d is DueCard => d != null);
      if (ordered.length > 0) {
        setQueue(ordered);
        setReviewed(resume.done);
        setResumedCount(ordered.length);
        return;
      }
    }
    setQueue(due.data);
  }, [restored, due.data, resume]);

  const current = queue[0];
  const past = pastIndex != null ? history[pastIndex] : null;
  // The card on screen: a revisited one, or the live one
  const shown = past?.card ?? current;

  const toggleShownFlag = () => {
    if (!shown) return;
    const flagged = !shown.word.flagged;
    toggleFlag.mutate({ id: shown.word.id, flagged });
    // reflect immediately in the local session state
    const flip = (d: DueCard) =>
      d.word.id === shown.word.id ? { ...d, word: { ...d.word, flagged } } : d;
    setQueue((q) => q.map(flip));
    setHistory((h) => h.map((a) => ({ ...a, card: flip(a.card) })));
  };

  // Revealing pronounces the answer — hearing it is half the point — unless the
  // user has muted automatic playback.
  const speakAnswer = (card: DueCard) => {
    if (!autoSpeak) return;
    speechService.speak(answerText(card.word), { language: card.word.target_language });
  };

  const reveal = (correct: boolean) => {
    if (!current) return;
    setWasCorrect(correct);
    setRevealed(true);
    speakAnswer(current);
  };

  const check = () => {
    if (!current || !guess.trim()) return;
    // Accept any target word that shares this meaning (what → che/cosa/…)
    reveal(current.accept.some((lemma) => matchesLemma(guess, lemma)));
  };

  const giveUp = () => reveal(false);

  const next = (rating: Rating) => {
    if (!current) return;
    review.mutate({ card: current.card, rating });
    setHistory((h) => [...h, { card: current, guess: guess.trim(), wasCorrect }]);
    setReviewed((n) => n + 1);
    setGuess('');
    setRevealed(false);
    setCardOpen(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      // Wrong answers ("again") cycle back into this session
      const nextQueue = rating === 'again' ? [...rest, head] : rest;
      // Remember where we got to, so closing the drill doesn't restart it
      const done = reviewed + 1;
      if (nextQueue.length === 0) clearSession(key);
      else
        saveSession({
          key,
          route: '/srs',
          params,
          mode,
          remaining: nextQueue.map((d) => d.word.id),
          done,
          total: Math.max(done + nextQueue.length, initialTotal),
          savedAt: Date.now(),
        });
      return nextQueue;
    });
  };

  // ── Looking back at earlier cards ──────────────────────────────────────────
  const openPast = (index: number) => {
    setPastIndex(index);
    setPastRevealed(false);
    setCardOpen(false);
  };
  const goBack = () => {
    const index = (pastIndex ?? history.length) - 1;
    if (index >= 0) openPast(index);
  };
  const goForward = () => {
    if (pastIndex == null) return;
    if (pastIndex + 1 >= history.length) resumeSession();
    else openPast(pastIndex + 1);
  };
  const resumeSession = () => {
    setPastIndex(null);
    setPastRevealed(false);
    setCardOpen(false);
  };

  /** Drop the restored progress and drill the whole list again. */
  const startOver = () => {
    clearSession(key);
    setResume(null);
    setResumedCount(0);
    setReviewed(0);
    setHistory([]);
    resumeSession();
    setGuess('');
    setRevealed(false);
    setQueue(due.data ?? []);
  };

  // Wait for both the cards and the saved session — rendering "nothing due"
  // in between would wipe a drill the user is in the middle of.
  if (due.isLoading || !restored || !built) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Empty / finished state (a revisited card keeps the session on screen)
  if (!shown) {
    const nothingDue = initialTotal === 0 && reviewed === 0;
    // Nothing left to answer — a stored session for this drill is now stale
    if (resume) clearSession(key);
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <Header title={sessionTitle} progress={null} />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
            <Ionicons name="checkmark-done" size={30} color={colors.pastel.mint} />
          </View>
          <Text className="mt-4 text-center text-xl font-bold text-textHi">
            {nothingDue
              ? mode === 'flagged'
                ? 'No starred words yet'
                : mode === 'picked'
                  ? 'No words selected'
                  : mode === 'topics'
                    ? 'Nothing in these topics'
                    : mode === 'random'
                      ? 'No words to shuffle yet'
                      : 'Nothing due right now'
              : 'Session complete!'}
          </Text>
          <Text className="mt-2 text-center text-sm text-textLo">
            {nothingDue
              ? mode === 'flagged'
                ? 'Star words while practicing or from a word’s page to build a drill list.'
                : mode === 'picked'
                  ? 'The selection is only kept while the app is open — pick the words again from your list.'
                  : mode === 'topics'
                    ? 'Those topics have no words to drill yet. Give some words a topic first.'
                    : mode === 'random'
                      ? 'Add some words first — a random mix needs something to shuffle.'
                      : 'Add words or come back later — cards appear here when they’re due for review.'
              : `You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}. Nice work.`}
          </Text>
          <View className="mt-6 flex-row gap-2">
            {history.length > 0 && (
              <Pressable
                accessibilityLabel="Look back at the words you answered"
                onPress={() => openPast(history.length - 1)}
                className="flex-row items-center gap-1.5 rounded-full bg-surfaceAlt px-6 py-3.5">
                <Ionicons name="arrow-back" size={14} color={colors.textHi} />
                <Text className="text-sm font-bold text-textHi">Look back</Text>
              </Pressable>
            )}
            <Pressable onPress={() => router.back()} className="rounded-full bg-primary px-8 py-3.5">
              <Text className="text-sm font-bold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const { word } = shown;
  const answer = answerText(word);
  // Synonyms accepted besides the card's own word (e.g. what → cosa, che cosa)
  const otherAccepted = shown.accept.filter((l) => l !== word.lemma);
  const done = reviewed;
  const total = Math.max(initialTotal, reviewed + queue.length);
  // What the card body shows: the live card's own state, or the past result
  const showAnswer = past ? pastRevealed : revealed;
  const shownCorrect = past ? past.wasCorrect : wasCorrect;
  const shownGuess = past ? past.guess : guess;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header
          title={
            past
              ? `Earlier · ${pastIndex! + 1} of ${history.length}`
              : sessionTitle
          }
          progress={past ? null : { done, total }}
          onBack={history.length > 0 && (pastIndex ?? history.length) > 0 ? goBack : undefined}
          onStartOver={!past && resumedCount > 0 ? startOver : undefined}
          autoSpeak={autoSpeak}
          onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
        />

        <ScrollView
          className="flex-1"
          contentContainerClassName="grow justify-center px-5 py-2"
          keyboardShouldPersistTaps="handled">
          <Container max={MAX_W.card}>
          {/* Prompt: meaning in the source language → guess the target word */}
          <View className="items-center rounded-card bg-surface px-6 py-10">
            {/* Star / add to drill list */}
            <Pressable
              accessibilityLabel={word.flagged ? 'Unstar word' : 'Star for later practice'}
              onPress={toggleShownFlag}
              hitSlop={10}
              className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
              <Ionicons
                name={word.flagged ? 'star' : 'star-outline'}
                size={18}
                color={word.flagged ? colors.pastel.yellow : colors.textLo}
              />
            </Pressable>

            <Text className="text-xs font-semibold uppercase tracking-widest text-textLo">
              What’s the {langName} for
            </Text>
            <Text className="mt-3 text-center text-2xl font-bold text-textHi">
              {word.translation}
            </Text>
            <View className="mt-2 flex-row items-center gap-1.5">
              <Badge label={word.pos} />
              {word.cefr ? <Badge label={word.cefr} /> : null}
            </View>

            {!showAnswer ? (
              past ? (
                // Revisited card: the answer stays covered until asked for
                <View className="mt-6 w-full items-center rounded-2xl bg-surfaceAlt px-4 py-5">
                  <View className="flex-row items-center gap-2">
                    <Ionicons
                      name={past.wasCorrect ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={past.wasCorrect ? colors.pastel.mint : colors.primary}
                    />
                    <Text
                      className="text-sm font-bold"
                      style={{ color: past.wasCorrect ? colors.pastel.mint : colors.primary }}>
                      {past.wasCorrect ? 'You got this one right' : 'You missed this one'}
                    </Text>
                  </View>
                  <Text className="mt-2 text-center text-xs text-textLo">
                    Answer hidden — try to recall it first.
                  </Text>
                </View>
              ) : (
                <View className="mt-6 w-full flex-row items-center rounded-2xl bg-surfaceAlt px-4">
                  <TextInput
                    value={guess}
                    onChangeText={setGuess}
                    onSubmitEditing={check}
                    placeholder={`type the ${langName} word…`}
                    placeholderTextColor={colors.textLo}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="done"
                    className="flex-1 py-3.5 text-center text-lg text-textHi"
                  />
                  {guess.length > 0 && (
                    <Pressable accessibilityLabel="Clear" hitSlop={8} onPress={() => setGuess('')}>
                      <Ionicons name="close-circle" size={20} color={colors.textLo} />
                    </Pressable>
                  )}
                </View>
              )
            ) : (
              <View className="mt-6 w-full items-center">
                {/* Result */}
                <View className="flex-row items-center gap-2">
                  <Ionicons
                    name={shownCorrect ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={shownCorrect ? colors.pastel.mint : colors.primary}
                  />
                  <Text
                    className="text-lg font-bold"
                    style={{ color: shownCorrect ? colors.pastel.mint : colors.primary }}>
                    {shownCorrect ? 'Correct!' : 'Not quite'}
                  </Text>
                </View>
                {/* The right answer — tap it to open the full word card */}
                <View className="mt-3 flex-row items-center gap-2">
                  <Pressable
                    accessibilityLabel={`Open the card for ${answer}`}
                    onPress={() => setCardOpen(true)}
                    className="flex-row items-center gap-1.5">
                    <Text className="text-2xl font-bold text-textHi">{answer}</Text>
                    <Ionicons name="information-circle-outline" size={18} color={colors.textLo} />
                  </Pressable>
                  <Speaker
                    text={answer}
                    lang={word.target_language}
                    variant="chip"
                    label="Listen to the answer"
                  />
                </View>
                {!shownCorrect && shownGuess.trim().length > 0 && (
                  <Text className="mt-1 text-sm text-textLo">you wrote: {shownGuess.trim()}</Text>
                )}
                {/* Other accepted synonyms for this meaning */}
                {otherAccepted.length > 0 && (
                  <Text className="mt-2 text-center text-xs text-textLo">
                    also accepted: {otherAccepted.join(', ')}
                  </Text>
                )}
                {word.auxiliary ? (
                  <View className="mt-2">
                    <Badge label={`aux: ${word.auxiliary}`} tone="primary" />
                  </View>
                ) : null}

                {/* Nouns: all the articles, now that the answer is out */}
                <ArticleInfo word={word} tone="surfaceAlt" className="mt-5" />

                <Pressable
                  onPress={() => setCardOpen(true)}
                  className="mt-4 flex-row items-center gap-1.5 rounded-full bg-surfaceAlt px-4 py-2">
                  <Ionicons name="albums-outline" size={14} color={colors.textHi} />
                  <Text className="text-xs font-bold text-textHi">Open word card</Text>
                </Pressable>
              </View>
            )}
          </View>
          </Container>
        </ScrollView>

        {/* Actions */}
        <View className="px-5 pb-2 pt-2">
          <Container max={MAX_W.card}>
          {past ? (
            // Looking back: reveal on demand, and step through without rating
            <View className="gap-2">
              {!pastRevealed && (
                <Pressable
                  accessibilityLabel="Show the answer for this word"
                  onPress={() => {
                    setPastRevealed(true);
                    speakAnswer(past.card);
                  }}
                  className="flex-row items-center justify-center gap-2 rounded-full bg-primary py-4">
                  <Ionicons name="eye-outline" size={18} color={colors.onPrimary} />
                  <Text className="text-base font-bold text-white">Show answer</Text>
                </Pressable>
              )}
              <View className="flex-row gap-2">
                <Pressable
                  accessibilityLabel="Previous word"
                  disabled={pastIndex === 0}
                  onPress={goBack}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-4 ${
                    pastIndex === 0 ? 'bg-surface' : 'bg-surfaceAlt'
                  }`}>
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={pastIndex === 0 ? colors.border : colors.textHi}
                  />
                  <Text
                    className={`text-sm font-bold ${pastIndex === 0 ? 'text-border' : 'text-textHi'}`}>
                    Previous
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    pastIndex! + 1 >= history.length ? 'Back to the session' : 'Next word'
                  }
                  onPress={goForward}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-surfaceAlt py-4">
                  <Text className="text-sm font-bold text-textHi">
                    {pastIndex! + 1 >= history.length ? 'Back to session' : 'Next'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textHi} />
                </Pressable>
              </View>
            </View>
          ) : !revealed ? (
            <View className="flex-row gap-2">
              <Pressable
                onPress={giveUp}
                className="items-center justify-center rounded-full bg-surfaceAlt px-5 py-4">
                <Text className="text-sm font-bold text-textLo">Skip</Text>
              </Pressable>
              <Pressable
                disabled={!guess.trim()}
                onPress={check}
                className={`flex-1 items-center rounded-full py-4 ${guess.trim() ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                <Text className={`text-base font-bold ${guess.trim() ? 'text-white' : 'text-textLo'}`}>
                  Check
                </Text>
              </Pressable>
            </View>
          ) : wasCorrect ? (
            // Correct → schedule further out; let the user say how easy it felt
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => next('good')}
                className="flex-1 items-center rounded-2xl bg-primary py-4">
                <Text className="text-sm font-bold text-white">Good</Text>
              </Pressable>
              <Pressable
                onPress={() => next('easy')}
                className="flex-1 items-center rounded-2xl bg-surfaceAlt py-4">
                <Text className="text-sm font-bold text-textHi">Easy</Text>
              </Pressable>
            </View>
          ) : (
            // Wrong → repeat this session
            <Pressable
              onPress={() => next('again')}
              className="items-center rounded-full bg-primary py-4">
              <Text className="text-base font-bold text-white">Got it — continue</Text>
            </Pressable>
          )}
          </Container>
        </View>
      </KeyboardAvoidingView>

      {/* Word card over the session (state is kept, so the drill resumes on close) */}
      <WordCardModal wordId={cardOpen ? word.id : null} onClose={() => setCardOpen(false)} />
    </SafeAreaView>
  );
}

function Header({
  title,
  progress,
  onBack,
  onStartOver,
  autoSpeak,
  onToggleAutoSpeak,
}: {
  title: string;
  progress: { done: number; total: number } | null;
  /** Step back to the previously answered card; hidden on the first one. */
  onBack?: () => void;
  /** Shown only when the drill was picked up mid-way. */
  onStartOver?: () => void;
  /** Speak the answer automatically when a card is revealed. */
  autoSpeak?: boolean;
  onToggleAutoSpeak?: () => void;
}) {
  const pct = progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <View className="px-5 py-3">
      <Container max={MAX_W.card}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-2">
          {onBack && (
            <Pressable
              accessibilityLabel="Previous word"
              onPress={onBack}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
              <Ionicons name="chevron-back" size={20} color={colors.textHi} />
            </Pressable>
          )}
          <Text className="text-lg font-bold text-textHi">{title}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          {onToggleAutoSpeak && speechService.isAvailable && (
            <Pressable
              accessibilityLabel={
                autoSpeak ? 'Turn off automatic pronunciation' : 'Turn on automatic pronunciation'
              }
              onPress={onToggleAutoSpeak}
              className={`h-9 w-9 items-center justify-center rounded-full ${
                autoSpeak ? 'bg-primary' : 'bg-surfaceAlt'
              }`}>
              <Ionicons
                name={autoSpeak ? 'volume-high' : 'volume-mute'}
                size={18}
                color={autoSpeak ? colors.onPrimary : colors.textLo}
              />
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Close"
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
            <Ionicons name="close" size={20} color={colors.textHi} />
          </Pressable>
        </View>
      </View>
      {progress && (
        <>
          <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </View>
          <View className="mt-1 flex-row items-center justify-between">
            <Text className="text-xs text-textLo">
              {progress.done} / {progress.total}
            </Text>
            {onStartOver && (
              <Pressable
                accessibilityLabel="Start this drill over"
                onPress={onStartOver}
                hitSlop={8}
                className="flex-row items-center gap-1">
                <Ionicons name="refresh" size={12} color={colors.textLo} />
                <Text className="text-xs font-semibold text-textLo">
                  Continued — start over
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}
      </Container>
    </View>
  );
}

function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' }) {
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${tone === 'primary' ? 'bg-primary' : 'bg-surfaceAlt'}`}>
      <Text className={`text-xs font-semibold ${tone === 'primary' ? 'text-white' : 'text-textLo'}`}>
        {label}
      </Text>
    </View>
  );
}
