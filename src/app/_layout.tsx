import '../global.css';

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRootNavigationState, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useAuthQueryInvalidation } from '@/hooks/use-auth';
import { useLangStore } from '@/lib/lang';
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

// Send first-time users to the language picker once the store has hydrated
// AND the root navigator has mounted (avoids "navigate before mounting").
function LangGate() {
  const chosen = useLangStore((s) => s.chosen);
  const hydrated = useLangStore.persist?.hasHydrated?.() ?? true;
  const pathname = usePathname();
  const router = useRouter();
  const navState = useRootNavigationState();
  useEffect(() => {
    if (!navState?.key) return; // navigator not ready yet
    if (hydrated && !chosen && pathname !== '/onboarding/language') {
      router.replace('/onboarding/language');
    }
  }, [navState?.key, hydrated, chosen, pathname, router]);
  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <LangGate />
      <ThemeProvider value={DictinhoTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding/language" />
          <Stack.Screen name="word/add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="word/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="srs/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="words" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
