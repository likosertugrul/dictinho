import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { POS_LABELS, POS_VALUES, withArticle, type Pos } from '@/lib/italian';
import type { UserWord } from '@/lib/schemas';
import { useWrongWords } from '@/lib/srs';
import { useRecentWords } from '@/lib/words';
import { colors } from '@/theme/tokens';

type Focus = Pos | 'all';

export default function PracticeScreen() {
  const recent = useRecentWords();
  const wrong = useWrongWords();
  const [focus, setFocus] = useState<Focus>('all');

  const words = recent.data ?? [];
  const starred = words.filter((w) => w.flagged);
  const mistakes = wrong.data ?? [];

  // Word classes the user actually has, in canonical order
  const availablePos = POS_VALUES.filter((p) => words.some((w) => w.pos === p));

  const practice = (mode: 'due' | 'flagged' | 'wrong') =>
    router.push({
      pathname: '/srs',
      params: focus === 'all' ? { mode } : { mode, pos: focus },
    });

  const applyFocus = (list: UserWord[]) =>
    focus === 'all' ? list : list.filter((w) => w.pos === focus);

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
            {/* Focus: mixed or a single word class */}
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
                      className={`rounded-full px-4 py-1.5 ${
                        focus === f ? 'bg-primary' : 'bg-surfaceAlt'
                      }`}>
                      <Text
                        className={`text-sm font-semibold ${focus === f ? 'text-white' : 'text-textLo'}`}>
                        {f === 'all' ? 'Mixed' : POS_LABELS[f]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Flashcards (due, spaced repetition) */}
            <Pressable
              accessibilityLabel="Practice flashcards"
              onPress={() => practice('due')}
              className="mb-2 flex-row items-center gap-3 rounded-card bg-primary p-4">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-white/20">
                <Ionicons name="albums" size={22} color={colors.onPrimary} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white">Flashcards</Text>
                <Text className="text-xs text-white/80">
                  Review words that are due{focus !== 'all' ? ` · ${POS_LABELS[focus]}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onPrimary} />
            </Pressable>

            {/* Starred */}
            {applyFocus(starred).length > 0 && (
              <WordSection
                title="Starred"
                icon="star"
                iconColor={colors.pastel.yellow}
                words={applyFocus(starred)}
                focus={focus}
                onPractice={() => practice('flagged')}
              />
            )}

            {/* Mistakes */}
            {applyFocus(mistakes).length > 0 && (
              <WordSection
                title="Mistakes"
                icon="alert-circle"
                iconColor={colors.primary}
                words={applyFocus(mistakes)}
                focus={focus}
                onPractice={() => practice('wrong')}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A practice list grouped by word class (or flat when a focus is selected). */
function WordSection({
  title,
  icon,
  iconColor,
  words,
  focus,
  onPractice,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  words: UserWord[];
  focus: Focus;
  onPractice: () => void;
}) {
  const groups =
    focus === 'all'
      ? POS_VALUES.map((p) => ({ pos: p, items: words.filter((w) => w.pos === p) })).filter(
          (g) => g.items.length > 0,
        )
      : [{ pos: focus as Pos, items: words }];

  return (
    <View className="mt-6">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name={icon} size={18} color={iconColor} />
          <Text className="text-lg font-bold text-textHi">
            {title} ({words.length})
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Practice ${title}`}
          onPress={onPractice}
          className="flex-row items-center gap-1 rounded-full bg-primary px-3.5 py-1.5">
          <Ionicons name="refresh" size={13} color={colors.onPrimary} />
          <Text className="text-xs font-bold text-white">Practice</Text>
        </Pressable>
      </View>

      {groups.map((g) => (
        <View key={g.pos} className="mb-3">
          {focus === 'all' && (
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-textLo">
              {POS_LABELS[g.pos]} ({g.items.length})
            </Text>
          )}
          <View className="overflow-hidden rounded-card bg-surface">
            {g.items.map((w, i) => (
              <Pressable
                key={w.id}
                onPress={() => router.push(`/word/${w.id}`)}
                className={`flex-row items-center justify-between px-4 py-3 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}>
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold text-textHi">
                    {w.pos === 'noun' ? withArticle(w.lemma, w.gender) : w.lemma}
                  </Text>
                  <Text className="mt-0.5 text-xs text-textLo">{w.translation}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textLo} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
