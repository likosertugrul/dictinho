import { Modal, Pressable, View } from 'react-native';

import { WordDetail } from '@/components/word-detail';

/**
 * The word card as a sheet over the current screen — used during practice so
 * tapping a word doesn't leave (and reset) the drill session.
 */
export function WordCardModal({ wordId, onClose }: { wordId: string | null; onClose: () => void }) {
  return (
    <Modal
      visible={wordId != null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      {/* Backdrop — tap outside to dismiss */}
      <Pressable
        accessibilityLabel="Close word card"
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
        {/* Sheet — nested Pressable swallows taps so they don't dismiss */}
        <Pressable
          onPress={() => {}}
          className="overflow-hidden rounded-t-card bg-bg"
          style={{ height: '88%' }}>
          {/* Grabber */}
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          {wordId ? <WordDetail id={wordId} onClose={onClose} embedded /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
