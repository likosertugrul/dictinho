import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { InkCanvas } from '@/components/ink/ink-canvas';
import { InkPad } from '@/components/ink/ink-pad';
import type { InkStroke } from '@/components/ink/strokes';
import { useSaveWordInk, useWordInk } from '@/lib/ink';
import { colors, radius } from '@/theme/tokens';

interface Props {
  wordId: string;
  /** Freezes the card's ScrollView while the pen is down. */
  onDrawingChange?: (drawing: boolean) => void;
}

/**
 * The handwritten half of a word's notes: collapsed by default, because the
 * typed note is the primary one. Opens into a full writing pad.
 */
export function WordInk({ wordId, onDrawingChange }: Props) {
  const ink = useWordInk(wordId);
  const save = useSaveWordInk();
  const [open, setOpen] = useState(false);

  // `null` means "no edits yet", so a background refetch can never wipe work
  // in progress — the draft simply wins until it is saved or discarded.
  const [draft, setDraft] = useState<InkStroke[] | null>(null);

  // Comparing by JSON is safe because both sides are normalised: jsonb hands
  // keys back sorted, and parseStrokes rebuilds every stroke as {c, w, p}.
  const saved = ink.data ?? [];
  const savedJson = useMemo(() => JSON.stringify(saved), [saved]);
  const strokes = draft ?? saved;
  const dirty = draft != null && JSON.stringify(draft) !== savedJson;

  if (!open) {
    return (
      <View className="mt-4">
        {saved.length > 0 ? (
          <View className="flex-row items-center gap-3">
            <View
              className="flex-1 overflow-hidden"
              style={{ borderRadius: radius.md, backgroundColor: colors.pastel.cream }}>
              <InkCanvas strokes={saved} />
            </View>
            <Pressable
              accessibilityLabel="Edit handwriting"
              accessibilityRole="button"
              onPress={() => setOpen(true)}
              className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2">
              <Ionicons name="create-outline" size={16} color={colors.textHi} />
              <Text className="text-sm font-semibold text-textHi">Edit</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel="Write by hand"
            accessibilityRole="button"
            onPress={() => setOpen(true)}
            className="flex-row items-center gap-2 rounded-card border border-border bg-surface px-4 py-3">
            <Ionicons name="pencil-outline" size={18} color={colors.primary} />
            <Text className="text-sm font-semibold text-textHi">Write by hand</Text>
            <Text className="text-xs text-textLo">· stylus note</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View className="mt-4">
      <InkPad strokes={strokes} onChange={setDraft} onDrawingChange={onDrawingChange} />

      <View className="mt-3 flex-row items-center gap-2">
        <Pressable
          accessibilityLabel={dirty ? 'Save handwriting' : 'Close the pad'}
          accessibilityRole="button"
          disabled={save.isPending}
          onPress={() => {
            if (!dirty) {
              setDraft(null);
              setOpen(false);
              return;
            }
            save.mutate(
              { wordId, strokes },
              {
                onSuccess: () => {
                  setDraft(null);
                  setOpen(false);
                },
              },
            );
          }}
          className="flex-1 items-center rounded-full bg-primary py-3">
          {save.isPending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text className="text-sm font-bold text-white">
              {dirty ? 'Save handwriting' : 'Close'}
            </Text>
          )}
        </Pressable>
        {dirty && (
          <Pressable
            accessibilityLabel="Discard changes"
            accessibilityRole="button"
            disabled={save.isPending}
            onPress={() => {
              setDraft(null);
              setOpen(false);
            }}
            className="rounded-full border border-border bg-surface px-4 py-3">
            <Text className="text-sm font-semibold text-textLo">Discard</Text>
          </Pressable>
        )}
      </View>

      {save.isError && <Text className="mt-2 text-sm text-primary">{save.error.message}</Text>}
      {ink.isError && (
        <Text className="mt-2 text-sm text-primary">
          Couldn&apos;t load your handwriting. Pull the card closed and open it again.
        </Text>
      )}
    </View>
  );
}
