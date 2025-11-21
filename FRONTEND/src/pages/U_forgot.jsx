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
import { resetPasswordForEmail } from "../auth/AuthHandler";
import { toast } from "sonner";

const U_forgot = () => {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

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
      navigate("/login");
    } catch (err) {
      console.error("reset err", err);
      toast.error("Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full sm:min-w-sm max-w-sm">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>Enter your email to receive a password reset link.</CardDescription>
          <CardAction>
            <Button variant="link" onClick={() => navigate("/login")}>Login</Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleForgotPassword}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </form>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <Button type="button" className="w-full" onClick={handleForgotPassword} disabled={busy}>
            {busy ? "Working..." : "Send Reset Link"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default U_forgot;
