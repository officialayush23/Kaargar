import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from "@/config";
import { Lock, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AdminLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 1. Authenticate
      const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw authError;
      if (!session) throw new Error("No user found.");

      // 2. Verify Admin Role via Backend
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (!res.ok) throw new Error("Failed to verify user profile.");
      
      const json = await res.json();
      const role = json.data?.user?.role;
      
      if (role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error("Access Denied: Administrator privileges required.");
      }

      onLoginSuccess();
    } catch (err) {
      setError(err.message);
      if (err.message.includes("Access Denied")) {
          await supabase.auth.signOut();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#000d14] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-600/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]"></div>

      <Card className="w-full max-w-md bg-[#001c2b] border-white/10 relative z-10 shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-cyan-500/10 p-3 rounded-full w-fit mb-2 ring-1 ring-cyan-500/20">
            <Lock className="w-8 h-8 text-cyan-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Admin Access</CardTitle>
          <CardDescription className="text-gray-400">Enter your credentials to access the Kaargar dashboard</CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-900/20 border-red-900/50 text-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">Email Address</Label>
              <Input 
                id="email"
                type="email" 
                placeholder="admin@kaargar.com" 
                className="bg-[#00111a] border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-cyan-500"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">Password</Label>
              <Input 
                id="password"
                type="password" 
                placeholder="••••••••" 
                className="bg-[#00111a] border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-cyan-500"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold h-11"
              disabled={loading}
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Authenticating...</> : "Login"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-xs text-gray-500">Authorized Personnel Only</p>
        </CardFooter>
      </Card>
    </div>
  );
}