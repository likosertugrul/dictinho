import '../global.css';

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { GestureRoot } from '@/components/gesture-root';
import { useResponsive } from '@/hooks/use-responsive';

import { useAuthQueryInvalidation } from '@/hooks/use-auth';
import { queryClient } from '@/lib/query';
import { colors } from '@/theme/tokens';

// Dark-first theme derived from docs/design-reference.png
const DictinhoTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    primary: colors.primary,
    text: colors.textHi,
    border: colors.border,
  },
};

// Refetch user data whenever the signed-in user changes
function AuthSync() {
  useAuthQueryInvalidation();
  return null;
}

export default function RootLayout() {
  // iPad presents `modal` as a page sheet, which leaves the screen underneath
  // showing around the edges — the notebook's "New page" button and the tab
  // sidebar bled into the page editor. Tablets get a real full-screen modal;
  // phones keep the card that slides up, where nothing shows behind it.
  const { isTablet } = useResponsive();
  const modal = { presentation: isTablet ? ('fullScreenModal' as const) : ('modal' as const) };

  return (
    // Native only: gesture-handler's root, which the handwriting canvas needs
    // for stylus input. On the web it is a passthrough, so the library stays
    // out of that bundle.
    <GestureRoot>
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <ThemeProvider value={DictinhoTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding/language" />
          <Stack.Screen name="word/add" options={modal} />
          <Stack.Screen name="word/[id]" options={modal} />
          <Stack.Screen name="srs/index" options={modal} />
          <Stack.Screen name="srs/articles" options={modal} />
          <Stack.Screen name="words" options={modal} />
          <Stack.Screen name="note/[id]" options={modal} />
          <Stack.Screen name="privacy" options={modal} />
          <Stack.Screen name="support" options={modal} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
    </GestureRoot>
  );
}
