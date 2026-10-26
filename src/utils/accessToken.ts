// The signed-in person's access token, for the few direct fetch calls outside api.ts. The server
// accepts only a signed-in user on almost every route (security fix, 27 Oct 2026), so these no
// longer send the public key; before sign-in it falls back to the public key, which only the
// public routes (app version, push key) accept.
import { getSupabaseClient } from './supabase/client';
import { publicAnonKey } from './supabase/info';

export async function currentAccessToken(): Promise<string> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token || publicAnonKey;
  } catch {
    return publicAnonKey;
  }
}
