import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The drill you are in the middle of, kept across app restarts so practice
 * picks up where you left it instead of rebuilding a fresh queue every time.
 *
 * Only one session is stored: starting a different drill replaces it. What is
 * saved is the *remaining* queue (in order) plus how far you got — the actual
 * scheduling lives in `srs_cards` and is written on every answer anyway, so a
 * lost session costs the user nothing but the running count.
 */
const STORAGE_KEY = 'dictinho-practice-session';

/** A half-finished drill is stale after a week — start fresh then. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SavedSession {
  /** Identifies the drill (mode + filters); a different key means a new drill. */
  key: string;
  /** Route params needed to reopen this exact drill from the Practice tab. */
  params: Record<string, string>;
  mode: string;
  /** user_word ids still to answer, in queue order. */
  remaining: string[];
  done: number;
  total: number;
  savedAt: number;
}

/** Stable identity for a drill's mode + filters. */
export function sessionKey(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedSession;
    if (!Array.isArray(saved.remaining) || saved.remaining.length === 0) return null;
    if (Date.now() - (saved.savedAt ?? 0) > MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

export async function saveSession(session: SavedSession): Promise<void> {
  try {
    if (session.remaining.length === 0) return clearSession();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* practice must never fail because of storage */
  }
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
