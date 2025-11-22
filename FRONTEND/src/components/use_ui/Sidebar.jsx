import React from "react";
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
import { 
  Briefcase, 
  User, 
  Settings, 
  LogOut, 
  CreditCard, 
  History, 
  MessageSquare, 
  ShieldCheck,
  Hammer,
  Home as HomeIcon
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const Sidebar = ({ open, onOpenChange, user, mode, setMode }) => {
  const navigate = useNavigate();
  
  const close = () => onOpenChange(false);

  // Helper for initials (Consistent with Home)
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[300px] sm:w-[350px] border-l border-border bg-background/95 backdrop-blur-xl">
        
        {/* --- HEADER --- */}
        <SheetHeader className="text-left mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Avatar className="h-14 w-14 border-2 border-primary/20">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
                {getInitials()} 
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <SheetTitle className="text-base font-bold leading-none">{user?.user_metadata?.full_name || "User"}</SheetTitle>
              <SheetDescription className="text-xs truncate w-40">
                {user?.email}
              </SheetDescription>
              {/* Active Role Badge */}
              <div className="inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                 {mode === "hire" ? "Customer Account" : "Worker Account"}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        {/* --- NAVIGATION --- */}
        <div className="flex flex-col gap-1">
          
          <div className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            Menu
          </div>

          <NavItem to="/home" icon={<HomeIcon className="w-4 h-4" />} label="Home" onClick={close} />
          <NavItem to="/chats" icon={<MessageSquare className="w-4 h-4" />} label="Messages" onClick={close} />

          <Separator className="my-3" />
          
          {/* DYNAMIC SECTION */}
          <div className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
             {mode === "hire" ? "Hiring Dashboard" : "Worker Dashboard"}
          </div>

          {mode === "hire" ? (
            <>
              <NavItem to="/my-postings" icon={<Briefcase className="w-4 h-4" />} label="My Job Postings" onClick={close} />
              <NavItem to="/hires" icon={<History className="w-4 h-4" />} label="History & Invoices" onClick={close} />
              <NavItem to="/favorites" icon={<User className="w-4 h-4" />} label="Favorite Workers" onClick={close} />
            </>
          ) : (
            <>
              <NavItem to="/find-jobs" icon={<Hammer className="w-4 h-4" />} label="Browse Jobs" onClick={close} />
              <NavItem to="/applications" icon={<Briefcase className="w-4 h-4" />} label="My Applications" onClick={close} />
              <NavItem to="/wallet" icon={<CreditCard className="w-4 h-4" />} label="My Wallet" onClick={close} />
              <NavItem to="/kyc" icon={<ShieldCheck className="w-4 h-4" />} label="Identity Verification" onClick={close} />
            </>
          )}

          <Separator className="my-3" />

          <NavItem to="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" onClick={close} />
        </div>

        {/* --- FOOTER --- */}
        <SheetFooter className="absolute bottom-6 left-6 right-6">
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