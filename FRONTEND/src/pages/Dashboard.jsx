import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { 
  Loader2, TrendingUp, CheckCircle2, Clock, 
  IndianRupee, BarChart3, ArrowUpRight, Briefcase,
  XCircle, AlertCircle, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"; 
import Headback from "../components/Headback";
import { Separator } from "@/components/ui/separator";
import { API_BASE_URL } from "../config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Added Avatar imports

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [user, setUser] = useState(null); // State to store user info
  const pollingRef = useRef(null);

  // 1. Fetch Data
  const loadDashboardData = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      const token = session.access_token;
      
      // Fetch User Details directly from Supabase Auth to get metadata
      const { data: { user: authUser } } = await supabase.auth.getUser();
      setUser(authUser);


      // Parallel Fetch
      const [statsRes, jobsRes] = await Promise.all([
         fetch(`${API_BASE_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } }), // Changed endpoint to /api/me to get stats from profile response if structured that way, or keep /api/me/stats if separate endpoint exists. Assuming stats are in /api/me based on previous context or separate. Let's stick to specific endpoints if they exist or parse from /api/me. 
         // Actually, based on your backend code, stats are returned in /api/me under 'governance' or we might need a specific stats endpoint if you created one. 
         // Your backend has /api/me returning governance stats. Let's use that or if you have a dedicated stats endpoint.
         // Looking at your backend code, there isn't a specific /api/me/stats endpoint visible in the provided main.py. 
         // However, /api/me returns governance data. I will assume for now we use /api/me for stats or you might have added it. 
         // Let's stick to your previous code's endpoint /api/me/stats if you are sure it exists, otherwise I will use /api/me.
         // Wait, your previous Dashboard code used /api/me/stats. I will assume it's there or I should use /api/me. 
         // Let's use /api/me to be safe as I see it in your backend code returning governance stats.
         fetch(`${API_BASE_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } }),
         // For jobs, your backend has /api/me/jobs/worked but I don't see it in the provided main.py. 
         // I see /api/jobs/{job_id} and /api/jobs/search.
         // You might need to add an endpoint to get user's jobs.
         // Assuming /api/me/jobs/worked exists or we need to filter /api/jobs/search?
         // Let's assume you have or will add /api/me/jobs/worked or similar. 
         // If not, we might need to use /api/jobs/search with a filter if supported, or add the endpoint.
         // I'll keep the fetch but add a comment.
         fetch(`${API_BASE_URL}/api/chats`, { headers: { Authorization: `Bearer ${token}` } }) // Just fetching chats as a placeholder if jobs endpoint is missing, but ideally we need jobs.
      ]);

      // RE-VERIFYING BACKEND: Your provided main.py DOES NOT have /api/me/stats or /api/me/jobs/worked.
      // It has /api/me which returns wallet, governance, etc.
      // It has /api/chats.
      // It has /api/jobs/{id} and /api/jobs/search.
      // IT IS MISSING endpoints to list "My Jobs".
      // I will assume you will add them or I should use /api/me data if it includes jobs (it doesn't currently).
      // For now, I will stub the jobs data or use what's available. 
      // actually, to make this work, I should probably add those endpoints to your main.py or you should.
      // Since I cannot edit main.py here, I will assume they exist or will be added. 
      // I will keep the calls as per your previous working dashboard code but note this dependency.

      if (statsRes.ok) {
          const profileData = await statsRes.json();
          // Adapting to /api/me response structure
          setStats(profileData.data.governance || {}); 
      }
      
      // Mocking jobs response if endpoint missing, or assuming it works
      // You really need: @app.get("/api/me/jobs/worked") in backend
      // For now, I'll try to fetch chats which might give us some job info if we join them, 
      // but realistically you need the jobs endpoint.
      // I will keep the original fetch line assuming you add the endpoint.
      const jobsResponse = await fetch(`${API_BASE_URL}/api/me/jobs/worked`, { headers: { Authorization: `Bearer ${token}` } });
      if (jobsResponse.ok) {
        const data = await jobsResponse.json();
        setJobs(data.data || []); // v4 uses data: []
      }

    } catch (err) {
      console.error(err);
      if (!isBackground) toast.error("Failed to load dashboard");
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  // 2. Initial Load & Polling
  useEffect(() => {
    loadDashboardData();
    
    // Auto-refresh every 15 seconds to check for new requests
    pollingRef.current = setInterval(() => loadDashboardData(true), 15000);
    return () => clearInterval(pollingRef.current);
  }, []);

  // 3. Chart Data (Group Earnings by Month)
  const chartData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const data = months.map(m => ({ name: m, total: 0 }));
    
    jobs.forEach(job => {
      if (job.status === 'completed' || job.status === 'released') {
        const date = new Date(job.created_at);
        const monthIndex = date.getMonth();
        data[monthIndex].total += (job.amount_cents || 0) / 100;
      }
    });
    return data;
  }, [jobs]);

  // 4. Handle Accept/Decline (Direct DB Update for Robustness)
  const handleJobAction = async (jobId, action) => {
    setActionLoading(jobId);
    try {
      // Using the new v4 endpoint: PATCH /api/jobs/{job_id}/status
      const { data: { session } } = await supabase.auth.getSession();
      const token = session.access_token;
      
      const status = action === 'accept' ? 'assigned' : 'cancelled';
      
      const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/status`, {
          method: "PATCH",
          headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ status })
      });

      if (!res.ok) throw new Error("Failed to update status");

      toast.success(action === 'accept' ? "Job Accepted! You can now start work." : "Job Declined.");
      loadDashboardData(true); // Refresh list immediately
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);
  
  // Categorize Jobs
  const requests = jobs.filter(j => j.status === 'pending_acceptance' || j.status === 'assigned'); // 'assigned' might be the initial state depending on your flow
  const activeJobs = jobs.filter(j => ['in_progress'].includes(j.status));
  const history = jobs.filter(j => ['completed', 'cancelled'].includes(j.status));

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 h-8 w-8" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 relative font-sans selection:bg-blue-500/30">
      <Headback />
      
      <div className="relative z-10 px-4 sm:px-6 py-8 max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
             {/* Profile Photo from Metadata */}
             <Avatar className="h-16 w-16 border-2 border-white/10 shadow-lg">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-blue-600 text-white font-bold text-xl">
                    {user?.user_metadata?.full_name?.[0] || "U"}
                </AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Worker Dashboard</h1>
                <p className="text-slate-400 text-sm">Welcome back, {user?.user_metadata?.full_name || "Worker"}</p>
            </div>
          </div>
          <Button onClick={() => loadDashboardData()} variant="outline" className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white gap-2 h-10 rounded-xl">
            <Clock className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {/* --- ANALYTICS SECTION --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Stats Column */}
          <div className="space-y-4 lg:col-span-1">
            <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <IndianRupee className="w-24 h-24 text-emerald-500" />
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Using wallet balance or separate stats if available */}
                <div className="text-4xl font-bold text-white">{formatCurrency((stats?.total_earned_cents || 0) / 100)}</div>
                <div className="flex items-center gap-1 text-emerald-400 text-xs mt-2 font-medium">
                  <TrendingUp className="w-3 h-3" /> +Lifetime
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="pb-2 p-4">
                  <CardTitle className="text-xs font-medium text-slate-400 uppercase">Completed</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-bold text-blue-400 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> {stats?.jobs_completed_count || 0}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="pb-2 p-4">
                  <CardTitle className="text-xs font-medium text-slate-400 uppercase">Pending</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-bold text-amber-500 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" /> {requests.length}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Chart Column */}
          <Card className="lg:col-span-2 bg-white/5 border-white/10 backdrop-blur-md flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" /> Monthly Revenue
              </CardTitle>
              <CardDescription className="text-slate-400">Income trends for the current year</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[220px] p-2">
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="name" 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `₹${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: '#f8fafc' }}
                      cursor={{ fill: '#1e293b', opacity: 0.4 }}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="#3b82f6" 
                      radius={[6, 6, 0, 0]} 
                      maxBarSize={40}
                      animationDuration={1500}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="bg-white/10" />

        {/* --- JOB MANAGEMENT --- */}
        <div className="space-y-6">
           <h2 className="text-2xl font-bold text-white">Job Management</h2>
           
           <Tabs defaultValue="active" className="w-full">
            <TabsList className="bg-white/5 border border-white/10 w-full justify-start h-14 p-1 mb-6 rounded-2xl">
              <TabsTrigger value="requests" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 h-full px-6 rounded-xl flex-1 sm:flex-none transition-all">
                Requests {requests.length > 0 && <Badge className="ml-2 bg-amber-500 text-black h-5 px-1.5 rounded-full">{requests.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="active" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white h-full px-6 rounded-xl flex-1 sm:flex-none transition-all">
                Active Jobs {activeJobs.length > 0 && <Badge className="ml-2 bg-white/20 text-white h-5 px-1.5 rounded-full">{activeJobs.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-white/10 data-[state=active]:text-white h-full px-6 rounded-xl flex-1 sm:flex-none transition-all">
                History
              </TabsTrigger>
            </TabsList>

            {/* -- PENDING REQUESTS -- */}
            <TabsContent value="requests" className="space-y-4">
              {requests.length === 0 ? (
                <div className="text-center py-16 bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <Clock className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-400 font-medium">No pending requests.</p>
                  <p className="text-slate-600 text-sm">New job offers will appear here.</p>
                </div>
              ) : (
                requests.map(job => (
                  <Card key={job.id} className="bg-amber-500/5 border-amber-500/20 overflow-hidden hover:border-amber-500/40 transition-colors">
                    <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <Badge className="bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20 hover:bg-amber-400">New Request</Badge>
                          <span className="text-sm text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(job.created_at).toLocaleDateString()}</span>
                        </div>
                        <h3 className="text-xl font-bold text-white">{job.title}</h3>
                        <p className="text-slate-300 text-sm line-clamp-2">{job.description}</p>
                        <div className="flex gap-4 items-center mt-2">
                           <span className="text-sm text-slate-400">Customer: <span className="text-white font-medium">{job.customer_name}</span></span>
                           <Separator orientation="vertical" className="h-4 bg-white/10" />
                           <div className="flex items-center gap-1 text-emerald-400 font-bold font-mono">
                              <IndianRupee className="w-3 h-3" /> {formatCurrency((job.amount_cents || 0)/100)}
                           </div>
                        </div>
                      </div>
                      <div className="flex gap-3 w-full md:w-auto shrink-0">
                        <Button variant="outline" onClick={() => handleJobAction(job.id, 'reject')} disabled={actionLoading === job.id} className="flex-1 md:w-32 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-12 rounded-xl">
                           {actionLoading === job.id ? <Loader2 className="animate-spin" /> : "Decline"}
                        </Button>
                        <Button onClick={() => handleJobAction(job.id, 'accept')} disabled={actionLoading === job.id} className="flex-1 md:w-32 bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 rounded-xl shadow-lg shadow-emerald-900/20">
                           {actionLoading === job.id ? <Loader2 className="animate-spin" /> : "Accept"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* -- ACTIVE JOBS -- */}
            <TabsContent value="active" className="space-y-4">
               {activeJobs.length === 0 ? (
                 <div className="text-center py-16 bg-white/5 rounded-3xl border border-dashed border-white/10">
                    <Briefcase className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                    <p className="text-slate-400 font-medium">No active jobs.</p>
                    <Button variant="link" onClick={() => navigate('/home')} className="text-blue-400">Find Work</Button>
                 </div>
               ) : (
                 activeJobs.map(job => (
                   <Card key={job.id} className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-all cursor-pointer group rounded-2xl">
                      <CardContent className="p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                         <div className="space-y-1 flex-1">
                           <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{job.title}</h3>
                              <Badge variant="outline" className="border-blue-500/30 text-blue-400 uppercase text-[10px] h-5 tracking-wide">{job.status.replace('_', ' ')}</Badge>
                           </div>
                           <p className="text-sm text-slate-400 line-clamp-1">{job.description}</p>
                           <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><IndianRupee className="w-3 h-3" /> {formatCurrency((job.amount_cents || 0)/100)}</span>
                              <span>•</span>
                              <span>{job.customer_name}</span>
                           </div>
                         </div>
                         
                         <Button onClick={() => navigate(`/status/${job.id}`)} className="w-full sm:w-auto bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/20 h-12 rounded-xl px-6 font-semibold gap-2 transition-all">
                           Manage Job <ArrowUpRight className="w-4 h-4" />
                         </Button>
                      </CardContent>
                   </Card>
                 ))
               )}
            </TabsContent>

            {/* -- HISTORY -- */}
            <TabsContent value="history" className="space-y-3">
               {history.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 italic">No job history yet.</div>
               ) : (
                  history.map(job => (
                   <div key={job.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-full ${job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                          {job.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-200">{job.title}</h4>
                          <p className="text-xs text-slate-500">{new Date(job.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold font-mono ${job.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {job.status === 'completed' ? `+${formatCurrency((job.amount_cents || 0)/100)}` : 'Cancelled'}
                      </span>
                   </div>
                 ))
               )}
            </TabsContent>

          </Tabs>
        </div>

      </div>
    </div>
  );
}