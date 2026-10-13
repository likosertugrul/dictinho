import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InkCanvas, type InkTool } from '@/components/ink/ink-canvas';
import { INK_DEFAULT_COLOR, INK_DEFAULT_WIDTH, InkToolbar } from '@/components/ink/ink-pad';
import { INK_PAGE_H, INK_W, eraseAt, type InkStroke } from '@/components/ink/strokes';
import { closeModal } from '@/lib/nav';
import {
  useDeletePage,
  useNotebookPage,
  useRenamePage,
  useSavePage,
  useSetPaperStyle,
} from '@/lib/notebook';
import {
  PAPER_LABELS,
  PAPER_VALUES,
  RULE_ICONS,
  RULE_LABELS,
  RULE_VALUES,
  paperColor,
  type Paper,
  type Rule,
} from '@/lib/paper';
import { colors, radius } from '@/theme/tokens';

/**
 * Anything that asks a question floats over the page instead of sitting in the
 * column. Inline panels used to push the sheet smaller the moment they opened,
 * which resized the page mid-note.
 */
function Overlay({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      className="items-center justify-center px-6">
      <Pressable
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          // Explicit rgba rather than a /opacity class: the dim has to be the
          // same on native and web without relying on NativeWind alpha.
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
        }}
      />
      <View className="w-full max-w-md rounded-card bg-surface p-5">{children}</View>
    </View>
  );
}

