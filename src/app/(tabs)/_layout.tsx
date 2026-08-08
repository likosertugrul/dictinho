import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { useResponsive } from '@/hooks/use-responsive';
import { useLangChosen, useLangHydrated } from '@/lib/lang';
import { colors } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  const hydrated = useLangHydrated();
  const chosen = useLangChosen();
  // Desktop-width browsers get a labelled sidebar; phones keep the bottom bar.
  // Resizing the window swaps between the two live.
  const { isDesktop } = useResponsive();

  // First-time users pick a language before entering the app.
  if (hydrated && !chosen) {
    return <Redirect href="/onboarding/language" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: isDesktop,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLo,
        tabBarPosition: isDesktop ? 'left' : 'bottom',
        tabBarVariant: isDesktop ? 'material' : 'uikit',
        tabBarLabelPosition: isDesktop ? 'beside-icon' : undefined,
        tabBarStyle: isDesktop
          ? {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              // Both, because the navigator's own minWidth is 25% of the
              // window — far too wide on a large monitor.
              width: 240,
              minWidth: 240,
            }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
        tabBarLabelStyle: isDesktop ? { fontSize: 14, fontWeight: '600' } : undefined,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="stats" options={{ title: 'Practice', tabBarIcon: tabIcon('albums-outline') }} />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon('settings-outline') }}
      />
    </Tabs>
  );
}
