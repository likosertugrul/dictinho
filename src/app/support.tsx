import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Container } from '@/components/container';
import { Screen } from '@/components/screen';
import { MAX_W } from '@/hooks/use-responsive';
import { closeModal } from '@/lib/nav';
import { colors } from '@/theme/tokens';

/**
 * Support, in the app and on the web at /support — App Store Connect requires
 * a reachable support URL, separate from the privacy policy.
 *
 * Answers here describe what the app actually does. When behaviour changes,
 * this page changes with it.
 */
// TODO before submitting: swap for the dedicated address (see docs/APPSTORE.md).
const CONTACT = 'likosertugrul128@gmail.com';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'A word I added is missing some details',
    a: 'Open the word and use “Re-check with AI”. It works out the forms again with a stronger model, which fixes most irregular nouns and verbs.',
  },
  {
    q: 'The app can’t find a word I know exists',
    a: 'Try the dictionary form — “andare” rather than “vado”, though inflected forms usually work too. If it still isn’t there, add it anyway: the app works the word out and remembers it.',
  },
  {
    q: 'Writing with a stylus doesn’t work',
    a: 'Open a word and choose “Write by hand”, or start a page in the Notebook. On the web, use Chrome or Safari — writing needs a browser that reports pen input. A finger works too until the app sees a real pen; after that a resting palm is ignored so you can lean on the screen.',
  },
  {
    q: 'Can I practise only certain words?',
    a: 'Yes. In Practice you can pick topics to mix, drill only your mistakes or the ones you were close on, or open your word list, tap “Select” and choose words one by one.',
  },
  {
    q: 'Will my words appear on my other devices?',
    a: 'Once you create an account with your email, yes. A guest account stays on the device it was made on — in Profile you can turn it into a permanent account without losing anything.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Profile → Delete account. The account and everything in it — words, practice history and handwritten pages — are removed immediately and permanently.',
  },
];

export default function SupportScreen() {
  return (
    <Screen className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 px-5 py-3">
        <Pressable
          accessibilityLabel="Close"
          onPress={closeModal}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-surfaceAlt">
          <Ionicons name="chevron-back" size={20} color={colors.textHi} />
        </Pressable>
        <Text className="text-lg font-bold text-textHi">Support</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
        <Container max={MAX_W.content}>
          <Text className="text-2xl font-bold text-textHi">How can we help?</Text>
          <Text className="mt-2 text-sm leading-6 text-textLo">
            Dictinho is a vocabulary notebook for people learning a language, built around writing
            words by hand. If something here doesn’t answer your question, write to us — a real
            person reads it.
          </Text>

          <View className="mt-5 flex-row items-center gap-3 rounded-card bg-surface px-4 py-4">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-surfaceAlt">
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-textLo">Email</Text>
              <Text className="text-base font-bold text-textHi">{CONTACT}</Text>
            </View>
          </View>

          <Text className="mb-2 mt-8 text-lg font-bold text-textHi">Common questions</Text>
          <View className="overflow-hidden rounded-card bg-surface">
            {FAQ.map((item, i) => (
              <View key={item.q} className={`px-4 py-4 ${i > 0 ? 'border-t border-border' : ''}`}>
                <Text className="text-sm font-bold text-textHi">{item.q}</Text>
                <Text className="mt-1.5 text-sm leading-6 text-textLo">{item.a}</Text>
              </View>
            ))}
          </View>

          <Text className="mt-8 text-xs leading-5 text-textLo">
            Dictinho shows no ads and tracks nothing. How your data is handled is set out in the
            privacy policy, in Settings.
          </Text>
        </Container>
      </ScrollView>
    </Screen>
  );
}
