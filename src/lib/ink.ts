import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { INK_H, INK_W, parseStrokes, type InkStroke } from '@/components/ink/strokes';
import { ensureSession, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/** The handwritten note attached to one word, or an empty page if none yet. */
export function useWordInk(wordId: string | undefined) {
  return useQuery({
    queryKey: ['word-ink', wordId],
    enabled: Boolean(wordId) && isSupabaseConfigured,
    queryFn: async (): Promise<InkStroke[]> => {
      const supabase = getSupabase();
      await ensureSession();
      const { data, error } = await supabase
        .from('ink_drawings')
        .select('strokes')
        .eq('kind', 'word')
        .eq('user_word_id', wordId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return parseStrokes(data?.strokes);
    },
  });
}

export function useSaveWordInk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wordId, strokes }: { wordId: string; strokes: InkStroke[] }) => {
      const supabase = getSupabase();
      const session = await ensureSession();
      // One row per word (unique index on user_word_id), so this upsert needs
      // no read first — saving twice overwrites instead of piling up pages.
      const { error } = await supabase.from('ink_drawings').upsert(
        {
          user_id: session!.user.id,
          kind: 'word',
          user_word_id: wordId,
          strokes,
          width: INK_W,
          height: INK_H,
        },
        { onConflict: 'user_word_id' },
      );
      if (error) throw new Error(error.message);
      return strokes;
    },
    onSuccess: (strokes, { wordId }) => {
      qc.setQueryData(['word-ink', wordId], strokes);
    },
  });
}
