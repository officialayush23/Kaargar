import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { API_BASE_URL } from "@/config";
import { Users, FileCheck, ShieldAlert, Briefcase, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ 
    totalUsers: 0, 
    pendingKYC: 0, 
    activeComplaints: 0, 
    activeJobs: 0 
  });
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${API_BASE_URL}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        setStats(data.stats);
        setRecentUsers(data.recentUsers);
        setRecentJobs(data.recentJobs);
      } else {
        toast.error("Failed to fetch dashboard data");
      }
    } catch (e) {
      console.error("Error fetching dashboard data:", e);
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    if (!cents) return "₹0";
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(cents / 100);
  };

  const StatCard = ({ title, value, icon: Icon, colorClass }) => (
    <Card className="bg-[#001c2b] border-white/10 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
        <p className="text-xs text-gray-500 mt-1 flex items-center">
          <Activity className="w-3 h-3 mr-1" /> Updated just now
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight">Dashboard</h2>
        <p className="text-gray-400 mt-2">Overview of platform activity.</p>
      </div>

      {/* STATS GRID */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Users" value={stats.totalUsers} icon={Users} colorClass="text-blue-400" />
        <StatCard title="Pending KYC" value={stats.pendingKYC} icon={FileCheck} colorClass="text-yellow-400" />
        <StatCard title="Complaints" value={stats.activeComplaints} icon={ShieldAlert} colorClass="text-red-400" />
        <StatCard title="Active Jobs" value={stats.activeJobs} icon={Briefcase} colorClass="text-emerald-400" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        
        {/* RECENT USERS */}
        <Card className="bg-[#001c2b] border-white/10 shadow-lg">
          <CardHeader>
            <CardTitle className="text-white">Recent Registrations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-[#00111a]">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Role</TableHead>
                  <TableHead className="text-right text-gray-400">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="hover:bg-transparent"><TableCell colSpan={3} className="text-center py-4 text-gray-500">Loading...</TableCell></TableRow>
                ) : recentUsers.map((user) => (
                  <TableRow key={user.id} className="border-white/5 hover:bg-white/5">
                    <TableCell>
                      <div className="font-medium text-white">{user.full_name || "N/A"}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize border-white/10 ${
                        user.role === 'worker' ? 'text-purple-400 bg-purple-500/10' : 
                        user.role === 'admin' ? 'text-red-400 bg-red-500/10' :
                        'text-blue-400 bg-blue-500/10'
                      }`}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-gray-400 text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* RECENT JOBS */}
        <Card className="bg-[#001c2b] border-white/10 shadow-lg">
          <CardHeader>
            <CardTitle className="text-white">Recent Job Postings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-[#00111a]">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-gray-400">Title</TableHead>
                  <TableHead className="text-gray-400">Budget</TableHead>
                  <TableHead className="text-right text-gray-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="hover:bg-transparent"><TableCell colSpan={3} className="text-center py-4 text-gray-500">Loading...</TableCell></TableRow>
                ) : recentJobs.map((job) => (
                  <TableRow key={job.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-medium text-white">
                      {job.title}
                    </TableCell>
                    <TableCell className="text-emerald-400 font-mono">
                      {formatCurrency(job.budget_max_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={`uppercase text-[10px] ${
                        job.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'
                      }`}>
                        {job.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}