import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WordDetail } from '@/components/word-detail';

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <WordDetail id={id} onClose={() => router.back()} />
    </SafeAreaView>
  );
}
