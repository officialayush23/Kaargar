import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { 
  Loader2, 
  Edit, 
  MapPin, 
  Phone, 
  Calendar, 
  User as UserIcon, 
  Briefcase, 
  CheckCircle2, 
  AlertCircle,
  HardHat,
  ArrowLeft,
  LayoutDashboard,
  Clock,
  ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // 1. Fetch Profile
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/login");
          return;
        }
        const token = session.access_token;

        // Fetch User
        const userRes = await fetch("http://localhost:8000/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userData = await userRes.json();
        
        if (userRes.ok) {
          setProfile(userData.user);
          
          // Fetch Jobs based on role
          const isWorker = userData.user.role === 'worker' || userData.user.role === 'agency';
          const jobsEndpoint = isWorker ? "/api/me/jobs/worked" : "/api/me/jobs/posted";
          
          const jobsRes = await fetch(`http://localhost:8000${jobsEndpoint}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (jobsRes.ok) {
            const jobsData = await jobsRes.json();
            setJobs(jobsData.jobs || []);
          }

          // Fetch Stats (for revenue/spending)
          const statsRes = await fetch("http://localhost:8000/api/me/stats", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (statsRes.ok) {
            setStats(await statsRes.json());
          }
        }
      } catch (error) {
        console.error("Error loading profile data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  // 2. Profile Completion Logic
  const calculateCompletion = () => {
    if (!profile) return 0;
    const fields = ['full_name', 'phone', 'gender', 'dob', 'address_text', 'city', 'state', 'pincode'];
    const filledCount = fields.reduce((acc, field) => acc + (profile[field] ? 1 : 0), 0);
    return Math.round((filledCount / fields.length) * 100);
  };

  // 3. Format Currency
  const formatCurrency = (cents) => {
    if (!cents) return "₹0";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(cents / 100);
  };

  const getInitials = (name) => name ? name.charAt(0).toUpperCase() : "U";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!profile) return null;

  const completionPercentage = calculateCompletion();
  const isWorker = profile.role === 'worker' || profile.role === 'agency';
  const workerData = profile.worker_profile;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 pb-12 relative overflow-hidden">
      
      {/* --- BACKGROUND BLOBS (Glassmorphism Effect) --- */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* --- TOP NAVIGATION --- */}
      <div className="relative z-20 px-6 py-6 flex justify-between items-center max-w-7xl mx-auto">
        <Link to="/home" className="flex items-center gap-2 group">
          <div className="bg-blue-600 p-1.5 rounded-lg group-hover:bg-blue-500 transition-colors">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">KAARGAR</span>
        </Link>
        <Button 
          variant="ghost" 
          onClick={() => navigate("/home")} 
          className="text-slate-400 hover:text-white hover:bg-white/10 gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Button>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10 space-y-8">
        
        {/* --- HERO SECTION --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT: IDENTITY CARD */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-0 bg-white/5 backdrop-blur-xl border-white/10 shadow-2xl overflow-hidden">
              <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-blue-900/50 to-transparent pointer-events-none" />
              
              <CardContent className="pt-10 pb-8 flex flex-col items-center text-center relative">
                <div className="relative mb-4 group">
                  <Avatar className="h-32 w-32 border-4 border-slate-900/50 shadow-2xl ring-2 ring-white/10 group-hover:ring-blue-500/50 transition-all duration-300">
                    <AvatarImage src={profile.avatar_url} className="object-cover" />
                    <AvatarFallback className="text-4xl bg-slate-800 text-blue-400 font-bold">
                      {getInitials(profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  {isWorker && (
                    <div 
                      className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-slate-900 ${workerData?.is_online ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-slate-500'}`} 
                      title={workerData?.is_online ? "Online" : "Offline"} 
                    />
                  )}
                </div>

                <h2 className="text-2xl font-bold text-white mb-1">{profile.full_name || "User"}</h2>
                <p className="text-slate-400 text-sm mb-4">{profile.email}</p>
                
                <Badge variant="outline" className={`px-4 py-1 uppercase text-xs tracking-wider border-white/10 ${isWorker ? "bg-blue-500/10 text-blue-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                  {profile.role === 'agency' ? 'Agency Account' : profile.role === 'worker' ? 'Worker Account' : 'Customer Account'}
                </Badge>

                {/* Profile Completion */}
                <div className="w-full mt-8 space-y-3 bg-white/5 p-4 rounded-xl border border-white/5">
                  <div className="flex justify-between text-xs font-medium text-slate-300">
                    <span>Profile Strength</span>
                    <span className={completionPercentage === 100 ? "text-emerald-400" : "text-amber-400"}>{completionPercentage}%</span>
                  </div>
                  <Progress value={completionPercentage} className="h-2 bg-slate-800" indicatorClassName={completionPercentage === 100 ? "bg-emerald-500" : "bg-amber-500"} />
                  
                  {completionPercentage < 100 && (
                    <Button 
                      size="sm" 
                      variant="link" 
                      onClick={() => navigate("/register")} 
                      className="text-amber-400 h-auto p-0 text-xs hover:text-amber-300 flex items-center gap-1 mx-auto"
                    >
                      <AlertCircle className="w-3 h-3" /> Complete Now
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => navigate("/register")} variant="outline" className="bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white h-12">
                <Edit className="w-4 h-4 mr-2" /> Edit Info
              </Button>
              {isWorker && (
                <Button onClick={() => navigate("/register_worker")} className="bg-blue-600 hover:bg-blue-500 text-white h-12 border-0">
                  <HardHat className="w-4 h-4 mr-2" /> Settings
                </Button>
              )}
            </div>
          </div>

          {/* RIGHT: DETAILS & ACTIVITY */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* WORKER STATS (Only if Worker) */}
            {isWorker && workerData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Rate</p>
                    <p className="text-xl font-bold text-white">{formatCurrency(workerData.min_hourly_rate_cents)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Experience</p>
                    <p className="text-xl font-bold text-white">{workerData.experience_years} <span className="text-sm font-normal text-slate-500">Yrs</span></p>
                  </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Earnings</p>
                    <p className="text-xl font-bold text-emerald-400">{formatCurrency(stats?.total_earned_cents || 0)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Jobs Done</p>
                    <p className="text-xl font-bold text-blue-400">{stats?.jobs_completed_count || 0}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* PERSONAL DETAILS CARD */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-blue-400" /> Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 uppercase">Phone</span>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Phone className="w-4 h-4 text-slate-500" />
                    {profile.phone || "N/A"}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 uppercase">Location</span>
                  <div className="flex items-center gap-2 text-slate-200">
                    <MapPin className="w-4 h-4 text-slate-500" />
                    {profile.city ? `${profile.city}, ${profile.state}` : "N/A"}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 uppercase">Date of Birth</span>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    {profile.dob ? new Date(profile.dob).toLocaleDateString() : "N/A"}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 uppercase">Gender</span>
                  <div className="flex items-center gap-2 text-slate-200 capitalize">
                    <UserIcon className="w-4 h-4 text-slate-500" />
                    {profile.gender || "N/A"}
                  </div>
                </div>
                
                {/* Full Address Block */}
                {profile.address_text && (
                  <div className="md:col-span-2 mt-2 p-3 rounded-lg bg-white/5 border border-white/5 text-sm text-slate-300">
                    <span className="text-xs text-slate-500 uppercase block mb-1">Full Address</span>
                    {profile.address_text} - {profile.pincode}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ACTIVITY FEED (Jobs Posted / Worked) */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-md flex-1">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-400" /> 
                  {isWorker ? "Recent Work History" : "Recent Job Postings"}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10">
                  See Full Report
                </Button>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {jobs.length > 0 ? (
                  jobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {job.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-200">{job.title}</h4>
                          <p className="text-xs text-slate-500">
                            {new Date(job.created_at).toLocaleDateString()} • {isWorker ? `Client: ${job.customer_name}` : `Worker: ${job.worker_name || 'Pending'}`}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`border-0 uppercase text-[10px] ${
                        job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 
                        job.status === 'open' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {job.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-500">
                    <LayoutDashboard className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No activity yet.</p>
                    <Button variant="link" onClick={() => navigate(isWorker ? "/find-jobs" : "/create-job")} className="text-blue-400">
                      {isWorker ? "Find your first job" : "Post a job now"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}