// Text-to-Speech. Native uses expo-speech (device engine). Web uses the browser
// SpeechSynthesis API directly, handling its quirks (async voice loading, the
// cancel-then-speak drop bug, and Chrome's auto-pause).

import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

export interface SpeakOptions {
  /** ISO-639-1 language code, e.g. 'it' */
  language?: string;
  rate?: number;
}

export interface SpeechService {
  readonly isAvailable: boolean;
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stop(): Promise<void>;
}

const BCP47: Record<string, string> = {
  it: 'it-IT',
  es: 'es-ES',
  en: 'en-US',
  tr: 'tr-TR',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-PT',
};

const isWeb = Platform.OS === 'web';
const synth = (): SpeechSynthesis | null =>
  isWeb && typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;

// Warm up the web voice list as early as possible (voices load async).
if (synth()) {
  const s = synth()!;
  s.getVoices();
  s.addEventListener?.('voiceschanged', () => s.getVoices());
}

function pickVoice(s: SpeechSynthesis, bcp47: string): SpeechSynthesisVoice | undefined {
  const voices = s.getVoices();
  const lc = bcp47.toLowerCase();
  const short = lc.slice(0, 2);
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === lc) ??
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(short))
  );
}

function speakWeb(s: SpeechSynthesis, text: string, bcp47: string, rate: number) {
  const utter = () => {
    try {
      s.cancel();
    } catch {
      /* ignore */
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47;
    u.rate = rate;
    const v = pickVoice(s, bcp47);
    if (v) u.voice = v;
    s.speak(u);
    // Chrome occasionally starts paused — nudge it.
    setTimeout(() => {
      try {
        if (s.paused) s.resume();
      } catch {
        /* ignore */
      }
    }, 120);
  };

  // If voices haven't loaded yet, wait for them once (then speak).
  if (s.getVoices().length === 0) {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      s.removeEventListener?.('voiceschanged', go);
      utter();
    };
    s.addEventListener?.('voiceschanged', go);
    setTimeout(go, 300); // fallback if the event never fires
  } else {
    utter();
  }
}

class DeviceSpeechService implements SpeechService {
  get isAvailable(): boolean {
    return isWeb ? synth() != null : true;
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    if (!text.trim() || !this.isAvailable) return;
    const bcp47 = BCP47[options.language ?? 'it'] ?? options.language ?? 'it-IT';
    const rate = options.rate ?? 0.95;

    if (isWeb) {
      speakWeb(synth()!, text, bcp47, rate);
      return;
    }
    try {
      await Speech.stop();
    } catch {
      /* ignore */
    }
    Speech.speak(text, { language: bcp47, rate });
  }

  async stop(): Promise<void> {
    if (isWeb) {
      try {
        synth()?.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await Speech.stop();
    } catch {
      /* ignore */
    }
  }
}

export const speechService: SpeechService = new DeviceSpeechService();
