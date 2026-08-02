import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { POS_LABELS, POS_VALUES, type Pos } from '@/lib/italian';
import { hasGrammar } from '@/lib/lang';
import { useToughWords, useWrongWords } from '@/lib/srs';
import { useRecentWords } from '@/lib/words';
import { colors } from '@/theme/tokens';

type Focus = Pos | 'all';

export default function PracticeScreen() {
  const recent = useRecentWords();
  const wrong = useWrongWords();
  const tough = useToughWords();
  const [focus, setFocus] = useState<Focus>('all');
  const [includeKnown, setIncludeKnown] = useState(false);

  const words = recent.data ?? [];
  const starredCount = words.filter((w) => w.flagged).length;
  const mistakesCount = wrong.data?.length ?? 0;
  const toughCount = tough.data?.length ?? 0;
  const hasKnown = words.some((w) => w.status === 'known');
  const articleNouns = words.filter(
    (w) => hasGrammar(w.target_language) && w.pos === 'noun' && w.gender != null,
  ).length;

  const availablePos = POS_VALUES.filter((p) => words.some((w) => w.pos === p));

  const practiceDue = () => {
    const params: Record<string, string> = { mode: 'due' };
    if (focus !== 'all') params.pos = focus;
    if (includeKnown) params.known = '1';
    router.push({ pathname: '/srs', params });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 py-3">
        <Text className="text-2xl font-bold text-textHi">Practice</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-2"
        showsVerticalScrollIndicator={false}>
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

            {/* Flashcards (due) */}
            <Pressable
              accessibilityLabel="Practice flashcards"
              onPress={practiceDue}
              className="mb-4 flex-row items-center gap-3 rounded-card bg-primary p-4">
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
                className="mb-4 flex-row items-center gap-3 rounded-card bg-surface p-4">
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

            <Text className="mb-2 text-sm font-semibold text-textLo">Lists</Text>

            {/* Tough words (repeatedly wrong) */}
            {toughCount > 0 && (
              <ListEntry
                icon="flame"
                iconColor="#F5654E"
                title="Tough words"
                subtitle="Answered wrong several times"
                count={toughCount}
                onPress={() => router.push('/words?list=tough')}
              />
            )}

            {/* Mistakes (last answer wrong) */}
            {mistakesCount > 0 && (
              <ListEntry
                icon="alert-circle"
                iconColor={colors.primary}
                title="Mistakes"
                subtitle="Last answer was wrong"
                count={mistakesCount}
                onPress={() => router.push('/words?list=mistakes')}
              />
            )}

            {/* Starred */}
            {starredCount > 0 && (
              <ListEntry
                icon="star"
                iconColor={colors.pastel.yellow}
                title="Starred"
                subtitle="Words you flagged"
                count={starredCount}
                onPress={() => router.push('/words?list=starred')}
              />
            )}

            {toughCount === 0 && mistakesCount === 0 && starredCount === 0 && (
              <Text className="mt-1 text-sm text-textLo">
                Star words or make mistakes in practice to build lists here.
              </Text>
            )}
          </>
        )}
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
