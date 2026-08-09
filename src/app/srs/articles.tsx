import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArticleInfo } from '@/components/article-info';
import { Container } from '@/components/container';
import { Speaker } from '@/components/speaker';
import { WordCardModal } from '@/components/word-card-modal';
import { MAX_W } from '@/hooks/use-responsive';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionKey,
  type SavedSession,
} from '@/lib/practice-session';
import { nounForms } from '@/lib/inflect';
import { definiteArticle, definiteArticlePlural } from '@/lib/italian';
import { hasGrammar } from '@/lib/lang';
import type { UserWord } from '@/lib/schemas';
import { speechService } from '@/services/speech';
import { useRecentWords } from '@/lib/words';
import { colors } from '@/theme/tokens';

// All Italian definite articles, grouped singular vs plural for the choice grid.
const SINGULAR_ARTICLES = ['il', 'lo', "l'", 'la'] as const;
const PLURAL_ARTICLES = ['i', 'gli', 'le'] as const;

type Question = {
  word: UserWord;
  number: 'sg' | 'pl';
  form: string; // bare noun in the asked number
  answer: string; // correct article
};

/** A question already answered this session (picked is null when skipped). */
interface AnsweredQuestion {
  question: Question;
  picked: string | null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion(word: UserWord, number?: 'sg' | 'pl'): Question | null {
  if (word.gender == null) return null;
  const singular = word.forms?.singular ?? word.lemma;
  const plural = word.forms?.plural ?? nounForms(word.lemma, word.gender).plural;
  // Randomly drill the singular or the plural article, unless one was asked for
  // (a restored session must put the same question back on screen).
  const askPlural = number ? number === 'pl' : Math.random() < 0.5;
  if (askPlural) {
    const answer = definiteArticlePlural(plural, word.gender);
    if (!answer) return null;
    return { word, number: 'pl', form: plural, answer };
  }
  const answer = definiteArticle(singular, word.gender);
  if (!answer) return null;
  return { word, number: 'sg', form: singular, answer };
}

export default function ArticlesScreen() {
  const recent = useRecentWords();
  const words = recent.data ?? [];

  // Nouns with a known gender, in the current (Italian) language only.
  const nouns = useMemo(
    () => words.filter((w) => hasGrammar(w.target_language) && w.pos === 'noun' && w.gender != null),
    [words],
  );

  // Build a stable shuffled question queue once per data snapshot.
  const initialQueue = useMemo(
    () => shuffle(nouns).map((w) => buildQuestion(w)).filter((q): q is Question => q !== null),
    [nouns],
  );

  const [queue, setQueue] = useState<Question[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [cardOpen, setCardOpen] = useState(false);
  // Answered questions, so the user can step back through them. Revisiting
  // shows the noun with the article hidden until they ask to see it.
  const [history, setHistory] = useState<AnsweredQuestion[]>([]);
  const [pastIndex, setPastIndex] = useState<number | null>(null);
  const [pastRevealed, setPastRevealed] = useState(false);
  // Restoring a half-finished drill (see src/lib/practice-session.ts)
  const [resume, setResume] = useState<SavedSession | null>(null);
  const [restored, setRestored] = useState(false);
  const [resumedCount, setResumedCount] = useState(0);
  const params = { mode: 'articles' };
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

  // Build the queue once, from the stored one when there is a session to resume
  const building = useRef(false);
  useEffect(() => {
    if (!restored || nouns.length === 0 || building.current) return;
    building.current = true;
    if (resume) {
      const byId = new Map(nouns.map((w) => [w.id, w]));
      const restoredQueue = resume.remaining
        .map((wordId, i) => {
          const word = byId.get(wordId);
          return word ? buildQuestion(word, resume.numbers?.[i]) : null;
        })
        .filter((q): q is Question => q !== null);
      if (restoredQueue.length > 0) {
        setQueue(restoredQueue);
        setAnswered(resume.done);
        setCorrect(resume.correct ?? 0);
        setResumedCount(restoredQueue.length);
        return;
      }
    }
    setQueue(initialQueue);
  }, [restored, nouns, initialQueue, resume]);

  // Initialise the session queue once the data has loaded.
  const activeQueue = queue ?? initialQueue;
  const live = activeQueue[0];
  const past = pastIndex != null ? history[pastIndex] : null;
  const current = past?.question ?? live;
  const total = answered + activeQueue.length;

  const say = (q: Question, article: string) =>
    // Elided article glues to the noun: l'acqua, not "l' acqua"
    speechService.speak(article === "l'" ? `${article}${q.form}` : `${article} ${q.form}`, {
      language: 'it',
    });

  const pick = (article: string) => {
    if (picked || !live || past) return;
    setPicked(article);
    if (article === live.answer) setCorrect((n) => n + 1);
    say(live, live.answer);
  };

  const next = () => {
    if (!live) return;
    const wasWrong = picked !== live.answer;
    setHistory((h) => [...h, { question: live, picked }]);
    setAnswered((n) => n + 1);
    setPicked(null);
    setCardOpen(false);
    setQueue((q) => {
      const base = q ?? initialQueue;
      const [head, ...rest] = base;
      // Re-queue wrong ones at the end of the session.
      const nextQueue = wasWrong ? [...rest, head] : rest;
      const done = answered + 1;
      if (nextQueue.length === 0) clearSession(key);
      else
        saveSession({
          key,
          route: '/srs/articles',
          params,
          mode: 'articles',
          remaining: nextQueue.map((q2) => q2.word.id),
          numbers: nextQueue.map((q2) => q2.number),
          done,
          total: Math.max(done + nextQueue.length, initialQueue.length),
          correct: correct + (picked === live.answer ? 1 : 0),
          savedAt: Date.now(),
        });
      return nextQueue;
    });
  };

  // ── Looking back at earlier questions ──────────────────────────────────────
  const openPast = (index: number) => {
    setPastIndex(index);
    setPastRevealed(false);
    setCardOpen(false);
  };
  const goBack = () => {
    const index = (pastIndex ?? history.length) - 1;
    if (index >= 0) openPast(index);
  };
  const resumeSession = () => {
    setPastIndex(null);
    setPastRevealed(false);
    setCardOpen(false);
  };
  const goForward = () => {
    if (pastIndex == null) return;
    if (pastIndex + 1 >= history.length) resumeSession();
    else openPast(pastIndex + 1);
  };

  const restart = () => {
    clearSession(key);
    setResume(null);
    setResumedCount(0);
    setQueue(shuffle(nouns).map((w) => buildQuestion(w)).filter((q): q is Question => q !== null));
    setPicked(null);
    setCorrect(0);
    setAnswered(0);
    setCardOpen(false);
    setHistory([]);
    resumeSession();
  };

  // Wait for the saved session too: rendering a fresh question first would
  // flash the wrong word and could drop the drill being restored.
  if (recent.isLoading || !restored) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Empty state — no nouns to drill.
  if (initialQueue.length === 0 && answered === 0) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <Header progress={null} />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
            <Ionicons name="pricetags-outline" size={28} color={colors.textLo} />
          </View>
          <Text className="mt-4 text-center text-xl font-bold text-textHi">No nouns to drill</Text>
          <Text className="mt-2 text-center text-sm text-textLo">
            Add some Italian nouns (with a gender) and come back to practice their articles.
          </Text>
          <Pressable onPress={() => router.back()} className="mt-6 rounded-full bg-primary px-8 py-3.5">
            <Text className="text-sm font-bold text-white">Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Finished state.
  if (!current) {
    const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <Header progress={null} />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
            <Ionicons name="checkmark-done" size={30} color={colors.pastel.mint} />
          </View>
          <Text className="mt-4 text-center text-xl font-bold text-textHi">Session complete!</Text>
          <Text className="mt-2 text-center text-sm text-textLo">
            {correct} / {answered} correct ({pct}%).
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
            <Pressable onPress={restart} className="rounded-full bg-primary px-7 py-3.5">
              <Text className="text-sm font-bold text-white">Practice again</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} className="rounded-full bg-surfaceAlt px-7 py-3.5">
              <Text className="text-sm font-bold text-textHi">Done</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // A revisited question keeps its article hidden until the user asks for it
  const shownPicked = past ? past.picked : picked;
  const revealed = past ? pastRevealed : picked !== null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <Header
        progress={past ? null : { done: answered, total }}
        title={past ? `Earlier · ${pastIndex! + 1} of ${history.length}` : undefined}
        onBack={history.length > 0 && (pastIndex ?? history.length) > 0 ? goBack : undefined}
        onStartOver={!past && resumedCount > 0 ? restart : undefined}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="grow justify-center px-5 py-2">
        <Container max={MAX_W.card}>
        <View className="items-center rounded-card bg-surface px-6 py-10">
          <Text className="text-xs font-semibold uppercase tracking-widest text-textLo">
            Which article?
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            {/* Tappable once answered — opening the card early would spoil it */}
            <Pressable
              disabled={!revealed}
              accessibilityLabel={revealed ? `Open the card for ${current.word.lemma}` : undefined}
              onPress={() => setCardOpen(true)}
              className="flex-row items-center gap-1.5">
              <Text className="text-center text-3xl font-bold text-textHi">{current.form}</Text>
              {revealed && (
                <Ionicons name="information-circle-outline" size={18} color={colors.textLo} />
              )}
            </Pressable>
            <Speaker
              text={current.form}
              lang={current.word.target_language}
              variant="chip"
              label={`Listen to ${current.form}`}
            />
          </View>
          <Text className="mt-2 text-sm text-textLo">{current.word.translation}</Text>
          <View className="mt-3">
            <View className="rounded-full bg-surfaceAlt px-3 py-0.5">
              <Text className="text-xs font-semibold text-textLo">
                {current.number === 'pl' ? 'plural' : 'singular'}
              </Text>
            </View>
          </View>

          {past && !pastRevealed && (
            <View className="mt-5 w-full items-center rounded-2xl bg-surfaceAlt px-4 py-4">
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={past.picked === current.answer ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={past.picked === current.answer ? colors.pastel.mint : colors.primary}
                />
                <Text
                  className="text-sm font-bold"
                  style={{ color: past.picked === current.answer ? colors.pastel.mint : colors.primary }}>
                  {past.picked === current.answer ? 'You got this one right' : 'You missed this one'}
                </Text>
              </View>
              <Text className="mt-2 text-center text-xs text-textLo">
                Article hidden — try to recall it first.
              </Text>
            </View>
          )}

          {revealed && (
            <>
              <View className="mt-5 flex-row items-center gap-2">
                <Ionicons
                  name={shownPicked === current.answer ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={shownPicked === current.answer ? colors.pastel.mint : colors.primary}
                />
                <Text
                  className="text-lg font-bold"
                  style={{ color: shownPicked === current.answer ? colors.pastel.mint : colors.primary }}>
                  {shownPicked === current.answer ? 'Correct!' : `It's "${current.answer}"`}
                </Text>
              </View>

              {/* Every article this noun takes */}
              <ArticleInfo word={current.word} tone="surfaceAlt" className="mt-5" />

              <Pressable
                onPress={() => setCardOpen(true)}
                className="mt-4 flex-row items-center gap-1.5 rounded-full bg-surfaceAlt px-4 py-2">
                <Ionicons name="albums-outline" size={14} color={colors.textHi} />
                <Text className="text-xs font-bold text-textHi">Open word card</Text>
              </Pressable>
            </>
          )}
        </View>
        </Container>
      </ScrollView>

      {/* Article choices — all options, grouped singular / plural.
          On a revisited question they only come back with the answer. */}
      {(!past || pastRevealed) && (
        <ScrollView className="grow-0" contentContainerClassName="px-5 pb-2">
          <Container max={MAX_W.card}>
            <ChoiceRow
              articles={SINGULAR_ARTICLES}
              picked={shownPicked}
              answer={current.answer}
              revealed={revealed}
              onPick={pick}
            />
            <View className="h-2" />
            <ChoiceRow
              articles={PLURAL_ARTICLES}
              picked={shownPicked}
              answer={current.answer}
              revealed={revealed}
              onPick={pick}
            />
          </Container>
        </ScrollView>
      )}

      <View className="px-5 pb-2 pt-3">
        <Container max={MAX_W.card}>
          {past ? (
            // Looking back: reveal on demand, step through without re-answering
            <View className="gap-2">
              {!pastRevealed && (
                <Pressable
                  accessibilityLabel="Show the article for this word"
                  onPress={() => {
                    setPastRevealed(true);
                    say(past.question, past.question.answer);
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
          ) : (
            <Pressable
              disabled={!revealed}
              onPress={next}
              className={`items-center rounded-full py-4 ${revealed ? 'bg-primary' : 'bg-surfaceAlt'}`}>
              <Text className={`text-base font-bold ${revealed ? 'text-white' : 'text-textLo'}`}>
                {revealed ? 'Continue' : 'Pick an article'}
              </Text>
            </Pressable>
          )}
        </Container>
      </View>

      {/* Word card over the drill — closing returns to the same question */}
      <WordCardModal
        wordId={cardOpen ? current.word.id : null}
        onClose={() => setCardOpen(false)}
      />
    </SafeAreaView>
  );
}

function ChoiceRow({
  articles,
  picked,
  answer,
  revealed,
  onPick,
}: {
  articles: readonly string[];
  picked: string | null;
  answer: string;
  revealed: boolean;
  onPick: (a: string) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {articles.map((a) => {
        // Colour feedback once an answer is picked.
        let tone = 'bg-surface';
        let text = 'text-textHi';
        if (revealed) {
          if (a === answer) {
            tone = 'bg-primary';
            text = 'text-white';
          } else if (a === picked) {
            tone = 'bg-surfaceAlt';
            text = 'text-textLo';
          } else {
            tone = 'bg-surface';
            text = 'text-textLo';
          }
        }
        return (
          <Pressable
            key={a}
            disabled={revealed}
            onPress={() => onPick(a)}
            className={`flex-1 items-center justify-center rounded-2xl py-4 ${tone}`}>
            <Text className={`text-lg font-bold ${text}`}>{a}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Header({
  progress,
  title,
  onBack,
  onStartOver,
}: {
  progress: { done: number; total: number } | null;
  title?: string;
  /** Step back to the previously answered question; hidden on the first one. */
  onBack?: () => void;
  /** Shown only when the drill was picked up mid-way. */
  onStartOver?: () => void;
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
          <Text className="text-lg font-bold text-textHi">{title ?? 'Article drill'}</Text>
        </View>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
          <Ionicons name="close" size={20} color={colors.textHi} />
        </Pressable>
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
                <Text className="text-xs font-semibold text-textLo">Continued — start over</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
      </Container>
    </View>
  );
}
