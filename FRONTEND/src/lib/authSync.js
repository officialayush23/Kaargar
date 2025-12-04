import { API_BASE_URL } from "../config";
import { supabase } from "./supabaseClient";

// Helper to get token reliably
async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

export async function postLoginUpsert() {
  const token = await getToken();
  if (!token) {
    console.warn("postLoginUpsert: no access token available");
    return null;
  }

  const url = `${API_BASE_URL}/api/auth/upsert_user`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}), 
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`upsert_user failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Syncs profile details (like Name) to the Postgres public.users table
 */
export async function updateUserProfile(profileData) {
  const token = await getToken();
  if (!token) return;

  const url = `${API_BASE_URL}/api/me/profile`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profileData),
  });

  if (!res.ok) {
    throw new Error("Profile sync failed");
  }
  return res.json();
}