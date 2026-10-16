import type { PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/** Required by gesture-handler on Android; the handwriting canvas needs it. */
export function GestureRoot({ children }: PropsWithChildren) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>;
}
