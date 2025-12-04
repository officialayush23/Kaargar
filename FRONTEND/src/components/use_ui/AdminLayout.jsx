import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from "react-router-dom";
import { supabase } from '@/lib/supabaseClient';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import ModeToggle from "@/components/use_ui/ModeToggle";
import {
  LayoutDashboard,
  Users,
  FileCheck,
  ShieldAlert,
  Briefcase,
  LogOut,
} from "lucide-react";
import AdminLogin from "../../pages/AdminLogin";

export default function AdminLayout() {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- AUTH CHECK ---
  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();
        
      if (user?.role === 'admin') {
        setIsAdmin(true);
      }
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#00111a] flex items-center justify-center text-white">
        <div className="animate-pulse">Verifying Admin Privileges...</div>
      </div>
    );
  }
  
  if (!isAdmin) return <AdminLogin onLoginSuccess={() => setIsAdmin(true)} />;

  const menuItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
    { label: "Users", icon: Users, path: "/admin/users" },
    { label: "KYC Requests", icon: FileCheck, path: "/admin/kyc" },
    { label: "Complaints", icon: ShieldAlert, path: "/admin/complaints" },
    { label: "Jobs", icon: Briefcase, path: "/admin/jobs" },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen bg-[#00111a] text-white overflow-hidden">
        {/* SHADCN SIDEBAR */}
        <Sidebar collapsible="icon" variant="floating" className="bg-[#001c2b] border-r border-white/10 shadow-xl">
          <SidebarHeader className="p-4">
            <h1 className="text-xl font-bold tracking-wide text-cyan-400">KAARGAR ADMIN</h1>
          </SidebarHeader>

          <SidebarContent className="px-2">
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <Link to={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      className={`rounded-lg h-11 transition-all ${
                        location.pathname === item.path
                          ? "bg-cyan-600 text-white shadow-md hover:bg-cyan-700"
                          : "text-gray-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4">
            <Button
              variant="outline"
              onClick={async () => { await supabase.auth.signOut(); setIsAdmin(false); }}
              className="w-full h-10 flex justify-between bg-transparent border-white/20 text-white hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
            >
              <span>Logout</span>
              <LogOut className="w-4 h-4" />
            </Button>
          </SidebarFooter>
        </Sidebar>

        {/* MAIN CONTENT AREA */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="h-16 flex items-center justify-between px-6 bg-[#002637] border-b border-white/10 shadow-lg">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-white hover:bg-white/10" />
              <h2 className="text-xl font-semibold tracking-wide text-white">Admin Panel</h2>
            </div>
            <div className="flex items-center gap-3">
              <ModeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-[#00111a] to-[#001e33]">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
