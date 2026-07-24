import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/** Current auth user, kept in sync with Supabase auth state. */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

/**
 * Mount once near the root: refetches user data when the signed-in user
 * changes (sign in / sign out / account switch).
 */
export function useAuthQueryInvalidation() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data: sub } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        qc.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);
}
