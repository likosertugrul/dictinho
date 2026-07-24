import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { POS_LABELS, POS_VALUES, withArticle, type Pos } from '@/lib/italian';
import { useRecentWords, useToggleFlag } from '@/lib/words';
import { colors } from '@/theme/tokens';

function StatChip({ icon, value }: { icon: string; value: number }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-surfaceAlt px-3 py-1">
      <Text className="text-xs">{icon}</Text>
      <Text className="text-xs font-semibold text-textHi">{value}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const recent = useRecentWords();
  const toggleFlag = useToggleFlag();
  const [posFilter, setPosFilter] = useState<Pos | 'all'>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<'recent' | 'alpha'>('recent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc'); // recent: desc = newest first

  // Tap the active sort again to flip direction; switching key resets to its default
  const pickSort = (key: 'recent' | 'alpha') => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'recent' ? 'desc' : 'asc'); // newest first / A→Z
    }
  };

  const words = recent.data ?? [];
  const flaggedCount = words.filter((w) => w.flagged).length;
  // Only offer classes the user actually has words in, in canonical order
  const availablePos = POS_VALUES.filter((p) => words.some((w) => w.pos === p));
  const activeFilter = posFilter !== 'all' && !availablePos.includes(posFilter) ? 'all' : posFilter;
  const filteredWords = words
    .filter((w) => (activeFilter === 'all' ? true : w.pos === activeFilter))
    .filter((w) => (flaggedOnly ? w.flagged : true))
    .slice()
    .sort((a, b) => {
      const cmp =
        sortKey === 'alpha'
          ? a.lemma.localeCompare(b.lemma, 'it')
          : a.created_at.localeCompare(b.created_at);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 py-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
          <Ionicons name="person" size={20} color={colors.onPrimary} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-textHi">Welcome</Text>
          <View className="mt-1 flex-row gap-2">
            <StatChip icon="🔥" value={0} />
            <StatChip icon="💎" value={0} />
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-2"
        showsVerticalScrollIndicator={false}>
        {/* Empty state */}
        {!recent.isLoading && words.length === 0 && (
          <View className="mt-24 items-center px-8">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
              <Ionicons name="book-outline" size={28} color={colors.textLo} />
            </View>
            <Text className="mt-4 text-center text-lg font-bold text-textHi">
              Your vocabulary starts here
            </Text>
            <Text className="mt-2 text-center text-sm text-textLo">
              Tap the + button to add your first Italian word.
            </Text>
          </View>
        )}

        {/* Words */}
        {words.length > 0 && (
          <View className="mt-2">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-textHi">My words</Text>
              {/* Sort: tap to select, tap again to reverse */}
              <View className="flex-row gap-1.5">
                {(
                  [
                    { key: 'recent', label: 'Date', icon: 'time-outline' },
                    { key: 'alpha', label: 'A–Z', icon: 'text-outline' },
                  ] as const
                ).map(({ key, label, icon }) => {
                  const active = sortKey === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityLabel={
                        active ? `Reverse ${label} order` : `Sort by ${label}`
                      }
                      onPress={() => pickSort(key)}
                      className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
                        active ? 'bg-primary' : 'bg-surfaceAlt'
                      }`}>
                      <Ionicons
                        name={icon}
                        size={13}
                        color={active ? colors.onPrimary : colors.textLo}
                      />
                      <Text
                        className={`text-xs font-semibold ${active ? 'text-white' : 'text-textLo'}`}>
                        {label}
                      </Text>
                      {active && (
                        <Ionicons
                          name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
                          size={12}
                          color={colors.onPrimary}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Word-class filter bar */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
              contentContainerClassName="gap-2">
              {/* Review (flagged) filter */}
              {flaggedCount > 0 && (
                <Pressable
                  onPress={() => setFlaggedOnly((v) => !v)}
                  className={`flex-row items-center gap-1 rounded-full px-4 py-1.5 ${
                    flaggedOnly ? 'bg-primary' : 'bg-surfaceAlt'
                  }`}>
                  <Ionicons
                    name="star"
                    size={13}
                    color={flaggedOnly ? colors.onPrimary : colors.pastel.yellow}
                  />
                  <Text
                    className={`text-sm font-semibold ${flaggedOnly ? 'text-white' : 'text-textLo'}`}>
                    Review ({flaggedCount})
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setPosFilter('all')}
                className={`rounded-full px-4 py-1.5 ${
                  activeFilter === 'all' ? 'bg-primary' : 'bg-surfaceAlt'
                }`}>
                <Text
                  className={`text-sm font-semibold ${
                    activeFilter === 'all' ? 'text-white' : 'text-textLo'
                  }`}>
                  All ({words.length})
                </Text>
              </Pressable>
              {availablePos.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPosFilter(p)}
                  className={`rounded-full px-4 py-1.5 ${
                    activeFilter === p ? 'bg-primary' : 'bg-surfaceAlt'
                  }`}>
                  <Text
                    className={`text-sm font-semibold ${
                      activeFilter === p ? 'text-white' : 'text-textLo'
                    }`}>
                    {POS_LABELS[p]} ({words.filter((w) => w.pos === p).length})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View className="overflow-hidden rounded-card bg-surface">
              {filteredWords.map((w, i) => (
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
                  <View className="flex-row items-center gap-1.5">
                    {/* Quick flag toggle */}
                    <Pressable
                      accessibilityLabel={w.flagged ? 'Unflag word' : 'Flag for review'}
                      hitSlop={8}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        toggleFlag.mutate({ id: w.id, flagged: !w.flagged });
                      }}
                      className="h-7 w-7 items-center justify-center">
                      <Ionicons
                        name={w.flagged ? 'star' : 'star-outline'}
                        size={16}
                        color={w.flagged ? colors.pastel.yellow : colors.textLo}
                      />
                    </Pressable>
                    {w.auxiliary ? (
                      <View className="rounded-full bg-primary px-2.5 py-0.5">
                        <Text className="text-xs font-semibold text-white">{w.auxiliary}</Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.textLo} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* FAB → add word modal */}
      <Pressable
        accessibilityLabel="Add word"
        onPress={() => router.push('/word/add')}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg">
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </Pressable>
    </SafeAreaView>
  );
}
