// Supabase client configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Cloud sync will be disabled.');
}

// Use a harmless placeholder client when env vars are missing so guest mode can still render.
// All cloud paths should also guard with isSupabaseConfigured().
const clientUrl = supabaseUrl || 'https://placeholder.invalid';
const clientAnonKey = supabaseAnonKey || 'placeholder-anon-key';

// Using untyped client for flexibility - types are enforced at the service level
export const supabase = createClient(
  clientUrl,
  clientAnonKey
);

export const isSupabaseConfigured = () => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};
