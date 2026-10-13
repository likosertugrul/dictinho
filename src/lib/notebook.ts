import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { INK_PAGE_H, INK_W, parseStrokes, type InkStroke } from '@/components/ink/strokes';
import { asPaper, asRule, type Paper, type Rule } from '@/lib/paper';
import { ensureSession, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/** A free-form notebook page — notes that belong to no particular word. */
export interface NotebookPage {
  id: string;
  title: string | null;
  strokes: InkStroke[];
  position: number | null;
  paper: Paper;
  rule: Rule;
  updated_at: string;
}

const COLUMNS = 'id, title, strokes, position, paper, rule, updated_at';

/**
 * Every page, newest edit first within the user's own order. Strokes come
 * along because the list is a wall of thumbnails — that *is* the list.
 */
export function useNotebookPages() {
  return useQuery({
    queryKey: ['notebook-pages'],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<NotebookPage[]> => {
      const supabase = getSupabase();
      await ensureSession();
      const { data, error } = await supabase
        .from('ink_drawings')
        .select(COLUMNS)
        .eq('kind', 'page')
        .order('position', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        strokes: parseStrokes(row.strokes),
        position: row.position,
        paper: asPaper(row.paper),
        rule: asRule(row.rule),
        updated_at: row.updated_at,
      }));
    },
  });
}

/** One page on its own, so the editor survives a reload straight to its URL. */
export function useNotebookPage(id: string | undefined) {
  return useQuery({
    queryKey: ['notebook-page', id],
    enabled: Boolean(id) && isSupabaseConfigured,
    queryFn: async (): Promise<NotebookPage | null> => {
      const supabase = getSupabase();
      await ensureSession();
      const { data, error } = await supabase
        .from('ink_drawings')
        .select(COLUMNS)
        .eq('kind', 'page')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        title: data.title,
        strokes: parseStrokes(data.strokes),
        position: data.position,
        paper: asPaper(data.paper),
        rule: asRule(data.rule),
        updated_at: data.updated_at,
      };
    },
  });
}

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title?: string): Promise<string> => {
      const supabase = getSupabase();
      const session = await ensureSession();
      // New pages go to the end of the user's order.
      const { data: last } = await supabase
        .from('ink_drawings')
        .select('position')
        .eq('kind', 'page')
        .order('position', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await supabase
        .from('ink_drawings')
        .insert({
          user_id: session!.user.id,
          kind: 'page',
          title: title?.trim() || null,
          strokes: [],
          width: INK_W,
          height: INK_PAGE_H,
          position: (last?.position ?? 0) + 1,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notebook-pages'] }),
  });
}

export function useSavePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, strokes }: { id: string; strokes: InkStroke[] }) => {
      const supabase = getSupabase();
      await ensureSession();
      const { error } = await supabase.from('ink_drawings').update({ strokes }).eq('id', id);
      if (error) throw new Error(error.message);
      return strokes;
    },
    onSuccess: (strokes, { id }) => {
      qc.setQueryData<NotebookPage | null>(['notebook-page', id], (old) =>
        old ? { ...old, strokes } : old,
      );
      qc.invalidateQueries({ queryKey: ['notebook-pages'] });
    },
  });
}

export function useRenamePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const supabase = getSupabase();
      await ensureSession();
      const clean = title.trim() || null;
      const { error } = await supabase.from('ink_drawings').update({ title: clean }).eq('id', id);
      if (error) throw new Error(error.message);
      return clean;
    },
    onSuccess: (title, { id }) => {
      qc.setQueryData<NotebookPage | null>(['notebook-page', id], (old) =>
        old ? { ...old, title } : old,
      );
      qc.invalidateQueries({ queryKey: ['notebook-pages'] });
    },
  });
}

/** Sheet colour and ruling. Saved straight away — it is a view, not a draft. */
export function useSetPaperStyle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paper, rule }: { id: string; paper: Paper; rule: Rule }) => {
      const supabase = getSupabase();
      await ensureSession();
      const { error } = await supabase.from('ink_drawings').update({ paper, rule }).eq('id', id);
      if (error) throw new Error(error.message);
      return { paper, rule };
    },
    onSuccess: ({ paper, rule }, { id }) => {
      qc.setQueryData<NotebookPage | null>(['notebook-page', id], (old) =>
        old ? { ...old, paper, rule } : old,
      );
      qc.invalidateQueries({ queryKey: ['notebook-pages'] });
    },
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();
      await ensureSession();
      const { error } = await supabase.from('ink_drawings').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notebook-pages'] }),
  });
}