export default function NotePageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const page = useNotebookPage(id);
  const savePage = useSavePage();
  const renamePage = useRenamePage();
  const deletePage = useDeletePage();
  const setPaperStyle = useSetPaperStyle();

  // `null` until the pen touches the page, so a background refetch cannot
  // throw away work in progress.
  const [draft, setDraft] = useState<InkStroke[] | null>(null);
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState<string>(INK_DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(INK_DEFAULT_WIDTH);
  const [title, setTitle] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pickingPaper, setPickingPaper] = useState(false);
  // The sheet is scaled to the space left over, so it never needs scrolling —
  // and a pen stroke can never drag the page out from under itself.
  const [box, setBox] = useState({ width: 0, height: 0 });

  const saved = page.data?.strokes ?? [];
  const savedJson = useMemo(() => JSON.stringify(saved), [saved]);
  const strokes = draft ?? saved;
  const dirty = draft != null && JSON.stringify(draft) !== savedJson;

  const savedTitle = page.data?.title ?? '';
  const titleValue = title ?? savedTitle;
  const paper: Paper = page.data?.paper ?? 'cream';
  const rule: Rule = page.data?.rule ?? 'lines';

  const applyStyle = (next: { paper?: Paper; rule?: Rule }) => {
    if (!id) return;
    setPaperStyle.mutate({ id, paper: next.paper ?? paper, rule: next.rule ?? rule });
  };

  const onBoxLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox({ width: w, height: h });
  };
  // Fit by whichever dimension runs out first.
  const sheetWidth = Math.min(box.width, box.height * (INK_W / INK_PAGE_H));

  const commitTitle = () => {
    if (!id || title == null || title.trim() === savedTitle.trim()) return;
    renamePage.mutate({ id, title });
  };

  const save = (then?: () => void) => {
    if (!id) return;
    savePage.mutate(
      { id, strokes },
      {
        onSuccess: () => {
          setDraft(null);
          then?.();
        },
      },
    );
  };

  const close = () => {
    commitTitle();
    if (dirty) save(closeModal);
    else closeModal();
  };

  if (page.isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg" edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!page.data) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="document-outline" size={28} color={colors.textLo} />
          <Text className="mt-3 text-center text-base font-bold text-textHi">
            This page is gone
          </Text>
          <Text className="mt-1 text-center text-sm text-textLo">
            {page.error ? page.error.message : 'It may have been deleted on another device.'}
          </Text>
          <Pressable
            accessibilityLabel="Back to the notebook"
            onPress={closeModal}
            className="mt-6 rounded-full bg-primary px-8 py-3">
            <Text className="text-sm font-bold text-white">Back to notebook</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const writeError = savePage.error?.message ?? renamePage.error?.message ?? null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      {/* Header: title is editable in place — a page is named by what's on it */}
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable
          accessibilityLabel={dirty ? 'Save and close' : 'Close'}
          onPress={close}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-surfaceAlt">
          <Ionicons name="chevron-back" size={20} color={colors.textHi} />
        </Pressable>
        <TextInput
          value={titleValue}
          onChangeText={setTitle}
          onBlur={commitTitle}
          onSubmitEditing={commitTitle}
          placeholder="Untitled page"
          placeholderTextColor={colors.textLo}
          returnKeyType="done"
          className="flex-1 rounded-full bg-surface px-4 py-2.5 text-base font-semibold text-textHi"
        />
        <Pressable
          accessibilityLabel="Paper and ruling"
          accessibilityState={{ selected: pickingPaper }}
          onPress={() => setPickingPaper(true)}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-surfaceAlt">
          <Ionicons name="color-palette-outline" size={18} color={colors.textHi} />
        </Pressable>
        <Pressable
          accessibilityLabel="Delete this page"
          onPress={() => setConfirmingDelete(true)}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-surfaceAlt">
          <Ionicons name="trash-outline" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* The sheet, scaled once to the space it has */}
      <View onLayout={onBoxLayout} className="flex-1 items-center justify-center px-4">
        {sheetWidth > 0 && (
          <View
            className="overflow-hidden"
            style={{
              width: sheetWidth,
              borderRadius: radius.card,
              backgroundColor: paperColor(paper),
            }}>
            <InkCanvas
              strokes={strokes}
              vh={INK_PAGE_H}
              rule={rule}
              edit={{
                tool,
                color,
                width,
                onAddStroke: (stroke) => setDraft([...strokes, stroke]),
                onErase: (x, y, r) => {
                  const left = eraseAt(strokes, x, y, r);
                  if (left.length !== strokes.length) setDraft(left);
                },
              }}
            />
          </View>
        )}

        {/* Floats, so an error never changes the sheet's size */}
        {writeError && (
          <View
            style={{ position: 'absolute', left: 16, right: 16, bottom: 8 }}
            className="rounded-2xl bg-surface px-4 py-3">
            <Text className="text-center text-sm text-primary">{writeError}</Text>
          </View>
        )}
      </View>

      {/*
        Fixed height, always the same controls. Swapping a hint line for a
        button row used to shrink the box above and resize the page on the
        first stroke.
      */}
      <View className="px-4 pb-2 pt-3">
        <InkToolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          width={width}
          onWidthChange={setWidth}
          canUndo={strokes.length > 0}
          onUndo={() => setDraft(strokes.slice(0, -1))}
          onClear={() => setDraft([])}
        />

        <View className="mt-3 flex-row gap-2">
          <Pressable
            accessibilityLabel="Discard changes"
            disabled={!dirty || savePage.isPending}
            onPress={() => setDraft(null)}
            className={`rounded-full border border-border bg-surface px-5 py-3.5 ${
              dirty ? '' : 'opacity-40'
            }`}>
            <Text className="text-sm font-semibold text-textLo">Discard</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={dirty ? 'Save this page' : 'Everything is saved'}
            disabled={!dirty || savePage.isPending}
            onPress={() => save()}
            className={`flex-1 items-center rounded-full py-3.5 ${
              dirty ? 'bg-primary' : 'bg-surfaceAlt'
            }`}>
            {savePage.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text className={`text-sm font-bold ${dirty ? 'text-white' : 'text-textLo'}`}>
                {dirty ? 'Save page' : 'Saved'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {pickingPaper && (
        <Overlay onDismiss={() => setPickingPaper(false)}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-textHi">Paper</Text>
            <Pressable
              accessibilityLabel="Close paper options"
              onPress={() => setPickingPaper(false)}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt">
              <Ionicons name="close" size={18} color={colors.textHi} />
            </Pressable>
          </View>

          <View className="mt-4 flex-row flex-wrap gap-2">
            {PAPER_VALUES.map((value) => {
              const active = paper === value;
              return (
                <Pressable
                  key={value}
                  accessibilityLabel={PAPER_LABELS[value]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => applyStyle({ paper: value })}
                  className="items-center gap-1">
                  <View
                    className="h-11 w-11 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: paperColor(value),
                      borderWidth: active ? 3 : 1,
                      borderColor: active ? colors.primary : colors.border,
                    }}>
                    {active && <Ionicons name="checkmark" size={18} color={colors.onPastel} />}
                  </View>
                  <Text className="text-[10px] text-textLo">{PAPER_LABELS[value]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-textLo">
            Ruling
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {RULE_VALUES.map((value) => {
              const active = rule === value;
              return (
                <Pressable
                  key={value}
                  accessibilityLabel={RULE_LABELS[value]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => applyStyle({ rule: value })}
                  className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${
                    active ? 'bg-primary' : 'bg-surfaceAlt'
                  }`}>
                  <Ionicons
                    name={RULE_ICONS[value]}
                    size={15}
                    color={active ? colors.onPrimary : colors.textLo}
                  />
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-textHi'}`}>
                    {RULE_LABELS[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {setPaperStyle.isError && (
            <Text className="mt-3 text-sm text-primary">{setPaperStyle.error.message}</Text>
          )}
        </Overlay>
      )}

      {confirmingDelete && (
        <Overlay onDismiss={() => setConfirmingDelete(false)}>
          <Text className="text-center text-base font-bold text-textHi">
            Delete “{titleValue.trim() || 'Untitled page'}”?
          </Text>
          <Text className="mt-1 text-center text-sm text-textLo">
            The page and everything written on it go for good.
          </Text>
          <View className="mt-4 flex-row gap-2">
            <Pressable
              accessibilityLabel="Cancel delete"
              disabled={deletePage.isPending}
              onPress={() => setConfirmingDelete(false)}
              className="flex-1 items-center rounded-full bg-surfaceAlt py-3">
              <Text className="text-sm font-bold text-textHi">Keep it</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Confirm delete"
              disabled={deletePage.isPending}
              onPress={() => id && deletePage.mutate(id, { onSuccess: closeModal })}
              className="flex-1 items-center rounded-full bg-primary py-3">
              {deletePage.isPending ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text className="text-sm font-bold text-white">Delete</Text>
              )}
            </Pressable>
          </View>
          {deletePage.isError && (
            <Text className="mt-3 text-center text-sm text-primary">
              {deletePage.error.message}
            </Text>
          )}
        </Overlay>
      )}
    </SafeAreaView>
  );
}
