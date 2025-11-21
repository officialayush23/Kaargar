// src/lib/authSync.js
import { supabase } from "./supabaseClient";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || ""; // empty = same origin

export async function postLoginUpsert(opts = {}) {
  // opts optional: { accessToken } - if not provided, will fetch from supabase client
  let token = opts.accessToken;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token;
  }
  if (!token) {
    console.warn("postLoginUpsert: no access token available");
    return null;
  }

  const url = `${BACKEND_BASE}/api/auth/upsert_user`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts.body ?? { source: "client" }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`upsert_user failed: ${res.status} ${txt}`);
  }
  return res.json();
}
