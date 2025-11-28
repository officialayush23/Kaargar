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
import { Badge } from "@/components/ui/badge"; // Imported Badge
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"; // Imported Popover
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
  HardHat, // Icon for worker
  Edit
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const Sidebar = ({ open, onOpenChange, user }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const close = () => onOpenChange(false);

  // 1. Fetch User Profile from Backend API
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch("http://localhost:8000/api/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setProfile(data.user);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      fetchProfile();
    }
  }, [open]);

  // Helper for initials
  const getInitials = () => {
    if (!user) return "U";
    const name = user.user_metadata?.full_name || user.user_metadata?.name;
    if (name) return name.charAt(0).toUpperCase();
    if (user.email) return user.email.charAt(0).toUpperCase();
    return "U";
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
    close();
  };

  // Determine Role for UI
  const isWorker = profile?.role === 'worker' || profile?.role === 'agency';
  const roleLabel = isWorker ? "Worker Account" : "Customer Account";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[300px] sm:w-[350px] border-l border-border overflow-y-auto bg-background/95 backdrop-blur-xl">

        {/* --- HEADER --- */}
        <SheetHeader className="text-left mb-6">
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
              {/* Active Role Badge from DB */}
              <div className={`inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none border-transparent ${isWorker ? "bg-amber-100 text-amber-800" : "bg-secondary text-secondary-foreground"}`}>
                {loading ? "Loading..." : roleLabel}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Separator className="my-3" />

        {/* --- NAVIGATION --- */}
        <div className="flex flex-col gap-1">

          <div className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            Menu
          </div>

          <NavItem to="/home" icon={<HomeIcon className="w-4 h-4" />} label="Home" onClick={close} />
          <NavItem to="/profile" icon={<User2 className="w-4 h-4" />} label="Profile" onClick={close} />

          {/* START AS WORKER (Only for Customers) */}
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
              <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700 hover:bg-orange-200">
                Start
              </Badge>
            </Link>
          )}

          <Separator className="my-2" />

          {/* DYNAMIC DASHBOARD LINKS BASED ON DB ROLE */}
          <div className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            {isWorker ? "Worker Dashboard" : "Hiring Dashboard"}
          </div>

          {!isWorker ? (
            // Customer Links
            <>
              <NavItem to="/my-postings" icon={<Briefcase className="w-4 h-4" />} label="My Job Postings" onClick={close} />
              <NavItem to="/hires" icon={<History className="w-4 h-4" />} label="History & Invoices" onClick={close} />
              <NavItem to="/favorites" icon={<User className="w-4 h-4" />} label="Favorite Workers" onClick={close} />
            </>
          ) : (
            // Worker Links
            <>
              <NavItem to="/find-jobs" icon={<Hammer className="w-4 h-4" />} label="Browse Jobs" onClick={close} />
              <NavItem to="/applications" icon={<Briefcase className="w-4 h-4" />} label="My Applications" onClick={close} />
              <NavItem to="/wallet" icon={<CreditCard className="w-4 h-4" />} label="My Wallet" onClick={close} />
              <NavItem to="/kyc" icon={<ShieldCheck className="w-4 h-4" />} label="Identity Verification" onClick={close} />
            </>
          )}

          <Separator className="my-1" />

          {/* SETTINGS POPOVER */}
          <NavItem
            to="/settings"
            icon={<Settings className="w-4 h-4" />}
            label="Settings"
            onClick={close}
          />



        </div>


        {/* --- FOOTER --- */}
        <SheetFooter className=" bottom-8 left-6 right-6">
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

const NavItem = ({ to, icon, label, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
  >
    {icon}
    {label}
  </Link>
);

export default Sidebar;
