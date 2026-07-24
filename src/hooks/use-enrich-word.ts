import { useMutation } from '@tanstack/react-query';

import { lexiconSuggestionSchema, type LexiconSuggestion } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase';

/**
 * Ask the enrich-word Edge Function to look up a word that isn't in the base
 * lexicon: it classifies the word (pos/gender/auxiliary/translation), generates
 * conjugations for verbs, inserts everything into the shared lexicon, and
 * returns a suggestion row identical to what autocomplete would produce.
 */
export function useEnrichWord() {
  return useMutation<LexiconSuggestion, Error, string>({
    mutationFn: async (lemma: string) => {
      const { data, error } = await getSupabase().functions.invoke('enrich-word', {
        body: { lemma: lemma.trim(), target: 'it', source: 'en' },
      });
      if (error) {
        // Edge Function returns a JSON error body on 4xx/5xx
        const detail = (error as { context?: Response }).context;
        if (detail) {
          try {
            const j = await detail.json();
            if (j?.error === 'not_a_word') throw new Error("That doesn't look like an Italian word.");
            if (j?.error) throw new Error(j.error);
          } catch {
            /* fall through */
          }
        }
        throw new Error(error.message);
      }
      if (data?.error) {
        throw new Error(data.error === 'not_a_word' ? "That doesn't look like an Italian word." : data.error);
      }
      return lexiconSuggestionSchema.parse(data);
    },
  });
}
