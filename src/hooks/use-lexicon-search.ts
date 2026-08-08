import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { lexiconSuggestionSchema } from '@/lib/schemas';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const responseSchema = z.array(lexiconSuggestionSchema);

export type SearchLang = 'it' | 'en';

/**
 * Debounced autocomplete. `lang` picks the direction:
 *  - 'it' → match target-language lemmas (`search_lexicon`)
 *  - 'en' → match source-language translations, return target entries
 *           (`search_lexicon_en`)
 * `src` keeps glosses in the language the learner actually reads — the same
 * entry can carry translations for several source languages.
 */
export function useLexiconSearch(
  query: string,
  lang: SearchLang = 'it',
  target = 'it',
  src = 'en',
) {
  const q = useDebouncedValue(query.trim(), 200);

  return useQuery({
    queryKey: ['lexicon-search', lang, target, src, q],
    enabled: isSupabaseConfigured && q.length >= 2,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc(
        lang === 'en' ? 'search_lexicon_en' : 'search_lexicon',
        { q, target, max_results: 8, src },
      );
      if (error) throw new Error(error.message);
      return responseSchema.parse(data);
    },
    placeholderData: (prev) => prev, // keep last list while typing
  });
}
