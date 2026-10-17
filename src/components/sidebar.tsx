import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, Text, View } from 'react-native';

import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/settings';
import { colors, radius } from '@/theme/tokens';

/** Labelled column, or a bare rail of icons. */
const EXPANDED = 240;
const COLLAPSED = 72;

/**
 * Side navigation for wide screens, with a toggle that narrows it to an icon
 * rail. The navigator lays the bar out beside the screen, so collapsing it
 * hands the width straight to the content — nothing else has to react.
 *
 * Phones keep the stock bottom bar; this replaces it only where the
 * navigation already sits on the side.
 */
export function Sidebar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const collapsed = useSidebarCollapsed();
  const width = collapsed ? COLLAPSED : EXPANDED;

  return (
    <View
      style={{
        width,
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 8,
        backgroundColor: colors.surface,
        borderRightWidth: 1,
        borderRightColor: colors.border,
      }}
      className="px-3">
      <Pressable
        accessibilityLabel={collapsed ? 'Expand the menu' : 'Collapse the menu'}
        accessibilityRole="button"
        onPress={() => setSidebarCollapsed(!collapsed)}
        className={`mb-3 h-11 items-center justify-center rounded-2xl bg-surfaceAlt ${
          collapsed ? '' : 'flex-row gap-2 px-3'
        }`}>
        <Ionicons
          name={collapsed ? 'chevron-forward' : 'chevron-back'}
          size={18}
          color={colors.textLo}
        />
        {!collapsed && <Text className="flex-1 text-sm font-semibold text-textLo">Menu</Text>}
      </Pressable>

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label =
          typeof options.title === 'string' ? options.title : route.name;
        const color = focused ? colors.primary : colors.textLo;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            style={{
              backgroundColor: focused ? colors.surfaceAlt : 'transparent',
              borderRadius: radius.md,
            }}
            className={`mb-1 h-12 items-center ${collapsed ? 'justify-center' : 'flex-row gap-3 px-3'}`}>
            {options.tabBarIcon?.({ focused, color, size: 22 })}
            {!collapsed && (
              <Text numberOfLines={1} className="flex-1 text-sm font-semibold" style={{ color }}>
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
