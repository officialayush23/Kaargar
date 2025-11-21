import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        // supabase-js v2 provides getSessionFromUrl
        const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
        if (error) {
          toast.error("Auth callback error: " + error.message);
          return navigate("/login");
        }
        const session = data?.session;
        const accessToken = session?.access_token;
        if (!accessToken) {
          toast.error("No access token found");
          return navigate("/login");
        }

        // Send access token to backend to upsert user into public.users
        const res = await fetch("/api/auth/upsert_user", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ source: "oauth" }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("upsert failed", err);
          toast.error("Login failed (server)");
        } else {
          toast.success("Login successful");
        }
        navigate("/home");
      } catch (err) {
        console.error("callback err", err);
        toast.error("Auth callback failed");
        navigate("/login");
      }
    })();
  }, [navigate]);

  return <div className="p-8">Completing login...</div>;
};

export default AuthCallback;
