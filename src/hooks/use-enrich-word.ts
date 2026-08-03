import { useMutation } from '@tanstack/react-query';

import { lexiconSuggestionSchema, type LexiconSuggestion } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase';

export interface EnrichInput {
  term: string;
  /** 'it' = the term is in the target language; 'en' = translate the source-language term. */
  lang: 'it' | 'en';
  /** Target language to add the word to (default 'it'). */
  target?: string;
  /** Source language for translations (default 'en'). */
  source?: string;
}

const NOT_A_WORD = 'That doesn’t map to a word in the language you’re learning.';

/**
 * Ask the enrich-word Edge Function to look up a word not in the base lexicon.
 * Works in both directions:
 *  - lang 'it': classify the word typed in the target language
 *  - lang 'en': translate the source-language term to the most common target word
 * Either way it inserts the entry into the shared lexicon (with conjugations for
 * verbs) and returns a suggestion row identical to autocomplete.
 */
export function useEnrichWord() {
  return useMutation<LexiconSuggestion, Error, EnrichInput>({
    mutationFn: async ({ term, lang, target = 'it', source = 'en' }: EnrichInput) => {
      const body =
        lang === 'en'
          ? { english: term.trim(), target, source }
          : { lemma: term.trim(), target, source };
      const { data, error } = await getSupabase().functions.invoke('enrich-word', { body });
      if (error) {
        const detail = (error as { context?: Response }).context;
        if (detail) {
          try {
            const j = await detail.json();
            if (j?.error === 'not_a_word') throw new Error(NOT_A_WORD);
            if (j?.error) throw new Error(j.error);
          } catch {
            /* fall through */
          }
        }
        throw new Error(error.message);
      }
      if (data?.error) {
        throw new Error(data.error === 'not_a_word' ? NOT_A_WORD : data.error);
      }
      return lexiconSuggestionSchema.parse(data);
    },
  });
}
