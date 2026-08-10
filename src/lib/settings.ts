import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * App preferences, persisted and readable from anywhere (same tiny store shape
 * as lib/lang.ts — no external dependency, safe during static export).
 */
const STORAGE_KEY = 'dictinho-settings';

/** How a flashcard is answered. */
export type AnswerMode = 'typing' | 'choice';

export interface Settings {
  /**
   * Speak the answer by itself when a card is revealed. Off still leaves every
   * speaker button working — it only silences the automatic playback.
   */
  autoSpeak: boolean;
  /** Type the word, or pick it from four options. */
  answerMode: AnswerMode;
}

const DEFAULTS: Settings = { autoSpeak: true, answerMode: 'typing' };

let state: Settings = { ...DEFAULTS };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// Load once, and only in a real runtime (not during static export in Node,
// where AsyncStorage's web shim touches `window`).
let loadStarted = false;
function hydrate() {
  if (loadStarted) return;
  loadStarted = true;
  const canStore = Platform.OS !== 'web' || typeof window !== 'undefined';
  if (!canStore) return;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as Partial<Settings>;
        state = {
          ...state,
          autoSpeak: saved.autoSpeak ?? state.autoSpeak,
          answerMode: saved.answerMode === 'choice' ? 'choice' : state.answerMode,
        };
        emit();
      } catch {
        /* ignore a corrupt value */
      }
    })
    .catch(() => {});
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

export function setAutoSpeak(autoSpeak: boolean) {
  state = { ...state, autoSpeak };
  emit();
  persist();
}

export function setAnswerMode(answerMode: AnswerMode) {
  state = { ...state, answerMode };
  emit();
  persist();
}

/** Non-reactive snapshot, for callbacks that fire outside render. */
export function autoSpeakEnabled(): boolean {
  return state.autoSpeak;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAutoSpeak(): boolean {
  hydrate();
  return useSyncExternalStore(
    subscribe,
    () => state.autoSpeak,
    () => state.autoSpeak,
  );
}

export function useAnswerMode(): AnswerMode {
  hydrate();
  return useSyncExternalStore(
    subscribe,
    () => state.answerMode,
    () => state.answerMode,
  );
}
