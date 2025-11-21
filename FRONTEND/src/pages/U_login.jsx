// src/pages/U_login.jsx
import React, { useState } from "react";
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { signInWithEmail, resetPasswordForEmail, signInWithProvider } from "../auth/AuthHandler";
import { postLoginUpsert } from "../lib/authSync";
import { toast } from "sonner";

const U_login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSignIn(e) {
    e?.preventDefault?.();
    if (!email || !password) return toast("Enter email and password");
    setBusy(true);
    try {
      const { data, error } = await signInWithEmail(email, password);
      if (error) {
        toast.error(error.message || "Login failed");
        return;
      }

      // Supabase returns data.session in many setups - attempt to upsert user in backend
      try {
        await postLoginUpsert();
      } catch (upErr) {
        console.error("upsert_user failed:", upErr);
        toast.error("Login succeeded but backend sync failed");
        // continue anyway for UX
      }

      navigate("/");
    } catch (err) {
      console.error("signin err", err);
      toast.error("Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e) {
    e?.preventDefault?.();
    if (!email) return toast("Enter your email first.");
    setBusy(true);
    try {
      const { data, error } = await resetPasswordForEmail(email, `${window.location.origin}/reset-password-callback`);
      if (error) {
        toast.error(error.message || "Could not send reset email");
        return;
      }
      toast.success("Password reset link sent to your email.");
    } catch (err) {
      console.error("reset err", err);
      toast.error("Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin(e) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      const { error } = await signInWithProvider("google", `${window.location.origin}/auth/callback`);
      if (error) {
        toast.error(error.message || "Google sign-in failed");
        setBusy(false);
      }
      // redirect will happen
    } catch (err) {
      console.error("google err", err);
      toast.error("Google login failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full sm:min-w-sm max-w-sm">
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>Enter your email below to login to your account</CardDescription>
          <CardAction><Button variant="link" onClick={() => navigate("/signup")}>Sign Up</Button></CardAction>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSignIn}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <button onClick={handleForgotPassword} type="button" className="ml-auto text-sm underline">
                    Forgot your password?
                  </button>
                </div>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          </form>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <Button type="button" className="w-full" onClick={handleSignIn} disabled={busy}>
            {busy ? "Working..." : "Login"}
          </Button>

          <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={busy}>
            Login with Google
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default U_login;
