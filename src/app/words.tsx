import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { POS_LABELS, POS_VALUES, withArticle, type Pos } from '@/lib/italian';
import { hasGrammar } from '@/lib/lang';
import { useRecentWords, useToggleFlag } from '@/lib/words';
import { colors } from '@/theme/tokens';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export default function WordsScreen() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const recent = useRecentWords();
  const toggleFlag = useToggleFlag();
  const [q, setQ] = useState('');
  const [posFilter, setPosFilter] = useState<Pos | 'all'>('all');

  const wantKnown = status === 'known';
  const title = wantKnown ? 'Known' : 'To learn';

  // All words of this status (for pos filter chips + counts)
  const statusWords = useMemo(
    () =>
      (recent.data ?? []).filter((w) =>
        wantKnown ? w.status === 'known' : w.status === 'learning',
      ),
    [recent.data, wantKnown],
  );
  const availablePos = POS_VALUES.filter((p) => statusWords.some((w) => w.pos === p));
  const activePos = posFilter !== 'all' && !availablePos.includes(posFilter) ? 'all' : posFilter;

  const list = useMemo(() => {
    const needle = norm(q.trim());
    return statusWords
      .filter((w) => (activePos === 'all' ? true : w.pos === activePos))
      .filter((w) => (needle ? norm(`${w.lemma} ${w.translation}`).includes(needle) : true))
      .slice()
      .sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'));
  }, [statusWords, activePos, q]);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Text className="text-2xl font-bold text-textHi">
          {title} ({list.length})
        </Text>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
          <Ionicons name="close" size={20} color={colors.textHi} />
        </Pressable>
      </View>

      {/* Search */}
      <View className="mx-5 mb-3 flex-row items-center gap-2 rounded-2xl bg-surface px-3">
        <Ionicons name="search" size={16} color={colors.textLo} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={`Search ${title}…`}
          placeholderTextColor={colors.textLo}
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 py-2.5 text-base text-textHi"
        />
        {q.length > 0 && (
          <Pressable accessibilityLabel="Clear" onPress={() => setQ('')}>
            <Ionicons name="close-circle" size={18} color={colors.textLo} />
          </Pressable>
        )}
      </View>

      {/* Word-class filter */}
      {availablePos.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3 max-h-9 grow-0"
          contentContainerClassName="gap-2 px-5">
          <Pressable
            onPress={() => setPosFilter('all')}
            className={`rounded-full px-4 py-1.5 ${activePos === 'all' ? 'bg-primary' : 'bg-surfaceAlt'}`}>
            <Text
              className={`text-sm font-semibold ${activePos === 'all' ? 'text-white' : 'text-textLo'}`}>
              All ({statusWords.length})
            </Text>
          </Pressable>
          {availablePos.map((p) => (
            <Pressable
              key={p}
              onPress={() => setPosFilter(p)}
              className={`rounded-full px-4 py-1.5 ${activePos === p ? 'bg-primary' : 'bg-surfaceAlt'}`}>
              <Text
                className={`text-sm font-semibold ${activePos === p ? 'text-white' : 'text-textLo'}`}>
                {POS_LABELS[p]} ({statusWords.filter((w) => w.pos === p).length})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
        <View className="overflow-hidden rounded-card bg-surface">
          {list.map((w, i) => (
            <Pressable
              key={w.id}
              onPress={() => router.push(`/word/${w.id}`)}
              className={`flex-row items-center justify-between px-4 py-3 ${
                i > 0 ? 'border-t border-border' : ''
              }`}>
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-textHi">
                  {hasGrammar(w.target_language) && w.pos === 'noun'
                    ? withArticle(w.lemma, w.gender)
                    : w.lemma}
                </Text>
                <Text className="mt-0.5 text-xs text-textLo">{w.translation}</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Pressable
                  accessibilityLabel={w.flagged ? 'Unflag' : 'Flag'}
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
                <Ionicons name="chevron-forward" size={16} color={colors.textLo} />
              </View>
            </Pressable>
          ))}
          {list.length === 0 && (
            <Text className="px-4 py-6 text-center text-sm text-textLo">No words.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
