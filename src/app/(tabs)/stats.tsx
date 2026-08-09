import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Container } from '@/components/container';
import { MAX_W, useResponsive } from '@/hooks/use-responsive';
import { POS_LABELS, POS_VALUES, type Pos } from '@/lib/italian';
import { loadSessions, type SavedSession } from '@/lib/practice-session';
import { setPickedWords } from '@/lib/practice-selection';
import { TOPIC_ICONS, TOPIC_LABELS, TOPIC_VALUES, type Topic } from '@/lib/topics';
import { hasGrammar } from '@/lib/lang';
import { useToughWords, useWrongWords } from '@/lib/srs';
import { useRecentWords } from '@/lib/words';
import { colors } from '@/theme/tokens';

type Focus = Pos | 'all';

export default function PracticeScreen() {
  const recent = useRecentWords();
  const wrong = useWrongWords();
  const tough = useToughWords();
  const { isTablet } = useResponsive();

  // Drills left half-finished — offer to continue instead of starting over
  const sessions = useQuery({ queryKey: ['practice-session'], queryFn: loadSessions });
  useFocusEffect(
    useCallback(() => {
      sessions.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const unfinished = sessions.data ?? [];
  const continueSession = (s: SavedSession) => {
    if (s.mode === 'picked') setPickedWords(s.remaining);
    router.push({ pathname: s.route, params: s.params });
  };
  const sessionName = (s: SavedSession) =>
    s.mode === 'articles'
      ? 'Article drill'
      : s.mode === 'picked'
        ? 'Selected words'
        : s.mode === 'topics'
          ? 'Topic mix'
          : s.mode === 'random'
            ? 'Random mix'
            : 'Flashcards';

  const practiceRandom = () =>
    router.push({
      pathname: '/srs',
      params: { mode: 'random', ...(includeKnown ? { known: '1' } : {}) },
    });
  const [focus, setFocus] = useState<Focus>('all');
  const [includeKnown, setIncludeKnown] = useState(false);
  // Topics ticked for a mixed session (empty = none picked yet)
  const [mix, setMix] = useState<Topic[]>([]);

  const words = recent.data ?? [];
  const starredCount = words.filter((w) => w.flagged).length;
  const mistakesCount = wrong.data?.length ?? 0;
  const toughCount = tough.data?.length ?? 0;
  const hasKnown = words.some((w) => w.status === 'known');
  const articleNouns = words.filter(
    (w) => hasGrammar(w.target_language) && w.pos === 'noun' && w.gender != null,
  ).length;

  const availablePos = POS_VALUES.filter((p) => words.some((w) => w.pos === p));
  const topicCount = (t: Topic) =>
    words.filter((w) => w.topic === t && (includeKnown || w.status !== 'known')).length;
  const availableTopics = TOPIC_VALUES.filter((t) => words.some((w) => w.topic === t));
  const toggleMix = (t: Topic) =>
    setMix((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const mixCount = mix.reduce((n, t) => n + topicCount(t), 0);
  const practiceMix = () =>
    router.push({ pathname: '/srs', params: { mode: 'topics', topics: mix.join(','),
      ...(includeKnown ? { known: '1' } : {}) } });

  const lists = (
    [
      {
        key: 'tough',
        icon: 'flame',
        iconColor: colors.primary,
        title: 'Tough words',
        subtitle: 'Answered wrong several times',
        count: toughCount,
        onPress: () => router.push('/words?list=tough'),
      },
      {
        key: 'mistakes',
        icon: 'alert-circle',
        iconColor: colors.primary,
        title: 'Mistakes',
        subtitle: 'Last answer was wrong',
        count: mistakesCount,
        onPress: () => router.push('/words?list=mistakes'),
      },
      {
        key: 'starred',
        icon: 'star',
        iconColor: colors.pastel.yellow,
        title: 'Starred',
        subtitle: 'Words you flagged',
        count: starredCount,
        onPress: () => router.push('/words?list=starred'),
      },
    ] as const
  ).filter((l) => l.count > 0);

  const practiceDue = () => {
    const params: Record<string, string> = { mode: 'due' };
    if (focus !== 'all') params.pos = focus;
    if (includeKnown) params.known = '1';
    router.push({ pathname: '/srs', params });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 py-3">
        <Container max={MAX_W.content}>
          <Text className="text-2xl font-bold text-textHi">Practice</Text>
        </Container>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-2"
        showsVerticalScrollIndicator={false}>
        <Container max={MAX_W.content}>
        {words.length === 0 ? (
          <View className="mt-24 items-center px-8">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
              <Ionicons name="albums-outline" size={28} color={colors.textLo} />
            </View>
            <Text className="mt-4 text-center text-lg font-bold text-textHi">
              Nothing to practice yet
            </Text>
            <Text className="mt-2 text-center text-sm text-textLo">
              Add some words first, then come back to review them here.
            </Text>
          </View>
        ) : (
          <>
            {/* Focus: mixed or a single word class (applies to Flashcards) */}
            {availablePos.length > 1 && (
              <>
                <Text className="mb-2 text-sm font-semibold text-textLo">Focus</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mb-4"
                  contentContainerClassName="gap-2">
                  {(['all', ...availablePos] as Focus[]).map((f) => (
                    <Pressable
                      key={f}
                      onPress={() => setFocus(f)}
                      className={`rounded-full px-4 py-1.5 ${focus === f ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                      <Text
                        className={`text-sm font-semibold ${focus === f ? 'text-white' : 'text-textLo'}`}>
                        {f === 'all' ? 'Mixed' : POS_LABELS[f]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Include known toggle */}
            {hasKnown && (
              <Pressable
                accessibilityLabel="Toggle including known words"
                onPress={() => setIncludeKnown((v) => !v)}
                className="mb-3 flex-row items-center justify-between rounded-2xl bg-surface px-4 py-3">
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-semibold text-textHi">Include known words</Text>
                  <Text className="text-xs text-textLo">Also review words you marked as known</Text>
                </View>
                <View
                  className={`h-6 w-11 justify-center rounded-full px-0.5 ${includeKnown ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                  <View
                    className={`h-5 w-5 rounded-full bg-white ${includeKnown ? 'self-end' : 'self-start'}`}
                  />
                </View>
              </Pressable>
            )}

            {/* Pick up drills that were left half-finished */}
            {unfinished.map((s) => (
              <Pressable
                key={s.key}
                accessibilityLabel={`Continue the unfinished ${sessionName(s)} session`}
                onPress={() => continueSession(s)}
                className="mb-4 flex-row items-center gap-3 rounded-card border border-primary bg-surface p-4">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
                  <Ionicons name="play" size={20} color={colors.onPrimary} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-textHi">
                    Continue {sessionName(s)}
                  </Text>
                  <Text className="text-xs text-textLo">
                    {s.done} of {s.total} done · {s.remaining.length} word
                    {s.remaining.length === 1 ? '' : 's'} left
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </Pressable>
            ))}

            {/* The two drills sit side by side once there's room for them */}
            <View className={isTablet ? 'mb-4 flex-row gap-3' : ''}>
            {/* Flashcards (due) */}
            <Pressable
              accessibilityLabel="Practice flashcards"
              onPress={practiceDue}
              className={`flex-row items-center gap-3 rounded-card bg-primary p-4 ${
                isTablet ? 'flex-1' : 'mb-4'
              }`}>
              <View className="h-11 w-11 items-center justify-center rounded-full bg-white/20">
                <Ionicons name="albums" size={22} color={colors.onPrimary} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white">Flashcards</Text>
                <Text className="text-xs text-white/80">
                  Words that are due{focus !== 'all' ? ` · ${POS_LABELS[focus]}` : ''}
                  {includeKnown ? ' · incl. known' : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onPrimary} />
            </Pressable>

            {/* Article drill — multiple-choice il/lo/la/i/gli/le (Italian nouns) */}
            {articleNouns > 0 && (
              <Pressable
                accessibilityLabel="Practice articles"
                onPress={() => router.push('/srs/articles')}
                className={`flex-row items-center gap-3 rounded-card bg-surface p-4 ${
                  isTablet ? 'flex-1' : 'mb-4'
                }`}>
                <View className="h-11 w-11 items-center justify-center rounded-full bg-surfaceAlt">
                  <Ionicons name="pricetags" size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-textHi">Article drill</Text>
                  <Text className="text-xs text-textLo">
                    Pick the right article · {articleNouns} noun{articleNouns === 1 ? '' : 's'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLo} />
              </Pressable>
            )}
            </View>

            {/* Topics — tick any number and drill them as one mixed session */}
            {availableTopics.length > 0 && (
              <View className="mb-4">
                {/* No topic in mind — just shuffle everything */}
            <Pressable
              accessibilityLabel="Practice random words"
              onPress={practiceRandom}
              className="mb-4 flex-row items-center gap-3 rounded-card bg-surface p-4">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-surfaceAlt">
                <Ionicons name="shuffle" size={20} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-textHi">Random mix</Text>
                <Text className="text-xs text-textLo">
                  All your words, shuffled — no topic, no schedule
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLo} />
            </Pressable>

            <Text className="mb-2 text-sm font-semibold text-textLo">Topics</Text>
                <View className="flex-row flex-wrap gap-2">
                  {availableTopics.map((t) => {
                    const active = mix.includes(t);
                    return (
                      <Pressable
                        key={t}
                        accessibilityLabel={`${active ? 'Remove' : 'Add'} ${TOPIC_LABELS[t]} ${active ? 'from' : 'to'} the mix`}
                        onPress={() => toggleMix(t)}
                        className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${
                          active ? 'bg-primary' : 'bg-surfaceAlt'
                        }`}>
                        <Ionicons
                          name={active ? 'checkmark-circle' : TOPIC_ICONS[t]}
                          size={14}
                          color={active ? colors.onPrimary : colors.textLo}
                        />
                        <Text
                          className={`text-sm font-semibold ${active ? 'text-white' : 'text-textLo'}`}>
                          {TOPIC_LABELS[t]} ({topicCount(t)})
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  accessibilityLabel="Practice the selected topics"
                  disabled={mixCount === 0}
                  onPress={practiceMix}
                  className={`mt-3 flex-row items-center justify-center gap-2 rounded-full py-3.5 ${
                    mixCount > 0 ? 'bg-primary' : 'bg-surfaceAlt'
                  }`}>
                  <Ionicons
                    name="shuffle"
                    size={16}
                    color={mixCount > 0 ? colors.onPrimary : colors.textLo}
                  />
                  <Text
                    className={`text-sm font-bold ${mixCount > 0 ? 'text-white' : 'text-textLo'}`}>
                    {mix.length === 0
                      ? 'Pick topics to mix'
                      : `Practice ${mixCount} word${mixCount === 1 ? '' : 's'} from ${mix.length} topic${mix.length === 1 ? '' : 's'}`}
                  </Text>
                </Pressable>
              </View>
            )}

            <Text className="mb-2 text-sm font-semibold text-textLo">Lists</Text>

            {/* Tough / mistakes / starred — two-up on wide screens */}
            <View className={isTablet ? '-mx-1 flex-row flex-wrap' : ''}>
              {lists.map((l) => (
                <View
                  key={l.key}
                  style={isTablet ? { width: '50%' } : undefined}
                  className={isTablet ? 'px-1' : ''}>
                  <ListEntry
                    icon={l.icon}
                    iconColor={l.iconColor}
                    title={l.title}
                    subtitle={l.subtitle}
                    count={l.count}
                    onPress={l.onPress}
                  />
                </View>
              ))}
            </View>

            {lists.length === 0 && (
              <Text className="mt-1 text-sm text-textLo">
                Star words or make mistakes in practice to build lists here.
              </Text>
            )}
          </>
        )}
        </Container>
      </ScrollView>
    </SafeAreaView>
  );
}

function ListEntry({
  icon,
  iconColor,
  title,
  subtitle,
  count,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${title}`}
      onPress={onPress}
      className="mb-2 flex-row items-center gap-3 rounded-card bg-surface p-4">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-surfaceAlt">
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-textHi">
          {title} ({count})
        </Text>
        <Text className="text-xs text-textLo">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textLo} />
    </Pressable>
  );
}
