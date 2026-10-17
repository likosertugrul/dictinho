import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Sidebar } from '@/components/sidebar';

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
      // Wide screens get our own sidebar, which can collapse to an icon rail;
      // phones keep the stock bottom bar, untouched.
      tabBar={(props) => (isDesktop ? <Sidebar {...props} /> : <BottomTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLo,
        tabBarPosition: isDesktop ? 'left' : 'bottom',
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="stats" options={{ title: 'Practice', tabBarIcon: tabIcon('albums-outline') }} />
      <Tabs.Screen
        name="notebook"
        options={{ title: 'Notebook', tabBarIcon: tabIcon('book-outline') }}
      />
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
