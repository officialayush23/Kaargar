// src/pages/U_login.jsx
import React, { useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useNavigate } from "react-router-dom";
import {
  signInWithEmail,
  signUpWithEmail,
  sendResetPassword,
  signInWithProvider,
} from "../auth/AuthHandler"; // adjust path if your AuthHandler is elsewhere

const W_login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSignIn(e) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      const { data, error } = await signInWithEmail(email, password);
      if (error) {
        alert(error.message || "Login failed");
        return;
      }
      // Signed in
      // Optionally notify backend here with access token if you use cookie flow
      navigate("/");
    } catch (err) {
      console.error("signin err", err);
      alert("Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      const { data, error } = await signUpWithEmail(email, password);
      if (error) {
        alert(error.message || "Signup failed");
        return;
      }
      alert("Sign-up successful. Check your email if confirmation is required.");
    } catch (err) {
      console.error("signup err", err);
      alert("Signup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e) {
    e?.preventDefault?.();
    if (!email) return alert("Enter your email first.");
    setBusy(true);
    try {
      const { data, error } = await sendResetPassword(email, `${window.location.origin}/reset-password-callback`);
      if (error) {
        alert(error.message || "Could not send reset email");
        return;
      }
      alert("Password reset link sent to your email.");
    } catch (err) {
      console.error("reset err", err);
      alert("Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin(e) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      // this will redirect to provider; no data returned here
      const { error } = await signInWithProvider("google", `${window.location.origin}/auth/callback`);
      if (error) {
        alert(error.message || "Google sign-in failed");
        setBusy(false);
      }
      // if provider redirects, current page will unload; nothing more to do
    } catch (err) {
      console.error("google err", err);
      alert("Google login failed");
      setBusy(false);
    }
  }

  return (


    <Card className="w-full sm:min-w-sm max-w-sm">
      <CardHeader>
        <CardTitle>Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
        <CardAction>
          <Button variant="link" onClick={handleSignUp}>
            Sign Up
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignIn}>
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <a
                  href="#"
                  onClick={handleForgotPassword}
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button type="submit" className="w-full" onClick={handleSignIn} disabled={busy}>
          {busy ? "Working..." : "Login"}
        </Button>
        <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={busy}>
          Login with Google
        </Button>
      </CardFooter>
    </Card>
   
  );
};

export default W_login;
