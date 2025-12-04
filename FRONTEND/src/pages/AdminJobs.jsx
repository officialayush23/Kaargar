import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { API_BASE_URL } from "@/config";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_BASE_URL}/api/admin/jobs`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const json = await res.json();
        
        if (json.ok) {
            setJobs(json.data);
        } else {
            toast.error("Failed to fetch jobs");
        }
    } catch (e) {
        console.error(e);
        toast.error("Network error");
    } finally {
        setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  };

  const getStatusColor = (status) => {
      const map = {
          'open': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          'bidding': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          'in_progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          'completed': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          'cancelled': 'bg-red-500/10 text-red-400 border-red-500/20'
      };
      return map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-white tracking-tight">Job Management</h2>
      <Card className="bg-[#001c2b] border-white/10 shadow-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#00111a]">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-gray-400">Title</TableHead>
                <TableHead className="text-gray-400">Customer</TableHead>
                <TableHead className="text-gray-400">Budget</TableHead>
                <TableHead className="text-right text-gray-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                 <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="h-24 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500"/>
                    </TableCell>
                 </TableRow>
              ) : jobs.map(j => (
                <TableRow key={j.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-medium text-white">
                    {j.title}
                    <div className="text-[10px] text-gray-500">{new Date(j.created_at).toLocaleDateString()}</div>
                  </TableCell>
                  <TableCell className="text-gray-300">
                    {j.customer_name}
                    <div className="text-[10px] text-gray-500">{j.customer_email}</div>
                  </TableCell>
                  <TableCell className="text-emerald-400 font-mono">{formatCurrency(j.budget_max_cents)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className={`capitalize border ${getStatusColor(j.status)}`}>
                      {j.status.replace('_', ' ')}
                    </Badge>
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