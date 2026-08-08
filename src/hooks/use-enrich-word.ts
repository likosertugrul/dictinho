import { useMutation } from '@tanstack/react-query';

import { enrichResultSchema, type EnrichResult } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase';

export interface EnrichInput {
  term: string;
  /** 'it' = the term is in the target language; 'en' = translate the source-language term. */
  lang: 'it' | 'en';
  /** Target language to add the word to (default 'it'). */
  target?: string;
  /** Source language for translations (default 'en'). */
  source?: string;
  /** Look the term up as an idiom / set phrase instead of a single word. */
  kind?: 'word' | 'phrase';
}

const NOT_A_WORD = 'That doesn’t map to a word in the language you’re learning.';
const NOT_A_PHRASE = 'That doesn’t look like an expression in the language you’re learning.';

/**
 * Ask the enrich-word Edge Function to look up a word or idiom that isn't in the
 * base lexicon. Works in both directions:
 *  - lang 'it': classify the word/expression typed in the target language
 *  - lang 'en': translate the source-language term to the most common target
 *    word, or to the equivalent expression when it's an idiom
 * Either way it inserts the entry into the shared lexicon (with conjugations for
 * verbs) and returns a suggestion row identical to autocomplete, plus the same
 * lemma's other word classes.
 */
export function useEnrichWord() {
  return useMutation<EnrichResult, Error, EnrichInput>({
    mutationFn: async ({ term, lang, target = 'it', source = 'en', kind = 'word' }: EnrichInput) => {
      const notFound = kind === 'phrase' ? NOT_A_PHRASE : NOT_A_WORD;
      const body =
        lang === 'en'
          ? { english: term.trim(), target, source, kind }
          : { lemma: term.trim(), target, source, kind };
      const { data, error } = await getSupabase().functions.invoke('enrich-word', { body });
      if (error) {
        const detail = (error as { context?: Response }).context;
        if (detail) {
          try {
            const j = await detail.json();
            if (j?.error === 'not_a_word') throw new Error(notFound);
            if (j?.error) throw new Error(j.error);
          } catch {
            /* fall through */
          }
        }
        throw new Error(error.message);
      }
      if (data?.error) {
        throw new Error(data.error === 'not_a_word' ? notFound : data.error);
      }
      return enrichResultSchema.parse(data);
    },
  });
}
