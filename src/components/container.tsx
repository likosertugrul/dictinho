import { View } from 'react-native';
import type { ReactNode } from 'react';

import { MAX_W } from '@/hooks/use-responsive';

/**
 * Centers a screen's content and caps its width on large screens.
 *
 * On phones it is a plain full-width `View` (`maxWidth` never bites), so the
 * mobile design is untouched; on a desktop browser the same tree becomes a
 * centered column instead of stretching edge to edge.
 */
export function Container({
  children,
  max = MAX_W.wide,
  className = '',
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  return (
    <View className={`w-full self-center ${className}`} style={{ maxWidth: max }}>
      {children}
    </View>
  );
}
