import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Languages the user can choose to learn (target). Source stays English. */
export const LEARNABLE = [
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
] as const;

export type LangCode = (typeof LEARNABLE)[number]['code'];

export function langInfo(code: string) {
  return LEARNABLE.find((l) => l.code === code) ?? LEARNABLE[0];
}

/** Grammar tables (conjugation, articles, inflection) are Italian-only for now. */
export function hasGrammar(code: string) {
  return code === 'it';
}

interface LangState {
  /** Target language being learned; null until the user has chosen one. */
  target: LangCode | null;
  chosen: boolean;
  setTarget: (code: LangCode) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      target: null,
      chosen: false,
      setTarget: (code) => set({ target: code, chosen: true }),
    }),
    {
      name: 'dictinho-lang',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** The active target language, defaulting to Italian until a choice is made. */
export function useTargetLang(): LangCode {
  return useLangStore((s) => s.target) ?? 'it';
}
