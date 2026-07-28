import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEARNABLE, setLanguages, SOURCE_LANGS, type LangCode } from '@/lib/lang';
import { colors } from '@/theme/tokens';

const ACCENT: Record<string, string> = {
  it: colors.pastel.blush,
  es: colors.pastel.yellow,
  en: colors.pastel.sky,
  tr: colors.pastel.mint,
  fr: colors.pastel.cream,
  de: colors.pastel.blush,
  pt: colors.pastel.sky,
};

function OptionRow({
  flag,
  name,
  native,
  code,
  active,
  onPress,
}: {
  flag: string;
  name: string;
  native: string;
  code: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-full p-2 pr-5"
      style={{
        backgroundColor: active ? colors.primary : colors.surface,
        borderWidth: 2,
        borderColor: active ? colors.primary : 'transparent',
      }}>
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: ACCENT[code] ?? colors.surfaceAlt }}>
        <Text className="text-2xl">{flag}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-lg font-bold" style={{ color: active ? colors.onPrimary : colors.textHi }}>
          {name}
        </Text>
        <Text className="text-xs" style={{ color: active ? '#ffffffcc' : colors.textLo }}>
          {native}
        </Text>
      </View>
      {active && <Ionicons name="checkmark-circle" size={24} color={colors.onPrimary} />}
    </Pressable>
  );
}

export default function LanguageOnboarding() {
  const [step, setStep] = useState<1 | 2>(1);
  const [target, setTarget] = useState<LangCode | null>(null);
  const [source, setSource] = useState<string>('en');

  const finish = () => {
    if (!target) return;
    setLanguages(target, source);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="flex-grow px-6 pt-8" showsVerticalScrollIndicator={false}>
        {step === 1 ? (
          <>
            <Text className="text-3xl font-bold text-textHi">
              What language{'\n'}do you want to learn?
            </Text>
            <Text className="mt-2 text-sm text-textLo">You can change this anytime in settings.</Text>
            <View className="mt-10 gap-3">
              {LEARNABLE.map((l) => (
                <OptionRow
                  key={l.code}
                  {...l}
                  active={target === l.code}
                  onPress={() => setTarget(l.code)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text className="text-3xl font-bold text-textHi">
              What language{'\n'}do you speak?
            </Text>
            <Text className="mt-2 text-sm text-textLo">
              Translations and meanings will be shown in this language.
            </Text>
            <View className="mt-10 gap-3">
              {SOURCE_LANGS.map((l) => (
                <OptionRow
                  key={l.code}
                  {...l}
                  active={source === l.code}
                  onPress={() => setSource(l.code)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View className="flex-row gap-2 px-6 pb-4">
        {step === 2 && (
          <Pressable
            accessibilityLabel="Back"
            onPress={() => setStep(1)}
            className="items-center justify-center rounded-full bg-surfaceAlt px-6 py-4">
            <Ionicons name="arrow-back" size={18} color={colors.textHi} />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel={step === 1 ? 'Next' : 'Continue'}
          disabled={step === 1 && !target}
          onPress={() => (step === 1 ? setStep(2) : finish())}
          className={`flex-1 items-center rounded-full py-4 ${
            step === 1 && !target ? 'bg-surfaceAlt' : 'bg-primary'
          }`}>
          <Text
            className={`text-base font-bold ${step === 1 && !target ? 'text-textLo' : 'text-white'}`}>
            {step === 1 ? 'Next' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
