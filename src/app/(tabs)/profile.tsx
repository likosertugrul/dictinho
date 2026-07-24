import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthUser } from '@/hooks/use-auth';
import { getSupabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

type Mode = 'create' | 'signin';

export default function ProfileScreen() {
  const { user, loading } = useAuthUser();
  const [mode, setMode] = useState<Mode>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isAnonymous = user?.is_anonymous ?? false;
  const canSubmit = email.trim().includes('@') && password.length >= 6 && !pending;

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      setEmail('');
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  // Convert the guest (anonymous) account into a permanent one — keeps all words
  const createAccount = () =>
    run(async () => {
      const supabase = getSupabase();
      if (isAnonymous) {
        const { error: err } = await supabase.auth.updateUser({
          email: email.trim(),
          password,
        });
        if (err) throw new Error(err.message);
        setInfo('Account created — your words are now tied to this email.');
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw new Error(err.message);
        if (!data.session) {
          setInfo(
            'Almost there — email confirmation appears to be enabled in Supabase. Disable it (Authentication → Sign In / Up → Email) or check your inbox.',
          );
        }
      }
    });

  const signIn = () =>
    run(async () => {
      const { error: err } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw new Error(err.message);
    });

  const signOut = () =>
    run(async () => {
      const { error: err } = await getSupabase().auth.signOut();
      if (err) throw new Error(err.message);
    });

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── Signed in with a real account ──────────────────────────────────────────
  if (user && !isAnonymous) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
        <ScrollView contentContainerClassName="px-5 pt-4">
          <Text className="text-2xl font-bold text-textHi">Profile</Text>
          <View className="mt-4 items-center rounded-card bg-surface p-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
              <Ionicons name="person" size={28} color={colors.onPrimary} />
            </View>
            <Text className="mt-3 text-base font-bold text-textHi">{user.email}</Text>
            <Text className="mt-1 text-xs text-textLo">Signed in · learning EN → IT</Text>
          </View>
          <Pressable
            accessibilityLabel="Sign out"
            disabled={pending}
            onPress={signOut}
            className="mt-4 items-center rounded-full border border-border py-3.5">
            {pending ? (
              <ActivityIndicator color={colors.textHi} />
            ) : (
              <Text className="text-sm font-bold text-textHi">Sign out</Text>
            )}
          </Pressable>
          {error && <Text className="mt-3 text-sm text-primary">{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Guest or signed out ────────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="px-5 pt-4" keyboardShouldPersistTaps="handled">
          <Text className="text-2xl font-bold text-textHi">Profile</Text>

          {isAnonymous && (
            <View className="mt-4 rounded-card bg-surface p-4">
              <Text className="text-sm font-bold text-textHi">You're using a guest account</Text>
              <Text className="mt-1 text-xs text-textLo">
                Your words are saved on this device. Create an account with your email to keep
                them safe and use them on other devices.
              </Text>
            </View>
          )}

          {/* Mode toggle */}
          <View className="mt-5 flex-row gap-2">
            {(
              [
                { key: 'create', label: 'Create account' },
                { key: 'signin', label: 'Sign in' },
              ] as const
            ).map(({ key, label }) => (
              <Pressable
                key={key}
                onPress={() => {
                  setMode(key);
                  setError(null);
                  setInfo(null);
                }}
                className={`rounded-full px-4 py-2 ${mode === key ? 'bg-primary' : 'bg-surfaceAlt'}`}>
                <Text
                  className={`text-sm font-semibold ${mode === key ? 'text-white' : 'text-textLo'}`}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === 'signin' && isAnonymous && (
            <Text className="mt-3 text-xs text-textLo">
              Heads up: signing in to another account switches away from this guest list. To keep
              the words you added as a guest, use “Create account” instead.
            </Text>
          )}

          <Text className="mb-2 mt-5 text-sm font-semibold text-textLo">Email</Text>
          <View className="rounded-2xl bg-surface px-4">
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textLo}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              className="py-3.5 text-base text-textHi"
            />
          </View>

          <Text className="mb-2 mt-4 text-sm font-semibold text-textLo">
            Password (min 6 characters)
          </Text>
          <View className="rounded-2xl bg-surface px-4">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              secureTextEntry
              autoCapitalize="none"
              className="py-3.5 text-base text-textHi"
            />
          </View>

          <Pressable
            accessibilityLabel={mode === 'create' ? 'Create account' : 'Sign in'}
            disabled={!canSubmit}
            onPress={mode === 'create' ? createAccount : signIn}
            className={`mt-5 items-center rounded-full py-4 ${canSubmit ? 'bg-primary' : 'bg-surfaceAlt'}`}>
            {pending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text className={`text-base font-bold ${canSubmit ? 'text-white' : 'text-textLo'}`}>
                {mode === 'create' ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </Pressable>

          {error && <Text className="mt-3 text-sm text-primary">{error}</Text>}
          {info && <Text className="mt-3 text-sm text-textLo">{info}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
