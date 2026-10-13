import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Container } from '@/components/container';
import { InkCanvas } from '@/components/ink/ink-canvas';
import { INK_PAGE_H } from '@/components/ink/strokes';
import { MAX_W, useResponsive } from '@/hooks/use-responsive';
import { useCreatePage, useNotebookPages, type NotebookPage } from '@/lib/notebook';
import { paperColor } from '@/lib/paper';
import { colors, radius } from '@/theme/tokens';

/** Thumbnails are tall, so even a phone fits two across. */
function usePageColumns() {
  const { width } = useResponsive();
  return width >= 1360 ? 4 : width >= 768 ? 3 : 2;
}

/** "Today" / "Yesterday" / "14 Oct" — a page list needs no clock. */
function editedLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function PageCard({ page }: { page: NotebookPage }) {
  return (
    <Pressable
      accessibilityLabel={`Open ${page.title ?? 'untitled page'}`}
      onPress={() => router.push(`/note/${page.id}`)}>
      <View
        className="overflow-hidden"
        style={{ borderRadius: radius.md, backgroundColor: paperColor(page.paper) }}>
        <InkCanvas strokes={page.strokes} vh={INK_PAGE_H} rule={page.rule} />
      </View>
      <Text numberOfLines={1} className="mt-2 text-sm font-semibold text-textHi">
        {page.title?.trim() || 'Untitled page'}
      </Text>
      <Text className="text-xs text-textLo">
        {page.strokes.length === 0 ? 'Empty' : editedLabel(page.updated_at)}
      </Text>
    </Pressable>
  );
}

export default function NotebookScreen() {
  const pages = useNotebookPages();
  const createPage = useCreatePage();
  const columns = usePageColumns();

  const newPage = () =>
    createPage.mutate(undefined, { onSuccess: (id) => router.push(`/note/${id}`) });

  const list = pages.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
        <Container max={MAX_W.wide}>
          <View className="flex-row items-center justify-between pt-2">
            <View>
              <Text className="text-2xl font-bold text-textHi">Notebook</Text>
              <Text className="mt-0.5 text-sm text-textLo">
                Handwritten pages, free of any one word
              </Text>
            </View>
            <Pressable
              accessibilityLabel="New page"
              disabled={createPage.isPending}
              onPress={newPage}
              className="flex-row items-center gap-1.5 rounded-full bg-primary px-4 py-2.5">
              {createPage.isPending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <>
                  <Ionicons name="add" size={16} color={colors.onPrimary} />
                  <Text className="text-sm font-bold text-white">New page</Text>
                </>
              )}
            </Pressable>
          </View>

          {createPage.isError && (
            <Text className="mt-3 text-sm text-primary">{createPage.error.message}</Text>
          )}
          {pages.isError && (
            <Text className="mt-3 text-sm text-primary">{pages.error.message}</Text>
          )}

          {pages.isPending ? (
            <View className="mt-16 items-center">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : list.length === 0 ? (
            <Pressable
              accessibilityLabel="Start your first page"
              onPress={newPage}
              className="mt-6 items-center rounded-card border border-border bg-surface px-6 py-10">
              <Ionicons name="book-outline" size={28} color={colors.primary} />
              <Text className="mt-3 text-base font-bold text-textHi">Start your first page</Text>
              <Text className="mt-1 text-center text-sm text-textLo">
                Grammar tables, lesson notes, anything that doesn’t belong to a single word.
              </Text>
            </Pressable>
          ) : (
            // Percentage-width cells with padding as the gutter (RN has no calc)
            <View className="-mx-1.5 mt-5 flex-row flex-wrap">
              {list.map((page) => (
                <View
                  key={page.id}
                  style={{ width: `${100 / columns}%` }}
                  className="px-1.5 pb-4">
                  <PageCard page={page} />
                </View>
              ))}
            </View>
          )}
        </Container>
      </ScrollView>
    </SafeAreaView>
  );
}
