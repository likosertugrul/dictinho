import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/** Languages the user can choose to learn (target). */
export const LEARNABLE = [
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
] as const;

/** Languages the user can pick as their own (translations shown in this). */
export const SOURCE_LANGS = [
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
] as const;

export type LangCode = (typeof LEARNABLE)[number]['code'];

const ALL = [...LEARNABLE, ...SOURCE_LANGS];

export function langInfo(code: string) {
  return ALL.find((l) => l.code === code) ?? LEARNABLE[0];
}

/** Grammar tables (conjugation, articles, inflection) are Italian-only for now. */
export function hasGrammar(code: string) {
  return code === 'it';
}

// ── Minimal persisted store (no external dep — avoids import.meta bundling issues) ──
interface LangState {
  target: LangCode | null;
  source: string; // source language code the user reads translations in
  chosen: boolean;
  hydrated: boolean;
}

const STORAGE_KEY = 'dictinho-lang';
let state: LangState = { target: null, source: 'en', chosen: false, hydrated: false };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setState(patch: Partial<LangState>) {
  state = { ...state, ...patch };
  emit();
}

// Load persisted choice once, only in a real runtime (not during static
// export in Node, where AsyncStorage's web shim touches `window`).
let loadStarted = false;
function hydrate() {
  if (loadStarted) return;
  loadStarted = true;
  const canStore = Platform.OS !== 'web' || typeof window !== 'undefined';
  if (!canStore) {
    setState({ hydrated: true });
    return;
  }
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<LangState>;
          state = {
            ...state,
            target: (saved.target as LangCode) ?? null,
            source: saved.source ?? 'en',
            chosen: Boolean(saved.chosen),
          };
        } catch {
          /* ignore corrupt value */
        }
      }
    })
    .catch(() => {})
    .finally(() => setState({ hydrated: true }));
}

/** Non-reactive snapshot for use inside mutations/query fns. */
export function currentLangs() {
  return { target: state.target ?? ('it' as LangCode), source: state.source };
}

export function setLanguages(target: LangCode, source: string) {
  setState({ target, source, chosen: true });
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ target, source, chosen: true })).catch(() => {});
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function useLangState<T>(selector: (s: LangState) => T): T {
  hydrate(); // safe no-op after the first call / during SSR
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

/** The active target language, defaulting to Italian until a choice is made. */
export function useTargetLang(): LangCode {
  return useLangState((s) => s.target) ?? 'it';
}

/** The source language (translations shown in this), default English. */
export function useSourceLang(): string {
  return useLangState((s) => s.source);
}

export function useLangChosen(): boolean {
  return useLangState((s) => s.chosen);
}

export function useLangHydrated(): boolean {
  return useLangState((s) => s.hydrated);
}
