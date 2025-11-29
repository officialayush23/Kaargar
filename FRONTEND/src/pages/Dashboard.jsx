import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import {
    Loader2, TrendingUp, CheckCircle2, Clock,
    IndianRupee, BarChart3, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import Headback from "../components/Headback";
import { Separator } from "@/components/ui/separator";

export default function Dashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [actionLoading, setActionLoading] = useState(null);

    const loadDashboardData = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { navigate("/login"); return; }
            const token = session.access_token;

            const statsRes = await fetch("http://localhost:8000/api/me/stats", { headers: { Authorization: `Bearer ${token}` } });
            if (statsRes.ok) setStats(await statsRes.json());

            const jobsRes = await fetch("http://localhost:8000/api/me/jobs/worked", { headers: { Authorization: `Bearer ${token}` } });
            if (jobsRes.ok) {
                const data = await jobsRes.json();
                setJobs(data.jobs || []);
            }
        } catch (err) {
            toast.error("Failed to load dashboard");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboardData();
    }, []);

    const chartData = useMemo(() => {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const data = months.map(m => ({ name: m, total: 0 }));
        jobs.forEach(job => {
            if (job.status === 'completed' || job.status === 'released') {
                const date = new Date(job.created_at);
                data[date.getMonth()].total += (job.amount_cents || 0) / 100;
            }
        });
        return data;
    }, [jobs]);

    const handleJobAction = async (jobId, action) => {
        // For accepting requests, you might need a specific endpoint or just update status
        // Assuming status update:
        // This part depends on how your API handles 'accept'. If via /api/jobs/book response or update.
        // Since 'book' initiates, workers might just need to update status.
        // IF you don't have a specific accept endpoint, you might need to add one.
        // However, for now, let's assume basic status update if available, or toast for MVP.
        toast.info("Accept/Decline logic requires specific endpoint implementation.");
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);

    const requests = jobs.filter(j => j.status === 'pending_acceptance');
    const activeJobs = jobs.filter(j => ['assigned', 'in_progress'].includes(j.status));
    const history = jobs.filter(j => ['completed', 'cancelled'].includes(j.status));

    if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 relative font-sans selection:bg-blue-500/30">
            <Headback />

            <div className="relative z-10 px-4 sm:px-6 py-8 max-w-7xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Worker Dashboard</h1>
                        <p className="text-slate-400 text-sm">Manage your earnings and active jobs.</p>
                    </div>
                    <Button onClick={() => loadDashboardData()} variant="outline" className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white gap-2">
                        <Clock className="w-4 h-4" /> Refresh Data
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-4 lg:col-span-1">
                        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Earnings</CardTitle>
                                <div className="p-2 bg-emerald-500/10 rounded-lg">
                                    <IndianRupee className="h-4 w-4 text-emerald-500" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">{formatCurrency((stats?.total_earned_cents || 0) / 100)}</div>
                                <div className="flex items-center gap-1 text-emerald-400 text-xs mt-1">
                                    <TrendingUp className="w-3 h-3" /> +12% from last month
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-2 gap-4">
                            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                                <CardHeader className="pb-2 p-4">
                                    <CardTitle className="text-xs font-medium text-slate-400 uppercase">Completed</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                    <div className="text-2xl font-bold text-blue-400">{stats?.jobs_completed_count || 0}</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                                <CardHeader className="pb-2 p-4">
                                    <CardTitle className="text-xs font-medium text-slate-400 uppercase">Pending</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                    <div className="text-2xl font-bold text-amber-500">{requests.length}</div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <Card className="lg:col-span-2 bg-white/5 border-white/10 backdrop-blur-md flex flex-col">
                        <CardHeader>
                            <CardTitle className="text-lg text-white flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-blue-500" /> Monthly Revenue
                            </CardTitle>
                            <CardDescription className="text-slate-400">Your income trends for the current year</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-[200px]">
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#f8fafc' }} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                                        <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Separator className="bg-white/10" />

                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-white">Job Management</h2>
                    <Tabs defaultValue="requests" className="w-full">
                        <TabsList className="bg-white/5 border border-white/10 w-full justify-start h-12 p-1 mb-6 rounded-xl">
                            <TabsTrigger value="requests" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 h-full px-6 rounded-lg flex-1 sm:flex-none">
                                Requests {requests.length > 0 && <Badge className="ml-2 bg-amber-500 text-black h-5 px-1.5">{requests.length}</Badge>}
                            </TabsTrigger>
                            <TabsTrigger value="active" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white h-full px-6 rounded-lg flex-1 sm:flex-none">
                                Active ({activeJobs.length})
                            </TabsTrigger>
                            <TabsTrigger value="history" className="data-[state=active]:bg-white/10 data-[state=active]:text-white h-full px-6 rounded-lg flex-1 sm:flex-none">
                                History
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="requests" className="space-y-4">
                            {requests.length === 0 ? (
                                <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10">
                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Clock className="w-6 h-6 text-slate-500" />
                                    </div>
                                    <p className="text-slate-400">No pending job requests.</p>
                                </div>
                            ) : (
                                requests.map(job => (
                                    <Card key={job.id} className="bg-amber-500/5 border-amber-500/20 overflow-hidden transition-all hover:border-amber-500/40">
                                        <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <Badge className="bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20">New Request</Badge>
                                                    <span className="text-sm text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(job.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <h3 className="text-xl font-bold text-white">{job.title}</h3>
                                                <p className="text-slate-300 text-sm">Customer: <span className="text-white font-medium">{job.customer_name}</span></p>
                                                <div className="inline-flex items-center gap-2 bg-white/5 px-3 py-1 rounded-md border border-white/10 mt-2">
                                                    <IndianRupee className="w-3 h-3 text-emerald-400" />
                                                    <span className="text-emerald-400 font-mono font-bold">{formatCurrency((job.amount_cents || 0) / 100)}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 w-full md:w-auto">
                                                <Button
                                                    onClick={() => navigate(`/status/${job.id}`)}
                                                    className="flex-1 md:w-32 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-900/20"
                                                >
                                                    View & Act
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </TabsContent>

                        <TabsContent value="active" className="space-y-4">
                            {activeJobs.length === 0 ? (
                                <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10 text-slate-500">No active jobs.</div>
                            ) : (
                                activeJobs.map(job => (
                                    <Card key={job.id} className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-all cursor-pointer group">
                                        <CardContent className="p-6 flex justify-between items-center">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{job.title}</h3>
                                                    <Badge variant="outline" className="border-blue-500/30 text-blue-400 uppercase text-[10px] h-5">{job.status.replace('_', ' ')}</Badge>
                                                </div>
                                                <p className="text-sm text-slate-400">Customer: <span className="text-slate-200">{job.customer_name}</span></p>
                                            </div>
                                            {/* FIXED: Point to Status Page */}
                                            <Button onClick={() => navigate(`/status/${job.id}`)} variant="secondary" className="bg-white/5 hover:bg-white/10 text-white border border-white/10 gap-2">
                                                Manage Job <ArrowUpRight className="w-4 h-4" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </TabsContent>

                        <TabsContent value="history" className="space-y-3">
                            {history.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 italic">No job history yet.</div>
                            ) : (
                                history.map(job => (
                                    <div key={job.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-full ${job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {job.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-slate-200">{job.title}</h4>
                                                <p className="text-xs text-slate-500">{new Date(job.created_at).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <span className={`text-sm font-bold font-mono ${job.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {job.status === 'completed' ? `+${formatCurrency((job.amount_cents || 0) / 100)}` : 'Cancelled'}
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