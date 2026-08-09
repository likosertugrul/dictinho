import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Container } from '@/components/container';
import { MAX_W } from '@/hooks/use-responsive';
import { setAutoSpeak, useAutoSpeak } from '@/lib/settings';
import { speechService } from '@/services/speech';
import { colors } from '@/theme/tokens';

export default function SettingsScreen() {
  const autoSpeak = useAutoSpeak();

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 py-3">
        <Container max={MAX_W.form}>
          <Text className="text-2xl font-bold text-textHi">Settings</Text>
        </Container>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-28 pt-2">
        <Container max={MAX_W.form}>
          <Text className="mb-2 text-sm font-semibold text-textLo">Practice</Text>

          <Pressable
            accessibilityLabel="Toggle automatic pronunciation during practice"
            disabled={!speechService.isAvailable}
            onPress={() => setAutoSpeak(!autoSpeak)}
            className="flex-row items-center justify-between rounded-card bg-surface px-4 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-textHi">Read answers out loud</Text>
              <Text className="mt-0.5 text-xs text-textLo">
                {speechService.isAvailable
                  ? 'Speak the answer when a card is revealed. The speaker buttons keep working either way.'
                  : 'This device has no speech engine.'}
              </Text>
            </View>
            <View
              className={`h-6 w-11 justify-center rounded-full px-0.5 ${
                autoSpeak && speechService.isAvailable ? 'bg-primary' : 'bg-surfaceAlt'
              }`}>
              <View
                className={`h-5 w-5 rounded-full bg-white ${
                  autoSpeak && speechService.isAvailable ? 'self-end' : 'self-start'
                }`}
              />
            </View>
          </Pressable>

          <View className="mt-4 flex-row items-start gap-2 rounded-2xl bg-surface px-4 py-3">
            <Ionicons name="information-circle-outline" size={16} color={colors.textLo} />
            <Text className="flex-1 text-xs text-textLo">
              You can also mute pronunciation from the speaker button in a practice session.
            </Text>
          </View>
        </Container>
      </ScrollView>
    </SafeAreaView>
  );
}
