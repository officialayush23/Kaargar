// src/pages/U_signup.jsx
import React, { useState } from "react";
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { signUpWithEmail, signInWithProvider } from "../auth/AuthHandler";
import { postLoginUpsert } from "../lib/authSync";
import { toast } from "sonner";

const U_signup = () => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSignUp(e) {
    e?.preventDefault?.();
    if (!email || !password || !name) return toast("Name, email and password are required");
    setBusy(true);
    try {
      const { data, error } = await signUpWithEmail(email, password, name);
      if (error) {
        toast.error(error.message || "Signup failed");
        return;
      }

      // If Supabase returned a session (depends on settings), sync to backend
      try {
        await postLoginUpsert();
      } catch (upErr) {
        console.error("upsert_user after signup failed:", upErr);
        // still continue; user may confirm email first
      }

      toast.success("Sign-up successful. Check your email if confirmation is required.");
      navigate("/login");
    } catch (err) {
      console.error("signup err", err);
      toast.error("Signup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignUp(e) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      const { error } = await signInWithProvider("google", `${window.location.origin}/auth/callback`);
      if (error) {
        toast.error(error.message || "Google sign-in failed");
        setBusy(false);
      }
    } catch (err) {
      console.error("google err", err);
      toast.error("Google signup failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-4">
      <Card className="w-full sm:min-w-sm max-w-sm">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Enter your email below to create your account</CardDescription>
          <CardAction><Button variant="link" onClick={() => navigate("/login")}>Login</Button></CardAction>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" type="text" placeholder="Your Name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          </form>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <Button type="button" className="w-full" onClick={handleSignUp} disabled={busy}>
            {busy ? "Working..." : "Sign Up"}
          </Button>

          <Button variant="outline" className="w-full" onClick={handleGoogleSignUp} disabled={busy}>
            Signup with Google
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default U_signup;
