import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StatsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-bold text-textHi">Performance Chart</Text>
        <Text className="mt-2 text-center text-sm text-textLo">
          Track your results and see your progress grow. Coming in a later phase.
        </Text>
      </View>
    </SafeAreaView>
  );
}
