import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArticleInfo } from '@/components/article-info';
import { Container } from '@/components/container';
import { Speaker } from '@/components/speaker';
import { WordCardModal } from '@/components/word-card-modal';
import { MAX_W } from '@/hooks/use-responsive';
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

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion(word: UserWord): Question | null {
  if (word.gender == null) return null;
  const singular = word.forms?.singular ?? word.lemma;
  const plural = word.forms?.plural ?? nounForms(word.lemma, word.gender).plural;
  // Randomly drill the singular or the plural article.
  const askPlural = Math.random() < 0.5;
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
    () => shuffle(nouns).map(buildQuestion).filter((q): q is Question => q !== null),
    [nouns],
  );

  const [queue, setQueue] = useState<Question[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [cardOpen, setCardOpen] = useState(false);

  // Initialise the session queue once the data has loaded.
  const activeQueue = queue ?? initialQueue;
  const current = activeQueue[0];
  const total = answered + activeQueue.length;

  const pick = (article: string) => {
    if (picked || !current) return;
    setPicked(article);
    if (article === current.answer) setCorrect((n) => n + 1);
    // Elided article glues to the noun: l'acqua, not "l' acqua"
    const spoken =
      current.answer === "l'" ? `${current.answer}${current.form}` : `${current.answer} ${current.form}`;
    speechService.speak(spoken, { language: 'it' });
  };

  const next = () => {
    if (!current) return;
    const wasWrong = picked !== current.answer;
    setAnswered((n) => n + 1);
    setPicked(null);
    setCardOpen(false);
    setQueue((q) => {
      const base = q ?? initialQueue;
      const [head, ...rest] = base;
      // Re-queue wrong ones at the end of the session.
      return wasWrong ? [...rest, head] : rest;
    });
  };

  const restart = () => {
    setQueue(shuffle(nouns).map(buildQuestion).filter((q): q is Question => q !== null));
    setPicked(null);
    setCorrect(0);
    setAnswered(0);
    setCardOpen(false);
  };

  if (recent.isLoading) {
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

  const revealed = picked !== null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <Header progress={{ done: answered, total }} />

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

          {revealed && (
            <>
              <View className="mt-5 flex-row items-center gap-2">
                <Ionicons
                  name={picked === current.answer ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={picked === current.answer ? colors.pastel.mint : colors.primary}
                />
                <Text
                  className="text-lg font-bold"
                  style={{ color: picked === current.answer ? colors.pastel.mint : colors.primary }}>
                  {picked === current.answer ? 'Correct!' : `It's "${current.answer}"`}
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

      {/* Article choices — all options, grouped singular / plural */}
      <ScrollView className="grow-0" contentContainerClassName="px-5 pb-2">
        <Container max={MAX_W.card}>
        <ChoiceRow
          articles={SINGULAR_ARTICLES}
          picked={picked}
          answer={current.answer}
          revealed={revealed}
          onPick={pick}
        />
        <View className="h-2" />
        <ChoiceRow
          articles={PLURAL_ARTICLES}
          picked={picked}
          answer={current.answer}
          revealed={revealed}
          onPick={pick}
        />
        </Container>
      </ScrollView>

      <View className="px-5 pb-2 pt-3">
        <Container max={MAX_W.card}>
          <Pressable
            disabled={!revealed}
            onPress={next}
            className={`items-center rounded-full py-4 ${revealed ? 'bg-primary' : 'bg-surfaceAlt'}`}>
            <Text className={`text-base font-bold ${revealed ? 'text-white' : 'text-textLo'}`}>
              {revealed ? 'Continue' : 'Pick an article'}
            </Text>
          </Pressable>
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

function Header({ progress }: { progress: { done: number; total: number } | null }) {
  const pct = progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <View className="px-5 py-3">
      <Container max={MAX_W.card}>
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-textHi">Article drill</Text>
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
          <Text className="mt-1 text-xs text-textLo">
            {progress.done} / {progress.total}
          </Text>
        </>
      )}
      </Container>
    </View>
  );
}
