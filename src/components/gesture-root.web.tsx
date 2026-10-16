import type { PropsWithChildren } from 'react';

/**
 * Web needs no gesture-handler root — and importing one would pull the whole
 * library into the web bundle (~1 MB) for a path that uses pointer events.
 */
export function GestureRoot({ children }: PropsWithChildren) {
  return <>{children}</>;
}
