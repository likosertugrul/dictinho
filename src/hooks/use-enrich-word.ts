import { useMutation } from '@tanstack/react-query';

import { lexiconSuggestionSchema, type LexiconSuggestion } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase';

export interface EnrichInput {
  term: string;
  /** 'it' = the term is in the target language; 'en' = translate the English term first. */
  lang: 'it' | 'en';
  /** Target language to add the word to (default 'it'). */
  target?: string;
}

/**
 * Ask the enrich-word Edge Function to look up a word not in the base lexicon.
 * Works in both directions:
 *  - lang 'it': classify the typed Italian word
 *  - lang 'en': translate the English term to the most common Italian word
 * Either way it inserts the entry into the shared lexicon (with conjugations for
 * verbs) and returns a suggestion row identical to autocomplete.
 */
export function useEnrichWord() {
  return useMutation<LexiconSuggestion, Error, EnrichInput>({
    mutationFn: async ({ term, lang, target = 'it' }: EnrichInput) => {
      const body =
        lang === 'en'
          ? { english: term.trim(), target }
          : { lemma: term.trim(), target, source: 'en' };
      const { data, error } = await getSupabase().functions.invoke('enrich-word', { body });
      if (error) {
        const detail = (error as { context?: Response }).context;
        if (detail) {
          try {
            const j = await detail.json();
            if (j?.error === 'not_a_word') throw new Error("That doesn't map to an Italian word.");
            if (j?.error) throw new Error(j.error);
          } catch {
            /* fall through */
          }
        }
        throw new Error(error.message);
      }
      if (data?.error) {
        throw new Error(
          data.error === 'not_a_word' ? "That doesn't map to an Italian word." : data.error,
        );
      }
      return lexiconSuggestionSchema.parse(data);
    },
  });
}
