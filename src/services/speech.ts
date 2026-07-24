// Text-to-Speech abstraction (Faz 7).
// UI code must depend only on this interface so a real implementation
// (expo-speech) can be swapped in later without touching call sites.

export interface SpeakOptions {
  /** BCP-47 / ISO-639-1 language code, e.g. 'it' */
  language?: string;
  /** 0.1 – 2.0, default 1.0 */
  rate?: number;
}

export interface SpeechService {
  readonly isAvailable: boolean;
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stop(): Promise<void>;
}

/** Placeholder implementation until expo-speech lands in Faz 7. */
class NoopSpeechService implements SpeechService {
  readonly isAvailable = false;

  async speak(_text: string, _options?: SpeakOptions): Promise<void> {
    // no-op
  }

  async stop(): Promise<void> {
    // no-op
  }
}

export const speechService: SpeechService = new NoopSpeechService();
