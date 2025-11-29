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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Briefcase,
  User,
  Settings,
  LogOut,
  CreditCard,
  History,
  ShieldCheck,
  Hammer,
  Home as HomeIcon,
  User2,
  HardHat,
  Edit,
  AlertCircle,
  Wifi,      // Icon for online
  WifiOff,   // Icon for offline
  PlusCircle // Icon for Post Job
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "sonner";
import { API_BASE_URL } from "../config";

const Sidebar = ({ open, onOpenChange, user }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  
  // Notification Counts
  const [counts, setCounts] = useState({ requests: 0, active: 0 });

  const close = () => onOpenChange(false);

  // 1. Fetch User Profile & Job Counts
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const token = session.access_token;

        // A. Get Profile
        const resProfile = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (resProfile.ok) {
          const data = await resProfile.json();
          setProfile(data.user);

          // B. If Worker, Get Job Counts
          if (data.user.role === 'worker' || data.user.role === 'agency') {
             const resJobs = await fetch(`${API_BASE_URL}/api/me/jobs/worked`, {
                headers: { Authorization: `Bearer ${token}` }
             });
             if (resJobs.ok) {
                const jobData = await resJobs.json();
                const allJobs = jobData.jobs || [];
                setCounts({
                   requests: allJobs.filter(j => j.status === 'pending_acceptance').length,
                   active: allJobs.filter(j => ['assigned', 'in_progress'].includes(j.status)).length
                });
             }
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      fetchData();
    }
  }, [open]);

  // Helper for initials
  const getInitials = () => {
    const name = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (name) return name.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return "U";
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
    close();
  };

  const handleOffline = async () => {
    if (!profile?.worker_profile) return;
    setToggling(true);

    const currentStatus = profile.worker_profile.is_online;
    const newStatus = !currentStatus;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${API_BASE_URL}/api/me/worker`, {
         method: "PATCH",
         headers: {
           "Content-Type": "application/json",
           Authorization: `Bearer ${session.access_token}`
         },
         body: JSON.stringify({ is_online: newStatus })
      });

      if (res.ok) {
         setProfile(prev => ({
           ...prev,
           worker_profile: { ...prev.worker_profile, is_online: newStatus }
         }));
         toast.success(newStatus ? "You are now ONLINE" : "You are now OFFLINE");
      } else {
         toast.error("Failed to update status");
      }
    } catch (e) {
       toast.error("Network error");
    } finally {
       setToggling(false);
    }
  };

  const calculateCompletion = () => {
    if (!profile) return 0;
    const fields = ['full_name', 'phone', 'gender', 'dob', 'address_text', 'city', 'state', 'pincode'];
    const filledCount = fields.reduce((acc, field) => acc + (profile[field] ? 1 : 0), 0);
    return Math.round((filledCount / fields.length) * 100);
  };

  const completionPercentage = calculateCompletion();
  const isWorker = profile?.role === 'worker' || profile?.role === 'agency';
  const roleLabel = isWorker ? "Worker Account" : "Customer Account";
  const isOnline = profile?.worker_profile?.is_online;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[300px] sm:w-[350px] border-l border-border overflow-y-auto bg-background/95 backdrop-blur-xl flex flex-col h-full">

        {/* --- HEADER --- */}
        <SheetHeader className="text-left mb-2">
          <div className="flex items-center gap-4 mb-4">
            <Avatar className="h-14 w-14 border-2 border-primary/20">
              <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <SheetTitle className="text-base font-bold leading-none">
                {profile?.full_name || user?.user_metadata?.full_name || "User"}
              </SheetTitle>
              <SheetDescription className="text-xs truncate w-40">
                {user?.email}
              </SheetDescription>
              <div className={`inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none border-transparent ${isWorker ? "bg-amber-100 text-amber-800" : "bg-secondary text-secondary-foreground"}`}>
                {loading ? "Loading..." : roleLabel}
              </div>
            </div>
          </div>

          {!loading && (
            <div className="space-y-2 mt-2">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>Profile Completion</span>
                <span>{completionPercentage}%</span>
              </div>
              <Progress value={completionPercentage} className="h-2" />
              {completionPercentage < 100 && (
                <div className="pt-1">
                  <NavItem 
                    to="/register" 
                    icon={<AlertCircle className="w-4 h-4 text-orange-500" />} 
                    label={<span className="text-orange-600 font-medium">Complete Profile</span>}
                    onClick={close} 
                  />
                </div>
              )}
            </div>
          )}
        </SheetHeader>

        <Separator className="my-4" />

        {/* --- NAVIGATION --- */}
        <div className="flex flex-col gap-1 flex-1">
          <div className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Menu</div>
          <NavItem to="/home" icon={<HomeIcon className="w-4 h-4" />} label="Home" onClick={close} />
          <NavItem to="/profile" icon={<User2 className="w-4 h-4" />} label="Profile" onClick={close} />

          {!isWorker && !loading && (
             <Link 
             to="/register_worker" 
             onClick={close}
             className="flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors group"
           >
             <div className="flex items-center gap-3">
               <HardHat className="w-4 h-4 text-orange-500" />
               <span>Become a Worker</span>
             </div>
             <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700 hover:bg-orange-200">Start</Badge>
           </Link>
          )}

          <Separator className="my-3" />
          
          <div className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
             {isWorker ? "Worker Dashboard" : "Hiring Dashboard"}
          </div>

          {!isWorker ? (
            // Customer Links
            <>
              <NavItem to="/post_job" icon={<PlusCircle className="w-4 h-4" />} label="Post a Job" onClick={close} />
              <NavItem to="/my_postings" icon={<Briefcase className="w-4 h-4" />} label="My Job Postings" onClick={close} />
            </>
          ) : (
            // Worker Links
            <>
              <NavItem to="/dashboard" icon={<Hammer className="w-4 h-4" />} label="Dashboard" onClick={close} />
              
              <NavItem 
                to="/dashboard" // Directs to dashboard but user will see the 'Active' tab usually
                icon={<Briefcase className="w-4 h-4" />} 
                label="Active Jobs" 
                badge={counts.active}
                badgeColor="bg-blue-600"
                onClick={close} 
              />
              
              <NavItem 
                to="/dashboard" 
                icon={<AlertCircle className="w-4 h-4" />} 
                label="Requests" 
                badge={counts.requests}
                badgeColor="bg-amber-500 text-black"
                onClick={close} 
              />
              
              <NavItem to="/wallet" icon={<CreditCard className="w-4 h-4" />} label="My Wallet" onClick={close} />
              <NavItem to="/kyc" icon={<ShieldCheck className="w-4 h-4" />} label="Identity Verification" onClick={close} />
            </>
          )}

          <Separator className="my-3" />

          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none">
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 ml-4" side="right" align="start">
              <div className="space-y-1">
                <h4 className="font-medium leading-none mb-2 px-2 text-sm text-muted-foreground">Account Settings</h4>
                <Link to="/register" onClick={close} className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded-sm hover:bg-accent cursor-pointer">
                  <Edit className="w-4 h-4" /> Update Profile
                </Link>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* --- FOOTER --- */}
        <SheetFooter className="mt-auto space-y-3 flex flex-col sm:flex-col sm:space-x-0">
          {isWorker && (
            <Button
              variant={isOnline ? "destructive" : "default"}
              className={`w-full justify-start ${!isOnline && "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
              onClick={handleOffline}
              disabled={toggling}
            >
              {isOnline ? <WifiOff className="mr-2 h-4 w-4" /> : <Wifi className="mr-2 h-4 w-4" />}
              {toggling ? "Updating..." : (isOnline ? "GO OFFLINE" : "GO ONLINE")}
            </Button>
          )}

          <Button 
            variant="outline" 
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  );
};

// Updated NavItem to support Badges
const NavItem = ({ to, icon, label, onClick, badge, badgeColor }) => (
  <Link 
    to={to} 
    onClick={onClick}
    className="flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
  >
    <div className="flex items-center gap-3">
        {icon}
        {label}
    </div>
    {badge > 0 && (
        <Badge className={`text-[10px] h-5 px-1.5 ${badgeColor || "bg-primary"}`}>
            {badge}
        </Badge>
    )}
  </Link>
);

export default Sidebar;