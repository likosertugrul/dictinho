import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True once .env carries real Supabase credentials (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Lazy singleton so the app can boot (Faz 0/1 UI) before credentials exist.
let client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — copy .env.example to .env and fill the keys.');
  }
  if (!client) {
    client = createClient<Database>(url!, anonKey!, {
      auth: {
        storage: AsyncStorage, // works on native and web alike
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Guarantee a session. Until the real login screen lands (Faz 6) we use
 * Supabase anonymous sign-in — the account can later be linked to an email
 * without losing data. Requires "Anonymous sign-ins" enabled in the dashboard.
 */
export async function ensureSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `Sign-in failed: ${error.message}. ` +
        'Enable Authentication → Sign In / Up → "Allow anonymous sign-ins" in Supabase.',
    );
  }
  return anon.session;
}
