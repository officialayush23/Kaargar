import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress"; 
import { Switch } from "@/components/ui/switch"; 
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  User,
  Settings,
  LogOut,
  CreditCard,
  ShieldCheck,
  Hammer,
  Home as HomeIcon,
  User2,
  HardHat,
  Edit,
  AlertCircle,
  Wifi,
  WifiOff,
  PlusCircle,
  Zap
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";

const Sidebar = ({ open, onOpenChange, user }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  // Notification Counts
  // activeWorker: Jobs assigned/in-progress for a worker
  // requestsWorker: Job requests waiting for worker approval
  // activeCustomer: Jobs posted by customer that are live (open, bidding, in_progress)
  const [counts, setCounts] = useState({ requestsWorker: 0, activeWorker: 0, activeCustomer: 0 });

  const close = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const token = session.access_token;

        // 1. Get Profile
        const resProfile = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (resProfile.ok) {
          const apiData = await resProfile.json();
          const userData = apiData.data.user; 
          const workerData = apiData.data.worker_profile;
          
          setProfile({ ...userData, worker_profile: workerData });

          // 2a. If Worker, Get Worker Job Counts
          if (userData.role === 'worker' || userData.role === 'agency') {
             // Only fetch if verified to avoid 403, though backend might allow listing empty if not strict on this specific endpoint
             // Assuming we want to show counts if they exist
             if (workerData?.kyc_status === 'verified') {
                 const resJobs = await fetch(`${API_BASE_URL}/api/me/jobs/worked`, {
                    headers: { Authorization: `Bearer ${token}` }
                 });
                 if (resJobs.ok) {
                    const jobData = await resJobs.json();
                    // Backend uses 'data' key for worked jobs
                    const allJobs = jobData.data || []; 
                    setCounts(prev => ({
                       ...prev,
                       requestsWorker: allJobs.filter(j => j.status === 'requested').length,
                       activeWorker: allJobs.filter(j => ['assigned', 'in_progress', 'pending_acceptance'].includes(j.status)).length
                    }));
                 }
             }
          } 
          
          // 2b. If Customer (or checking customer side of things), Get Posted Job Counts
          // Even workers can post jobs, so we might want to fetch this for everyone or just customers
          // For now, fetching if role is customer OR simply fetching for everyone to show "My Postings" badge
          const resPosted = await fetch(`${API_BASE_URL}/api/me/jobs/posted`, {
              headers: { Authorization: `Bearer ${token}` }
          });
          if (resPosted.ok) {
              const postedData = await resPosted.json();
              // Backend uses 'jobs' key for posted jobs
              const myJobs = postedData.jobs || [];
              const activeCount = myJobs.filter(j => ['open', 'bidding', 'assigned', 'in_progress', 'pending_acceptance'].includes(j.status)).length;
              setCounts(prev => ({
                  ...prev,
                  activeCustomer: activeCount
              }));
          }
        }
      } catch (error) {
        console.error("Error fetching sidebar data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [open]);

  const getInitials = () => {
    const name = profile?.full_name || user?.user_metadata?.full_name || user?.email;
    return name ? name.charAt(0).toUpperCase() : "U";
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
    close();
  };

  const handleWorkerUpdate = async (updates) => {
    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/me/worker`, {
         method: "PATCH",
         headers: {
           "Content-Type": "application/json",
           Authorization: `Bearer ${session.access_token}`
         },
         body: JSON.stringify(updates)
      });

      if (res.ok) {
         setProfile(prev => ({
           ...prev,
           worker_profile: { ...prev.worker_profile, ...updates }
         }));
         toast.success("Settings updated");
      } else {
         toast.error("Update failed");
      }
    } catch (e) {
       toast.error("Connection error");
    } finally {
       setUpdating(false);
    }
  };

  const completionPercentage = profile ? (() => {
    const fields = ['full_name', 'phone', 'gender', 'dob', 'address_text', 'city', 'state', 'pincode'];
    const filledCount = fields.reduce((acc, field) => acc + (profile[field] ? 1 : 0), 0);
    return Math.round((filledCount / fields.length) * 100);
  })() : 0;

  const isWorker = profile?.role === 'worker' || profile?.role === 'agency';
  const isOnline = profile?.worker_profile?.is_online || false;
  const acceptsDirect = profile?.worker_profile?.accepts_direct_hire || false;
  const kycStatus = profile?.worker_profile?.kyc_status || 'none';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[300px] sm:w-[350px] border-l border-white/10 bg-slate-950 text-white flex flex-col h-full p-0">
        
        {/* HEADER (Fixed) */}
        <div className="p-6 pb-2">
          {loading ? (
             <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-full bg-white/10" />
                <div className="space-y-2">
                   <Skeleton className="h-4 w-32 bg-white/10" />
                   <Skeleton className="h-3 w-24 bg-white/10" />
                </div>
             </div>
          ) : (
            <div className="flex items-center gap-4 mb-4">
                <Avatar className="h-14 w-14 border-2 border-white/10">
                <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-slate-800 text-blue-400 font-bold">{getInitials()}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                <SheetTitle className="text-base font-bold leading-none text-white">
                    {profile?.full_name || user?.email?.split('@')[0]}
                </SheetTitle>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-400 truncate w-40">{user?.email}</span>
                    {isWorker && (
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`border-0 text-[10px] ${kycStatus === 'verified' ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                                {kycStatus === 'verified' ? "Verified Worker" : "Verification Pending"}
                            </Badge>
                        </div>
                    )}
                </div>
                </div>
            </div>
          )}

          {!loading && (
            <div className="space-y-2 mt-2">
              <div className="flex justify-between text-xs font-medium text-slate-400">
                <span>Profile Completion</span>
                <span>{completionPercentage}%</span>
              </div>
              <Progress value={completionPercentage} className="h-1.5 bg-slate-800" indicatorClassName="bg-blue-500" />
            </div>
          )}
        </div>

        <Separator className="bg-white/10 mx-6" />

        {/* MENU (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          <div className="px-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Menu</div>
          <NavItem to="/home" icon={<HomeIcon className="w-4 h-4" />} label="Home" onClick={close} />
          <NavItem to="/profile" icon={<User2 className="w-4 h-4" />} label="Profile" onClick={close} />

          {!isWorker && !loading && (
             <Link to="/register_worker" onClick={close} className="flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">
               <div className="flex items-center gap-3"><HardHat className="w-4 h-4 text-orange-500" /><span>Become a Worker</span></div>
               <Badge className="bg-orange-500/20 text-orange-400 text-[10px]">Start</Badge>
             </Link>
          )}

          <Separator className="my-3 bg-white/10" />
          <div className="px-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
              {isWorker ? "Worker Dashboard" : "Hiring Dashboard"}
          </div>

          {!isWorker ? (
            <>
              <NavItem to="/post_job" icon={<PlusCircle className="w-4 h-4" />} label="Post a Job" onClick={close} />
              <NavItem 
                to="/my_postings" 
                icon={<Briefcase className="w-4 h-4" />} 
                label="My Job Postings" 
                badge={counts.activeCustomer} 
                badgeColor="bg-blue-600"
                onClick={close} 
              />
            </>
          ) : (
            <>
              <NavItem to="/dashboard" icon={<Hammer className="w-4 h-4" />} label="Dashboard" onClick={close} />
              <NavItem 
                to="/dashboard" 
                icon={<Briefcase className="w-4 h-4" />} 
                label="Active Jobs" 
                badge={counts.activeWorker} 
                badgeColor="bg-blue-600" 
                onClick={close} 
              />
              <NavItem 
                to="/dashboard" 
                icon={<AlertCircle className="w-4 h-4" />} 
                label="Requests" 
                badge={counts.requestsWorker} 
                badgeColor="bg-amber-500 text-black" 
                onClick={close} 
              />
              <NavItem to="/wallet" icon={<CreditCard className="w-4 h-4" />} label="My Wallet" onClick={close} />
              <NavItem to="/kyc" icon={<ShieldCheck className="w-4 h-4" />} label="Verification" onClick={close} />
            </>
          )}

          <Separator className="my-3 bg-white/10" />

          {/* Settings Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors text-left">
                <Settings className="w-4 h-4" /> Settings
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 ml-4 bg-slate-900 border-white/10 text-white" side="right" align="start">
              <div className="space-y-3 p-1">
                <h4 className="font-medium text-xs uppercase text-slate-500 mb-2">Account</h4>
                <Link to="/register" onClick={close} className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded hover:bg-white/5">
                  <Edit className="w-4 h-4 text-blue-400" /> Update Profile
                </Link>
                {isWorker && (
                    <div className="flex items-center justify-between px-2 py-2 rounded hover:bg-white/5">
                        <div className="flex items-center gap-2 text-sm">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            <span>Direct Hires</span>
                        </div>
                        <Switch 
                            checked={acceptsDirect}
                            onCheckedChange={(checked) => handleWorkerUpdate({ accepts_direct_hire: checked })}
                        />
                    </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* FOOTER (Fixed) */}
        <SheetFooter className="p-6 pt-2 border-t border-white/10 flex flex-col gap-3">
          {isWorker && (
            <Button
              variant={isOnline ? "destructive" : "default"}
              className={`w-full justify-start ${!isOnline && "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
              onClick={() => handleWorkerUpdate({ is_online: !isOnline })}
              disabled={updating}
            >
              {isOnline ? <WifiOff className="mr-2 h-4 w-4" /> : <Wifi className="mr-2 h-4 w-4" />}
              {updating ? "Updating..." : (isOnline ? "Go Offline" : "Go Online")}
            </Button>
          )}
          <Button variant="outline" className="w-full justify-start border-white/10 text-slate-400 hover:text-white hover:bg-white/5" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const NavItem = ({ to, icon, label, onClick, badge, badgeColor }) => (
  <Link to={to} onClick={onClick} className="flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
    <div className="flex items-center gap-3">{icon} {label}</div>
    {badge > 0 && <Badge className={`text-[10px] h-5 px-1.5 ${badgeColor || "bg-blue-600"}`}>{badge}</Badge>}
  </Link>
);

export default Sidebar;