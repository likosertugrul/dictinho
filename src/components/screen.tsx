import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'bottom';

/**
 * A screen that keeps clear of the status bar and the home indicator.
 *
 * Deliberately not `SafeAreaView` from react-native-safe-area-context: inside
 * a native full-screen modal on iPad that component applies no padding at all,
 * while `useSafeAreaInsets()` reports the correct values (measured: top 32,
 * bottom 20). Reading the hook and padding ourselves works in both places.
 */
export function Screen({
  children,
  edges = ['top', 'bottom'],
  className = '',
  style,
}: {
  children: ReactNode;
  edges?: Edge[];
  className?: string;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={className}
      style={[
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
