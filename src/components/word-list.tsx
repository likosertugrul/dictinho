import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { withArticle } from '@/lib/italian';
import { hasGrammar } from '@/lib/lang';
import type { UserWord } from '@/lib/schemas';
import { useToggleFlag } from '@/lib/words';
import { colors } from '@/theme/tokens';

const displayLemma = (w: UserWord) =>
  hasGrammar(w.target_language) && w.pos === 'noun' ? withArticle(w.lemma, w.gender) : w.lemma;

function RowContent({
  w,
  onToggleFlag,
  selectable,
  selected,
}: {
  w: UserWord;
  onToggleFlag: () => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  return (
    <>
      {selectable && (
        <View
          className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${
            selected ? 'border-primary bg-primary' : 'border-border'
          }`}>
          {selected && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
        </View>
      )}
      <View className="flex-1 pr-3">
        <Text className="text-base font-semibold text-textHi">{displayLemma(w)}</Text>
        <Text className="mt-0.5 text-xs text-textLo">{w.translation}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Pressable
          accessibilityLabel={w.flagged ? 'Unflag word' : 'Flag for review'}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleFlag();
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
    </>
  );
}

/**
 * The user's words, as one divided card (phones) or as a grid of cards
 * (`columns` > 1 on tablet/desktop, where a single 1100px-wide row would
 * leave most of the line empty).
 */
export function WordList({
  words,
  columns = 1,
  selectable = false,
  selectedIds,
  onToggleSelect,
}: {
  words: UserWord[];
  columns?: number;
  /** Tapping a row picks it for practice instead of opening its card. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const toggleFlag = useToggleFlag();
  const open = (id: string) =>
    selectable ? onToggleSelect?.(id) : router.push(`/word/${id}`);
  const flip = (w: UserWord) => toggleFlag.mutate({ id: w.id, flagged: !w.flagged });
  const isSelected = (id: string) => selectedIds?.has(id) ?? false;

  if (columns <= 1) {
    return (
      <View className="overflow-hidden rounded-card bg-surface">
        {words.map((w, i) => (
          <Pressable
            key={w.id}
            onPress={() => open(w.id)}
            className={`flex-row items-center justify-between px-4 py-3 ${
              i > 0 ? 'border-t border-border' : ''
            }`}>
            <RowContent
              w={w}
              onToggleFlag={() => flip(w)}
              selectable={selectable}
              selected={isSelected(w.id)}
            />
          </Pressable>
        ))}
      </View>
    );
  }

  // Grid: percentage-width cells with padding as the gutter (RN has no `calc`).
  return (
    <View className="-mx-1.5 flex-row flex-wrap">
      {words.map((w) => (
        <View key={w.id} style={{ width: `${100 / columns}%` }} className="px-1.5 pb-3">
          <Pressable
            onPress={() => open(w.id)}
            className="flex-row items-center justify-between rounded-2xl bg-surface px-4 py-3">
            <RowContent
              w={w}
              onToggleFlag={() => flip(w)}
              selectable={selectable}
              selected={isSelected(w.id)}
            />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
