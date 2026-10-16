// Edge Function: delete the calling user's account and everything in it.
//
// Required by the App Store (Guideline 5.1.1(v)): an app that lets people
// create an account must let them delete it from inside the app. It cannot be
// done client-side — removing an auth user needs the service role key, which
// must never reach the client.
//
// The caller proves who they are with their own access token; this function
// only ever deletes the user that token belongs to, so one account can never
// delete another. Everything else goes with it through the foreign keys
// (migration 0021 added the missing profiles → auth.users cascade):
//   profiles → user_words → conjugations / example_sentences / user_word_tags
//   profiles → srs_cards → srs_reviews
//   profiles → tags
//   auth.users → ink_drawings
//
// Deploy: supabase functions deploy delete-account
//   (JWT verification stays ON — unlike enrich-word, this endpoint must never
//    be callable without a token.)
// Secrets: none. SUPABASE_URL / _SERVICE_ROLE_KEY are injected by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    return json({ error: 'The server is missing its Supabase configuration.' }, 500);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in again and retry.' }, 401);

  // Resolve the caller from their own token. This is the only id we delete.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: me, error: whoError } = await caller.auth.getUser();
  if (whoError || !me?.user) {
    return json({ error: 'That session is no longer valid. Sign in again.' }, 401);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(me.user.id);
  if (deleteError) {
    return json({ error: `Could not delete the account: ${deleteError.message}` }, 500);
  }

  return json({ deleted: true });
});
