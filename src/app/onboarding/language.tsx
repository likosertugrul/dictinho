import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEARNABLE, useLangStore, type LangCode } from '@/lib/lang';
import { colors } from '@/theme/tokens';

// Pastel accent per option (echoes the design reference)
const ACCENT: Record<LangCode, string> = {
  it: colors.pastel.blush,
  es: colors.pastel.yellow,
  en: colors.pastel.sky,
};

export default function LanguageOnboarding() {
  const setTarget = useLangStore((s) => s.setTarget);
  const current = useLangStore((s) => s.target);
  const [selected, setSelected] = useState<LangCode | null>(current);

  const confirm = () => {
    if (!selected) return;
    setTarget(selected);
    // First run → home; opened from settings → back
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="flex-1 px-6 pt-8">
        <Text className="text-3xl font-bold text-textHi">
          What language{'\n'}do you want to learn?
        </Text>
        <Text className="mt-2 text-sm text-textLo">You can change this anytime in settings.</Text>

        <View className="mt-10 gap-3">
          {LEARNABLE.map((l) => {
            const active = selected === l.code;
            return (
              <Pressable
                key={l.code}
                onPress={() => setSelected(l.code)}
                className="flex-row items-center gap-3 rounded-full p-2 pr-5"
                style={{
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 2,
                  borderColor: active ? colors.primary : 'transparent',
                }}>
                <View
                  className="h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: ACCENT[l.code] }}>
                  <Text className="text-2xl">{l.flag}</Text>
                </View>
                <View className="flex-1">
                  <Text
                    className="text-lg font-bold"
                    style={{ color: active ? colors.onPrimary : colors.textHi }}>
                    {l.name}
                  </Text>
                  <Text className="text-xs" style={{ color: active ? '#ffffffcc' : colors.textLo }}>
                    {l.native}
                  </Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={24} color={colors.onPrimary} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="px-6 pb-4">
        <Pressable
          accessibilityLabel="Continue"
          disabled={!selected}
          onPress={confirm}
          className={`items-center rounded-full py-4 ${selected ? 'bg-primary' : 'bg-surfaceAlt'}`}>
          <Text className={`text-base font-bold ${selected ? 'text-white' : 'text-textLo'}`}>
            Continue
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
