import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud in dev so a missing .env is obvious rather than a silent 401 later.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and fill them in.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    // We use a custom PIN flow, not Supabase Auth sessions, but keep storage
    // persistence on so any future token survives reloads.
    persistSession: true,
    autoRefreshToken: false,
  },
});
