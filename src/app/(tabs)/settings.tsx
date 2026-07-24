import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-bold text-textHi">Settings</Text>
        <Text className="mt-2 text-center text-sm text-textLo">
          App preferences and TTS options. Coming in a later phase.
        </Text>
      </View>
    </SafeAreaView>
  );
}
