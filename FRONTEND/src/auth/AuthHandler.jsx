import { supabase } from "../lib/supabaseClient";

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email, password, name = null) {
  const options = {};
  if (name) options.options = { data: { full_name: name } }; // supabase-js v2 expects options object; if your SDK differs, adjust
  // NOTE: if your Supabase settings require email confirm, session may be null
  return supabase.auth.signUp({ email, password }, options.options ? options : undefined);
}

export async function resetPasswordForEmail(email, redirectTo) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function signInWithProvider(provider = "google", redirectTo) {
  return supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
}

