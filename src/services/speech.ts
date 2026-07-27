// Text-to-Speech via the device / browser speech engine (expo-speech works on
// iOS, Android and web). UI depends only on the SpeechService interface.

import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

export interface SpeakOptions {
  /** BCP-47 / ISO-639-1 language code, e.g. 'it' */
  language?: string;
  /** 0.1 – 2.0, default ~0.9 */
  rate?: number;
}

export interface SpeechService {
  readonly isAvailable: boolean;
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stop(): Promise<void>;
}

class ExpoSpeechService implements SpeechService {
  get isAvailable(): boolean {
    // Native always has a TTS engine; web needs the SpeechSynthesis API.
    if (Platform.OS !== 'web') return true;
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    if (!text.trim() || !this.isAvailable) return;
    try {
      await Speech.stop(); // interrupt anything already playing
    } catch {
      /* ignore */
    }
    Speech.speak(text, {
      language: options.language ?? 'it-IT',
      rate: options.rate ?? 0.9,
    });
  }

  async stop(): Promise<void> {
    try {
      await Speech.stop();
    } catch {
      /* ignore */
    }
  }
}

export const speechService: SpeechService = new ExpoSpeechService();
