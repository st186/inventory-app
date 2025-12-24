import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

// Create a singleton Supabase client to avoid multiple instances
// Use window to persist across hot module reloads in development
declare global {
  interface Window {
    __supabaseClient?: SupabaseClient;
  }
}

export function getSupabaseClient() {
  if (typeof window !== 'undefined' && !window.__supabaseClient) {
    window.__supabaseClient = createClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      {
        auth: {
          // Use a unique storage key to prevent conflicts
          storageKey: `sb-${projectId}-auth-token`,
          // Ensure only one client instance
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }
  return window.__supabaseClient!;
}