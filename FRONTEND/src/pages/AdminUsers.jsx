import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { API_BASE_URL } from "@/config";
import { Search, Shield, CheckCircle, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => fetchUsers(), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const params = new URLSearchParams();
        if (search) params.append("search", search);

        const res = await fetch(`${API_BASE_URL}/api/admin/users?${params.toString()}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });

        const json = await res.json();
        if (json.ok) setUsers(json.data);
        else toast.error("Failed to fetch users");
    } catch (err) {
        console.error(err);
        toast.error("Network error");
    } finally {
        setLoading(false);
    }
  };

  const toggleFlag = async (user) => {
    setProcessing(user.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/flag`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
            is_flagged: !user.is_flagged,
            reason: !user.is_flagged ? "Manual Admin Flag" : "Unflagged by Admin"
        })
      });

      if (res.ok) {
          toast.success(`User ${!user.is_flagged ? "Flagged" : "Unflagged"} successfully`);
          // Optimistic update
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_flagged: !u.is_flagged } : u));
      } else {
          const err = await res.json();
          toast.error(err.detail || "Action failed");
      }
    } catch (err) {
        toast.error("Error updating user status");
    } finally {
        setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <h2 className="text-3xl font-bold text-white tracking-tight">Users Management</h2>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
          <Input 
            placeholder="Search by name or email..." 
            className="pl-10 bg-[#001c2b] border-white/10 text-white focus-visible:ring-cyan-500" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
      </div>

      <Card className="bg-[#001c2b] border-white/10 shadow-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#00111a]">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-gray-400 font-medium">User Details</TableHead>
                <TableHead className="text-gray-400 font-medium">Role</TableHead>
                <TableHead className="text-gray-400 font-medium">Status</TableHead>
                <TableHead className="text-right text-gray-400 font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                 <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500"/>
                    </TableCell>
                 </TableRow>
              ) : users.length === 0 ? (
                 <TableRow className="hover:bg-transparent"><TableCell colSpan={4} className="text-center py-8 text-gray-500">No users found.</TableCell></TableRow>
              ) : users.map(u => (
                <TableRow key={u.id} className="border-white/5 hover:bg-white/5">
                  <TableCell>
                    <div className="font-medium text-white">{u.full_name || "N/A"}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`capitalize ${
                      u.role === 'worker' 
                        ? 'border-purple-500/30 text-purple-400 bg-purple-500/10' 
                        : u.role === 'admin' 
                        ? 'border-red-500/30 text-red-400 bg-red-500/10'
                        : 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                    }`}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_flagged ? (
                      <Badge variant="destructive" className="bg-red-900/50 text-red-300 hover:bg-red-900/50 flex w-fit items-center gap-1 border-red-900">
                        <Shield className="w-3 h-3" /> Flagged
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-900/50 text-emerald-300 hover:bg-emerald-900/50 flex w-fit items-center gap-1 border border-emerald-900">
                        <CheckCircle className="w-3 h-3" /> Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => toggleFlag(u)} 
                      disabled={processing === u.id}
                      className={u.is_flagged ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10" : "text-red-400 hover:text-red-300 hover:bg-red-400/10"}
                    >
                      {processing === u.id ? <Loader2 className="w-4 h-4 animate-spin"/> : (u.is_flagged ? "Unban" : "Ban")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}