import { Modal, Pressable, View } from 'react-native';

import { WordDetail } from '@/components/word-detail';
import { MAX_W, useResponsive } from '@/hooks/use-responsive';

/**
 * The word card as a sheet over the current screen — used during practice so
 * tapping a word doesn't leave (and reset) the drill session.
 *
 * Phones get a bottom sheet; wide screens get a centered dialog, because a
 * full-width sheet glued to the bottom edge of a monitor reads as broken.
 */
export function WordCardModal({ wordId, onClose }: { wordId: string | null; onClose: () => void }) {
  const { isTablet } = useResponsive();
  return (
    <Modal
      visible={wordId != null}
      transparent
      animationType={isTablet ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent>
      {/* Backdrop — tap outside to dismiss */}
      <Pressable
        accessibilityLabel="Close word card"
        onPress={onClose}
        className={isTablet ? 'flex-1 items-center justify-center p-6' : 'flex-1 justify-end'}
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
        {/* Sheet — nested Pressable swallows taps so they don't dismiss */}
        <Pressable
          onPress={() => {}}
          className={`w-full overflow-hidden bg-bg ${isTablet ? 'rounded-card' : 'rounded-t-card'}`}
          style={{ height: '88%', maxWidth: isTablet ? MAX_W.content : undefined }}>
          {/* Grabber — a drag affordance only makes sense on the bottom sheet */}
          {!isTablet && (
            <View className="items-center pt-2">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>
          )}
          {wordId ? <WordDetail id={wordId} onClose={onClose} embedded /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
