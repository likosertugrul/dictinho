import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { speechService } from '@/services/speech';
import { colors } from '@/theme/tokens';

/**
 * Tap-to-listen button (TTS in the word's language). Renders nothing when the
 * platform has no speech engine.
 *
 * `plain` sits inline next to text; `chip` is a round tinted button for
 * headers and flashcards.
 */
export function Speaker({
  text,
  lang,
  size = 16,
  variant = 'plain',
  label,
}: {
  text: string;
  lang: string;
  size?: number;
  variant?: 'plain' | 'chip';
  label?: string;
}) {
  if (!speechService.isAvailable) return null;
  const chip = variant === 'chip';
  return (
    <Pressable
      accessibilityLabel={label ?? `Listen to ${text}`}
      hitSlop={8}
      onPress={() => speechService.speak(text, { language: lang })}
      className={
        chip
          ? 'h-10 w-10 items-center justify-center rounded-full bg-surfaceAlt'
          : 'h-7 w-7 items-center justify-center'
      }>
      <Ionicons
        name={chip ? 'volume-medium' : 'volume-medium-outline'}
        size={chip ? Math.max(size, 18) : size}
        color={chip ? colors.textHi : colors.textLo}
      />
    </Pressable>
  );
}
