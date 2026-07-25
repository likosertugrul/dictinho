import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withArticle } from '@/lib/italian';
import { useWrongWords } from '@/lib/srs';
import { useRecentWords } from '@/lib/words';
import { colors } from '@/theme/tokens';

export default function PracticeScreen() {
  const recent = useRecentWords();
  const wrong = useWrongWords();

  const words = recent.data ?? [];
  const flaggedCount = words.filter((w) => w.flagged).length;
  const mistakes = wrong.data ?? [];

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
            {/* Practice all (spaced repetition) */}
            <Pressable
              accessibilityLabel="Practice flashcards"
              onPress={() => router.push('/srs')}
              className="mb-2 flex-row items-center gap-3 rounded-card bg-primary p-4">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-white/20">
                <Ionicons name="albums" size={22} color={colors.onPrimary} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white">Flashcards</Text>
                <Text className="text-xs text-white/80">
                  Review words that are due (spaced repetition)
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onPrimary} />
            </Pressable>

            {/* Practice starred */}
            {flaggedCount > 0 && (
              <Pressable
                accessibilityLabel="Practice starred words"
                onPress={() => router.push('/srs?mode=flagged')}
                className="mb-2 flex-row items-center gap-3 rounded-card bg-surface p-4">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-surfaceAlt">
                  <Ionicons name="star" size={20} color={colors.pastel.yellow} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-textHi">Starred words</Text>
                  <Text className="text-xs text-textLo">
                    Drill your {flaggedCount} starred word{flaggedCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLo} />
              </Pressable>
            )}

            {/* Mistakes — words answered wrong */}
            {mistakes.length > 0 && (
              <View className="mt-6">
                <View className="mb-3 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="alert-circle" size={18} color={colors.primary} />
                    <Text className="text-lg font-bold text-textHi">
                      Mistakes ({mistakes.length})
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Practice mistakes"
                    onPress={() => router.push('/srs?mode=wrong')}
                    className="flex-row items-center gap-1 rounded-full bg-primary px-3.5 py-1.5">
                    <Ionicons name="refresh" size={13} color={colors.onPrimary} />
                    <Text className="text-xs font-bold text-white">Practice</Text>
                  </Pressable>
                </View>
                <View className="overflow-hidden rounded-card bg-surface">
                  {mistakes.map((w, i) => (
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
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
