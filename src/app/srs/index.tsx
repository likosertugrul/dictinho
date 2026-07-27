import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { matchesLemma, withArticle } from '@/lib/italian';
import { hasGrammar } from '@/lib/lang';
import { useDueCards, useReviewCard, type DueCard, type PracticeMode, type Rating } from '@/lib/srs';
import { useToggleFlag } from '@/lib/words';
import { colors } from '@/theme/tokens';

export default function SrsScreen() {
  const { mode: modeParam, pos: posParam, known: knownParam } =
    useLocalSearchParams<{ mode?: string; pos?: string; known?: string }>();
  const mode: PracticeMode =
    modeParam === 'flagged' ? 'flagged' : modeParam === 'wrong' ? 'wrong' : 'due';
  const pos = posParam && posParam !== 'all' ? posParam : undefined;
  const due = useDueCards(mode, pos, knownParam === '1');
  const review = useReviewCard();
  const toggleFlag = useToggleFlag();

  // Local session queue (snapshot of due cards; "Again" re-queues)
  const [queue, setQueue] = useState<DueCard[]>([]);
  const [guess, setGuess] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const initialTotal = useMemo(() => due.data?.length ?? 0, [due.data]);

  useEffect(() => {
    if (due.data) setQueue(due.data);
  }, [due.data]);

  const current = queue[0];

  const toggleCurrentFlag = () => {
    if (!current) return;
    const flagged = !current.word.flagged;
    toggleFlag.mutate({ id: current.word.id, flagged });
    // reflect immediately in the local session queue
    setQueue((q) =>
      q.map((d, i) => (i === 0 ? { ...d, word: { ...d.word, flagged } } : d)),
    );
  };

  const check = () => {
    if (!current || !guess.trim()) return;
    // Accept any Italian word that shares this English meaning (what → che/cosa/…)
    setWasCorrect(current.accept.some((lemma) => matchesLemma(guess, lemma)));
    setRevealed(true);
  };

  const giveUp = () => {
    if (!current) return;
    setWasCorrect(false);
    setRevealed(true);
  };

  const next = (rating: Rating) => {
    if (!current) return;
    review.mutate({ card: current.card, rating });
    setReviewed((n) => n + 1);
    setGuess('');
    setRevealed(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      // Wrong answers ("again") cycle back into this session
      return rating === 'again' ? [...rest, head] : rest;
    });
  };

  if (due.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Empty / finished state
  if (!current) {
    const nothingDue = initialTotal === 0 && reviewed === 0;
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <Header title={mode === 'flagged' ? 'Starred words' : 'Flashcards'} progress={null} />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
            <Ionicons name="checkmark-done" size={30} color={colors.pastel.mint} />
          </View>
          <Text className="mt-4 text-center text-xl font-bold text-textHi">
            {nothingDue
              ? mode === 'flagged'
                ? 'No starred words yet'
                : 'Nothing due right now'
              : 'Session complete!'}
          </Text>
          <Text className="mt-2 text-center text-sm text-textLo">
            {nothingDue
              ? mode === 'flagged'
                ? 'Star words while practicing or from a word’s page to build a drill list.'
                : 'Add words or come back later — cards appear here when they’re due for review.'
              : `You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}. Nice work.`}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-6 rounded-full bg-primary px-8 py-3.5">
            <Text className="text-sm font-bold text-white">Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { word } = current;
  const answer =
    hasGrammar(word.target_language) && word.pos === 'noun'
      ? withArticle(word.lemma, word.gender)
      : word.lemma;
  // Synonyms accepted besides the card's own word (e.g. what → cosa, che cosa)
  const otherAccepted = current.accept.filter((l) => l !== word.lemma);
  const done = reviewed;
  const total = Math.max(initialTotal, reviewed + queue.length);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title={mode === 'flagged' ? 'Starred words' : 'Flashcards'} progress={{ done, total }} />

        <View className="flex-1 justify-center px-5">
          {/* Prompt: English meaning → guess the Italian word */}
          <View className="items-center rounded-card bg-surface px-6 py-10">
            {/* Star / add to drill list */}
            <Pressable
              accessibilityLabel={current.word.flagged ? 'Unstar word' : 'Star for later practice'}
              onPress={toggleCurrentFlag}
              hitSlop={10}
              className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
              <Ionicons
                name={current.word.flagged ? 'star' : 'star-outline'}
                size={18}
                color={current.word.flagged ? colors.pastel.yellow : colors.textLo}
              />
            </Pressable>

            <Text className="text-xs font-semibold uppercase tracking-widest text-textLo">
              What’s the Italian for
            </Text>
            <Text className="mt-3 text-center text-2xl font-bold text-textHi">
              {word.translation}
            </Text>
            <View className="mt-2 flex-row items-center gap-1.5">
              <Badge label={word.pos} />
              {word.cefr ? <Badge label={word.cefr} /> : null}
            </View>

            {!revealed ? (
              <View className="mt-6 w-full flex-row items-center rounded-2xl bg-surfaceAlt px-4">
                <TextInput
                  value={guess}
                  onChangeText={setGuess}
                  onSubmitEditing={check}
                  placeholder="type the Italian word…"
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
            ) : (
              <View className="mt-6 w-full items-center">
                {/* Result */}
                <View className="flex-row items-center gap-2">
                  <Ionicons
                    name={wasCorrect ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={wasCorrect ? colors.pastel.mint : colors.primary}
                  />
                  <Text
                    className="text-lg font-bold"
                    style={{ color: wasCorrect ? colors.pastel.mint : colors.primary }}>
                    {wasCorrect ? 'Correct!' : 'Not quite'}
                  </Text>
                </View>
                {/* The right answer */}
                <Text className="mt-3 text-2xl font-bold text-textHi">{answer}</Text>
                {!wasCorrect && guess.trim().length > 0 && (
                  <Text className="mt-1 text-sm text-textLo">you wrote: {guess.trim()}</Text>
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
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View className="px-5 pb-2 pt-2">
          {!revealed ? (
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({
  title,
  progress,
}: {
  title: string;
  progress: { done: number; total: number } | null;
}) {
  const pct = progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <View className="px-5 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-textHi">{title}</Text>
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
