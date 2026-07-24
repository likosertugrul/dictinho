import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { lexiconSuggestionSchema } from '@/lib/schemas';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const responseSchema = z.array(lexiconSuggestionSchema);

export type SearchLang = 'it' | 'en';

/**
 * Debounced autocomplete. `lang` picks the direction:
 *  - 'it' → match Italian lemmas (`search_lexicon`)
 *  - 'en' → match English translations, return Italian entries (`search_lexicon_en`)
 */
export function useLexiconSearch(query: string, lang: SearchLang = 'it', target = 'it') {
  const q = useDebouncedValue(query.trim(), 200);

  return useQuery({
    queryKey: ['lexicon-search', lang, target, q],
    enabled: isSupabaseConfigured && q.length >= 2,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc(
        lang === 'en' ? 'search_lexicon_en' : 'search_lexicon',
        { q, target, max_results: 8 },
      );
      if (error) throw new Error(error.message);
      return responseSchema.parse(data);
    },
    placeholderData: (prev) => prev, // keep last list while typing
  });
}
