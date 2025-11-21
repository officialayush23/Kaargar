import { supabase } from "../lib/supabaseClient";

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function resetPasswordForEmail(email, redirectTo) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function signInWithProvider(provider = "google", redirectTo) {
  return supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
}

