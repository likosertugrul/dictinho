import '../global.css';

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { GestureRoot } from '@/components/gesture-root';

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
          <Stack.Screen name="word/add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="word/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="srs/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="srs/articles" options={{ presentation: 'modal' }} />
          <Stack.Screen name="words" options={{ presentation: 'modal' }} />
          <Stack.Screen name="note/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
    </GestureRoot>
  );
}
