import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Container } from '@/components/container';
import { WordList } from '@/components/word-list';
import { useColumns } from '@/hooks/use-responsive';
import { POS_LABELS, POS_VALUES, type Pos } from '@/lib/italian';
import { setPickedWords } from '@/lib/practice-selection';
import { TOPIC_ICONS, TOPIC_LABELS, TOPIC_VALUES, type Topic } from '@/lib/topics';
import { closeModal } from '@/lib/nav';
import type { UserWord } from '@/lib/schemas';
import { useNearMissWords, useToughWords, useWrongWords } from '@/lib/srs';
import { useRecentWords } from '@/lib/words';
import { colors } from '@/theme/tokens';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

type ListKind = 'learning' | 'known' | 'starred' | 'mistakes' | 'near' | 'tough';

const META: Record<ListKind, { title: string; practiceMode?: string }> = {
  learning: { title: 'To learn' },
  known: { title: 'Known' },
  starred: { title: 'Starred', practiceMode: 'flagged' },
  mistakes: { title: 'Mistakes', practiceMode: 'wrong' },
  near: { title: 'So close', practiceMode: 'near' },
  tough: { title: 'Tough words', practiceMode: 'tough' },
};

export default function WordsScreen() {
  const params = useLocalSearchParams<{ status?: string; list?: string }>();
  const kind: ListKind = (params.list ??
    (params.status === 'known' ? 'known' : 'learning')) as ListKind;
  const meta = META[kind] ?? META.learning;

  const recent = useRecentWords();
  const wrong = useWrongWords();
  const tough = useToughWords();
  const near = useNearMissWords();
  const columns = useColumns();

  const [q, setQ] = useState('');
  const [posFilter, setPosFilter] = useState<Pos | 'all'>('all');
  const [sortKey, setSortKey] = useState<'recent' | 'alpha'>('recent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [topicFilter, setTopicFilter] = useState<Topic | 'all'>('all');
  // Hand-picking words for a "practice just these" session
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pickSort = (key: 'recent' | 'alpha') => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'recent' ? 'desc' : 'asc');
    }
  };

  // Base set for this list
  const baseWords: UserWord[] = useMemo(() => {
    const all = recent.data ?? [];
    switch (kind) {
      case 'known':
        return all.filter((w) => w.status === 'known');
      case 'starred':
        return all.filter((w) => w.flagged);
      case 'mistakes':
        return wrong.data ?? [];
      case 'near':
        return near.data ?? [];
      case 'tough':
        return tough.data ?? [];
      default:
        return all.filter((w) => w.status === 'learning');
    }
  }, [kind, recent.data, wrong.data, near.data, tough.data]);

  const availablePos = POS_VALUES.filter((p) => baseWords.some((w) => w.pos === p));
  const activePos = posFilter !== 'all' && !availablePos.includes(posFilter) ? 'all' : posFilter;
  const availableTopics = TOPIC_VALUES.filter((t) => baseWords.some((w) => w.topic === t));
  const activeTopic =
    topicFilter !== 'all' && !availableTopics.includes(topicFilter) ? 'all' : topicFilter;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const practiceSelected = () => {
    if (selected.size === 0) return;
    setPickedWords([...selected]);
    router.push('/srs?mode=picked' as '/srs');
  };

  const list = useMemo(() => {
    const needle = norm(q.trim());
    return baseWords
      .filter((w) => (activePos === 'all' ? true : w.pos === activePos))
      .filter((w) => (activeTopic === 'all' ? true : w.topic === activeTopic))
      .filter((w) => (needle ? norm(`${w.lemma} ${w.translation}`).includes(needle) : true))
      .slice()
      .sort((a, b) => {
        const cmp =
          sortKey === 'alpha'
            ? a.lemma.localeCompare(b.lemma, 'it')
            : a.created_at.localeCompare(b.created_at);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [baseWords, activePos, activeTopic, q, sortKey, sortDir]);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <Container>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-3">
        <Text className="text-2xl font-bold text-textHi">
          {meta.title} ({list.length})
        </Text>
        <View className="flex-row items-center gap-2">
          {baseWords.length > 0 && (
            <Pressable
              accessibilityLabel={selecting ? 'Cancel selection' : 'Select words to practice'}
              onPress={() => {
                setSelecting((v) => !v);
                setSelected(new Set());
              }}
              className={`flex-row items-center gap-1 rounded-full px-3.5 py-1.5 ${
                selecting ? 'bg-surfaceAlt' : 'bg-surface'
              }`}>
              <Ionicons
                name={selecting ? 'close' : 'checkbox-outline'}
                size={13}
                color={colors.textHi}
              />
              <Text className="text-xs font-bold text-textHi">
                {selecting ? 'Cancel' : 'Select'}
              </Text>
            </Pressable>
          )}
          {!selecting && meta.practiceMode && baseWords.length > 0 && (
            <Pressable
              accessibilityLabel={`Practice ${meta.title}`}
              onPress={() => router.push(`/srs?mode=${meta.practiceMode}` as `/srs`)}
              className="flex-row items-center gap-1 rounded-full bg-primary px-3.5 py-1.5">
              <Ionicons name="albums" size={13} color={colors.onPrimary} />
              <Text className="text-xs font-bold text-white">Practice</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Close"
            onPress={closeModal}
            className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
            <Ionicons name="close" size={20} color={colors.textHi} />
          </Pressable>
        </View>
      </View>

      {/* Search + sort */}
      <View className="mx-5 mb-3 flex-row items-center gap-2 rounded-2xl bg-surface px-3">
        <Ionicons name="search" size={16} color={colors.textLo} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={`Search ${meta.title}…`}
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

      <View className="mb-3 flex-row gap-1.5 px-5">
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
              onPress={() => pickSort(key)}
              className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${active ? 'bg-primary' : 'bg-surfaceAlt'}`}>
              <Ionicons name={icon} size={13} color={active ? colors.onPrimary : colors.textLo} />
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-textLo'}`}>
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
            <Text className={`text-sm font-semibold ${activePos === 'all' ? 'text-white' : 'text-textLo'}`}>
              All ({baseWords.length})
            </Text>
          </Pressable>
          {availablePos.map((p) => (
            <Pressable
              key={p}
              onPress={() => setPosFilter(p)}
              className={`rounded-full px-4 py-1.5 ${activePos === p ? 'bg-primary' : 'bg-surfaceAlt'}`}>
              <Text className={`text-sm font-semibold ${activePos === p ? 'text-white' : 'text-textLo'}`}>
                {POS_LABELS[p]} ({baseWords.filter((w) => w.pos === p).length})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      </Container>

      {availableTopics.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3 max-h-9 grow-0"
          contentContainerClassName="gap-2 px-5">
          <Pressable
            onPress={() => setTopicFilter('all')}
            className={`rounded-full px-4 py-1.5 ${activeTopic === 'all' ? 'bg-primary' : 'bg-surfaceAlt'}`}>
            <Text className={`text-sm font-semibold ${activeTopic === 'all' ? 'text-white' : 'text-textLo'}`}>
              All topics
            </Text>
          </Pressable>
          {availableTopics.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTopicFilter(t)}
              className={`flex-row items-center gap-1.5 rounded-full px-4 py-1.5 ${activeTopic === t ? 'bg-primary' : 'bg-surfaceAlt'}`}>
              <Ionicons
                name={TOPIC_ICONS[t]}
                size={13}
                color={activeTopic === t ? colors.onPrimary : colors.textLo}
              />
              <Text className={`text-sm font-semibold ${activeTopic === t ? 'text-white' : 'text-textLo'}`}>
                {TOPIC_LABELS[t]} ({baseWords.filter((w) => w.topic === t).length})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
        <Container>
          {list.length > 0 ? (
            <WordList
              words={list}
              columns={selecting ? 1 : columns}
              selectable={selecting}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
            />
          ) : (
            <View className="rounded-card bg-surface">
              <Text className="px-4 py-6 text-center text-sm text-textLo">No words.</Text>
            </View>
          )}
        </Container>
      </ScrollView>

      {/* Practice exactly the words ticked above */}
      {selecting && (
        <View className="border-t border-border px-5 pb-2 pt-3">
          <Container>
            <Pressable
              accessibilityLabel="Practice the selected words"
              disabled={selected.size === 0}
              onPress={practiceSelected}
              className={`flex-row items-center justify-center gap-2 rounded-full py-4 ${
                selected.size > 0 ? 'bg-primary' : 'bg-surfaceAlt'
              }`}>
              <Ionicons
                name="albums"
                size={16}
                color={selected.size > 0 ? colors.onPrimary : colors.textLo}
              />
              <Text
                className={`text-base font-bold ${selected.size > 0 ? 'text-white' : 'text-textLo'}`}>
                {selected.size === 0
                  ? 'Tap words to select them'
                  : `Practice ${selected.size} word${selected.size === 1 ? '' : 's'}`}
              </Text>
            </Pressable>
          </Container>
        </View>
      )}
    </SafeAreaView>
  );
}
