import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';

import { WordDetail } from '@/components/word-detail';
import { closeModal } from '@/lib/nav';

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <WordDetail id={id} onClose={closeModal} />
    </Screen>
  );
}
