import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Drills you are in the middle of, kept across app restarts so practice picks
 * up where you left it instead of rebuilding a fresh queue every time.
 *
 * One entry per drill (flashcards and the article drill can both be half
 * finished at once), keyed by mode + filters. What is stored is the *remaining*
 * queue in order plus how far you got — the scheduling itself lives in
 * `srs_cards` and is written on every answer, so losing a session costs the
 * user nothing but the running count.
 */
const STORAGE_KEY = 'dictinho-practice-session';

/** A half-finished drill is stale after a week — start fresh then. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SavedSession {
  /** Identifies the drill (mode + filters); a different key means a new drill. */
  key: string;
  /** Where to reopen it. */
  route: '/srs' | '/srs/articles';
  /** Route params needed to reopen this exact drill. */
  params: Record<string, string>;
  mode: string;
  /** user_word ids still to answer, in queue order. */
  remaining: string[];
  /**
   * Article drill only: which number each remaining question asks, parallel to
   * `remaining` — the drill picks singular/plural at random, so it can't be
   * derived again without changing the questions under the user.
   */
  numbers?: ('sg' | 'pl')[];
  done: number;
  total: number;
  /** Article drill only: right answers so far. */
  correct?: number;
  savedAt: number;
}

/** Stable identity for a drill's mode + filters. */
export function sessionKey(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

const usable = (s: SavedSession | undefined | null): s is SavedSession =>
  s != null &&
  Array.isArray(s.remaining) &&
  s.remaining.length > 0 &&
  Date.now() - (s.savedAt ?? 0) <= MAX_AGE_MS;

async function readAll(): Promise<Record<string, SavedSession>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Pre-multi-drill format stored a single session object
    const map: Record<string, SavedSession> =
      parsed && typeof parsed.key === 'string' ? { [parsed.key]: parsed } : parsed;
    const out: Record<string, SavedSession> = {};
    for (const [k, v] of Object.entries(map ?? {})) if (usable(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

async function writeAll(map: Record<string, SavedSession>): Promise<void> {
  try {
    if (Object.keys(map).length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* practice must never fail because of storage */
  }
}

/** Every unfinished drill, newest first — the Practice tab lists these. */
export async function loadSessions(): Promise<SavedSession[]> {
  const map = await readAll();
  return Object.values(map).sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadSession(key: string): Promise<SavedSession | null> {
  return (await readAll())[key] ?? null;
}

export async function saveSession(session: SavedSession): Promise<void> {
  const map = await readAll();
  if (session.remaining.length === 0) delete map[session.key];
  else map[session.key] = session;
  await writeAll(map);
}

export async function clearSession(key: string): Promise<void> {
  const map = await readAll();
  delete map[key];
  await writeAll(map);
}
