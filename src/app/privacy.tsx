import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Screen } from '@/components/screen';

import { Container } from '@/components/container';
import { MAX_W } from '@/hooks/use-responsive';
import { closeModal } from '@/lib/nav';
import { colors } from '@/theme/tokens';

/**
 * The privacy policy, in the app and on the web at /privacy — App Store
 * Connect requires a reachable URL, and Apple also likes finding it in the app.
 *
 * Every claim here is checked against what the code actually does. If the app
 * starts collecting something new, this page changes in the same commit.
 */
const UPDATED = 'October 2026';
// TODO before submitting to the App Store: swap this for the dedicated
// address. A personal inbox is fine while testing, but it goes on a public
// page and Apple may write to it during review.
const CONTACT = 'likosertugrul128@gmail.com';
// TODO: GDPR wants the controller named, not just an inbox.
const CONTROLLER = 'the developer of Dictinho';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-6">
      <Text className="mb-2 text-lg font-bold text-textHi">{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text className="mb-2 text-sm leading-6 text-textLo">{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View className="mb-1.5 flex-row gap-2">
      <Text className="text-sm leading-6 text-textLo">•</Text>
      <Text className="flex-1 text-sm leading-6 text-textLo">{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  return (
    <Screen className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-5 py-3">
        <Pressable
          accessibilityLabel="Close"
          onPress={closeModal}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-surfaceAlt">
          <Ionicons name="chevron-back" size={20} color={colors.textHi} />
        </Pressable>
        <Text className="text-lg font-bold text-textHi">Privacy</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
        <Container max={MAX_W.content}>
          <Text className="text-2xl font-bold text-textHi">Privacy Policy</Text>
          <Text className="mt-1 text-xs text-textLo">Last updated {UPDATED}</Text>

          <P>
            Dictinho is a personal vocabulary and handwriting app. It keeps what you need to learn
            a language and nothing else. There is no advertising, no analytics and no third-party
            tracking in this app.
          </P>

          <Section title="What the app stores">
            <Bullet>
              <Text className="font-semibold text-textHi">Your account.</Text> If you create one,
              your email address and a password you choose. You can also use the app as a guest, in
              which case the account is only a random identifier with no personal details.
            </Bullet>
            <Bullet>
              <Text className="font-semibold text-textHi">Your learning data.</Text> The words you
              add, their translations, notes, topics, verb tenses, your practice history and
              results, and the pages and notes you write by hand.
            </Bullet>
            <Bullet>
              <Text className="font-semibold text-textHi">Your settings.</Text> Language pair, how
              you answer flashcards, whether answers are read aloud. Some of these stay on the
              device only.
            </Bullet>
          </Section>

          <Section title="Where it is stored, and who else touches it">
            <P>
              Account and learning data are stored with Supabase, which hosts the database and
              authentication on Amazon Web Services. The servers are in the United States, so if
              you are in the UK or the EU your data is transferred there under the standard
              contractual clauses in Supabase&apos;s data processing agreement.
            </P>
            <P>Three companies process data on our behalf, and no one else:</P>
            <Bullet>
              <Text className="font-semibold text-textHi">Supabase</Text> (on Amazon Web Services)
              — the database and your sign-in.
            </Bullet>
            <Bullet>
              <Text className="font-semibold text-textHi">Groq</Text>, and{' '}
              <Text className="font-semibold text-textHi">Anthropic</Text> as a fallback — working
              out a word the dictionary doesn&apos;t have yet. See below.
            </Bullet>
            <P>
              Access is restricted per account at the database level, so one account cannot read
              another&apos;s data.
            </P>
          </Section>

          <Section title="How long it is kept">
            <P>
              Your account and everything in it are kept until you delete them. There is no
              scheduled clear-out and no archive: deleting your account removes the data straight
              away and permanently, not after a waiting period.
            </P>
          </Section>

          <Section title="When a word is looked up">
            <P>
              If a word is not already in the app&apos;s dictionary, the word you typed is sent to
              an AI language model provider (Groq, or Anthropic as a fallback) to work out its part
              of speech, translation and verb forms. Only the word or phrase itself is sent — never
              your account, your email or anything else you have written. The result is added to
              the app&apos;s shared dictionary so the next person who looks it up gets an instant
              answer.
            </P>
            <P>
              Groq is contractually barred from using what it is sent to train or fine-tune any
              model, and does not keep it after answering, beyond short-lived logs for
              troubleshooting and abuse monitoring.
            </P>
          </Section>

          <Section title="Pronunciation">
            <P>
              Reading answers out loud uses the speech engine built into your device. Nothing is
              sent anywhere for this.
            </P>
          </Section>

          <Section title="Your rights">
            <P>
              You can ask for a copy of your data, ask for it to be corrected, ask for it to be
              deleted, or object to it being processed at all. Deletion you can do yourself, in
              the app, at any time — see below. For anything else, write to {CONTACT} and you will
              have an answer within 30 days. If you think your data has been handled badly, you
              can also complain to your country&apos;s data protection authority.
            </P>
          </Section>

          <Section title="Deleting your data">
            <P>
              You can delete your account from inside the app: open Profile and choose “Delete
              account”. This removes the account and everything attached to it — words,
              conjugations, practice history and handwritten pages — immediately and permanently.
              It cannot be undone. Guest accounts can be deleted the same way.
            </P>
          </Section>

          <Section title="Children">
            <P>
              The app is not directed at children under 13 and does not knowingly collect data from
              them.
            </P>
          </Section>

          <Section title="Changes">
            <P>
              If what the app collects ever changes, this page changes with it and the date above
              is updated.
            </P>
          </Section>

          <Section title="Who is responsible">
            <P>
              The data controller is {CONTROLLER}. Questions about this policy or your data:{' '}
              {CONTACT}
            </P>
          </Section>
        </Container>
      </ScrollView>
    </Screen>
  );
}
