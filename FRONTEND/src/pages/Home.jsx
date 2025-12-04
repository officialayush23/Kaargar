import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MapPin, Briefcase, Wrench, User,
  Star, Clock, Loader2, SlidersHorizontal, Hammer, Zap,
  ShieldAlert, IndianRupee, ChevronRight, ThumbsUp
} from "lucide-react";
import { API_BASE_URL } from "../config"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Carousel, CarouselContent, CarouselItem,
} from "@/components/ui/carousel";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import Sidebar from "../components/use_ui/Sidebar";
import Headback from "../components/Headback";
import ModeToggle from "../components/use_ui/ModeToggle";
import { supabase } from "../lib/supabaseClient";
import NotificationListener from "../components/use_ui/AuthenticatedLayout";

const CATEGORIES = [
  { id: "plumber", label: "Plumber", icon: <Wrench className="w-5 h-5" /> },
  { id: "mechanic", label: "Mechanic", icon: <Briefcase className="w-5 h-5" /> },
  { id: "maid", label: "Maid", icon: <User className="w-5 h-5" /> },
  { id: "electrician", label: "Electrician", icon: <Zap className="w-5 h-5" /> },
  { id: "driver", label: "Driver", icon: <MapPin className="w-5 h-5" /> },
  { id: "carpenter", label: "Carpenter", icon: <Hammer className="w-5 h-5" /> },
];

const OFFERS = [
  { id: 1, title: "20% OFF", desc: "First plumbing job", bg: "bg-gradient-to-br from-orange-500 to-red-600" },
  { id: 2, title: "Refer & Earn", desc: "Get ₹500/friend", bg: "bg-gradient-to-br from-purple-500 to-indigo-600" },
  { id: 3, title: "Verified", desc: "Safety assured", bg: "bg-gradient-to-br from-emerald-500 to-teal-600" },
];

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("hire"); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [coords, setCoords] = useState({ lat: 21.1458, lon: 79.0882 }); 
  const [locationName, setLocationName] = useState("Locating...");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  
  // Expanded Filters State
  const [filters, setFilters] = useState({ 
    sortBy: "recommended", 
    radius: [50], 
    gender: "all",
    minRate: "",
    maxRate: ""
  });
  
  // Modals
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [showKycPrompt, setShowKycPrompt] = useState(false); 
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [hireForm, setHireForm] = useState({ title: "", description: "", budget: "", service: "", address: "", city: "", pincode: "" });
  const [hiring, setHiring] = useState(false);
  
  // Worker Details & Reviews
  const [workerDetailsOpen, setWorkerDetailsOpen] = useState(false);
  const [workerReviews, setWorkerReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  
  // Bidding State
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [bidding, setBidding] = useState(false);

  // Filter out self from results
  const filteredResults = results.filter(item => {
    if (!user) return true;
    if (mode === 'hire') {
      // Prevent hiring yourself (item is a worker)
      return item.worker_id !== user.id;
    } else {
      // Prevent applying to your own job (item is a job)
      return item.customer_id !== user.id; 
    }
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      setUser(session.user);

      try {
        const res = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const apiData = await res.json();
          setProfile({
             ...apiData.data.user,
             worker_profile: apiData.data.worker_profile
          });
        }
      } catch (err) { console.error(err); } finally { setInitialLoading(false); }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          setCoords({ lat: latitude, lon: longitude });
          setLocationName("Current Location");
          await fetch(`${API_BASE_URL}/api/me/location`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ lat: latitude, lon: longitude })
          });
        }, () => setLocationName("Default Location"));
      }
    };
    init();
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Base params common to both
      const params = new URLSearchParams();
      params.append("lat", coords.lat);
      params.append("lon", coords.lon);
      params.append("radius_meters", filters.radius[0] * 1000);
      
      if (selectedCategory) params.append("profession", selectedCategory);

      let endpoint = "";
      
      if (mode === 'hire') {
        // Worker Search (Supports all filters)
        endpoint = "/api/search";
        params.append("order_by", filters.sortBy);
        if (searchQuery) params.append("service", searchQuery);
        if (filters.gender !== 'all') params.append("gender", filters.gender);
        if (filters.minRate) params.append("min_rate", parseInt(filters.minRate) * 100);
        if (filters.maxRate) params.append("max_rate", parseInt(filters.maxRate) * 100);
      } else {
        // Job Search (Restricted filters)
        endpoint = "/api/jobs/search";
        if (searchQuery) params.append("query", searchQuery);
        
        // Map minRate filter to min_budget for jobs
        if (filters.minRate) params.append("min_budget", parseInt(filters.minRate) * 100);
        
        params.append("only_open", "true");
        // Explicitly NOT sending order_by, max_rate, gender as they are not supported
      }

      const res = await fetch(`${API_BASE_URL}${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.data || []);
      }
    } catch (err) { toast.error("Failed to load data"); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!initialLoading) {
        const timer = setTimeout(fetchData, 500);
        return () => clearTimeout(timer);
    }
  }, [mode, searchQuery, selectedCategory, coords, filters, initialLoading]); 

  const fetchWorkerReviews = async (workerId) => {
    setReviewsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/ratings/${workerId}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        setWorkerReviews(data.reviews || []);
      }
    } finally { setReviewsLoading(false); }
  };

  useEffect(() => {
    if (hireModalOpen && profile) {
      setHireForm(prev => ({ ...prev, address: profile.address_text || "", city: profile.city || "", pincode: profile.pincode || "" }));
    }
  }, [hireModalOpen, profile]);

  const handleApplyFilters = async () => { await fetchData(); setFilterSheetOpen(false); };
  
  const handleModeSwitch = (newMode) => {
    if (newMode === 'work') {
      const isWorker = profile?.role === 'worker' || profile?.role === 'agency';
      const isVerified = profile?.worker_profile?.kyc_status === 'verified';

      if (!isWorker) {
        setShowRegisterPrompt(true);
        return;
      }
      if (!isVerified) {
        setShowKycPrompt(true);
        return;
      }
    }
    setMode(newMode); 
    setResults([]); 
    setSelectedCategory(null);
  };

  const handleDirectHire = async () => {
    if (!hireForm.title || !hireForm.budget) return toast.warning("Title and Budget required.");
    setHiring(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const workerProfession = selectedWorker.professions?.[0] || "General";
      const payload = {
        worker_id: selectedWorker.worker_id,
        job_details: {
          title: hireForm.title, description: hireForm.description, profession_required: workerProfession,
          services_required: hireForm.service ? hireForm.service.split(',').map(s => s.trim()) : [], 
          category: workerProfession, lat: coords.lat, lon: coords.lon, address_text: hireForm.address,
          city: hireForm.city, pincode: hireForm.pincode, budget_max_cents: parseInt(hireForm.budget) * 100, is_remote: false
        }
      };
      const res = await fetch(`${API_BASE_URL}/api/jobs/book`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.type === 'direct' ? "Booking Confirmed!" : "Request Sent!");
        setHireModalOpen(false); setWorkerDetailsOpen(false);
      } else { toast.error("Failed to book."); }
    } catch { toast.error("Error."); } finally { setHiring(false); }
  };

  const handleBidSubmit = async () => {
    if (!bidAmount) return toast.warning("Enter amount");
    setBidding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/jobs/${selectedJob.id}/bids`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ amount_cents: parseInt(bidAmount) * 100, message: bidMessage })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.auto_accepted ? "Bid Accepted! Assigned." : "Bid placed successfully!");
        setJobModalOpen(false);
        setBidAmount(""); setBidMessage("");
      } else { toast.error("Failed to bid"); }
    } finally { setBidding(false); }
  };

  const openWorkerDetails = (worker) => { setSelectedWorker(worker); fetchWorkerReviews(worker.worker_id); setWorkerDetailsOpen(true); };
  const getInitials = () => user?.user_metadata?.full_name ? user.user_metadata.full_name.charAt(0).toUpperCase() : "U";

  return (
    <div className="min-h-screen pb-0 relative flex flex-col overflow-x-hidden">
      <Headback /> 
      <NotificationListener />

      {/* --- PROMPTS --- */}
      <AnimatePresence>
        {showKycPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center space-y-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500" />
               <div className="w-16 h-16 bg-orange-600/20 text-orange-500 rounded-full flex items-center justify-center mx-auto ring-4 ring-orange-500/10"><ShieldAlert className="w-8 h-8" /></div>
               <div><h2 className="text-2xl font-bold text-white">Verification Pending</h2><p className="text-slate-400 text-sm mt-2">You must complete KYC verification before accepting jobs.</p></div>
               <div className="grid gap-3"><Button onClick={() => navigate("/register_worker")} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold h-12 rounded-xl">Complete KYC</Button><Button variant="ghost" onClick={() => setShowKycPrompt(false)} className="w-full text-slate-400 hover:text-white hover:bg-white/5 h-12 rounded-xl">Cancel</Button></div>
            </motion.div>
          </motion.div>
        )}
        {showRegisterPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center space-y-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
               <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mx-auto ring-4 ring-blue-500/10"><Briefcase className="w-8 h-8" /></div>
               <div><h2 className="text-2xl font-bold text-white">Worker Account Needed</h2><p className="text-slate-400 text-sm mt-2">Register as a worker to access the job feed.</p></div>
               <div className="grid gap-3"><Button onClick={() => navigate("/register_worker")} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 rounded-xl">Register Now</Button><Button variant="ghost" onClick={() => setShowRegisterPrompt(false)} className="w-full text-slate-400 hover:text-white hover:bg-white/5 h-12 rounded-xl">Cancel</Button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <header className={`sticky top-0 z-50 px-4 py-3 flex items-center justify-between transition-all duration-300 ${scrolled ? "bg-slate-950/80 backdrop-blur-md border-b border-white/5" : "bg-transparent"}`}>
        <div className="flex items-center gap-2"><span className="font-bold text-xl tracking-tight text-white drop-shadow-md">KAARGAR</span></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-sm">
            <button onClick={() => handleModeSwitch("hire")} className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${mode === "hire" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>Hire</button>
            <button onClick={() => handleModeSwitch("work")} className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${mode === "work" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>Work</button>
          </div>
        </div>
        <div className="flex items-center gap-3"><ModeToggle /><div onClick={() => setSidebarOpen(true)} className="cursor-pointer transition-transform hover:scale-105 active:scale-95"><Avatar className="w-9 h-9 border-2 border-white/10 shadow-sm"><AvatarImage src={user?.user_metadata?.avatar_url} /><AvatarFallback className="bg-slate-800 text-blue-400 font-bold text-xs">{getInitials()}</AvatarFallback></Avatar></div></div>
      </header>

      {/* HERO */}
      <div className="px-4 pt-8 pb-16 relative z-10 min-h-[35vh] flex flex-col justify-center mt-8">
        <div className="max-w-4xl mx-auto space-y-8 w-full">
          <div className="text-center space-y-2"><h1 className="text-3xl md:text-5xl font-bold text-white leading-tight drop-shadow-lg">{mode === "hire" ? "Expert Help, Instantly." : "Find Jobs, Earn Money."}</h1><p className="text-slate-300 text-sm md:text-base font-medium">{mode === "hire" ? "Verified professionals at your doorstep" : "Your skills, your schedule"}</p></div>
          <Carousel className="w-full max-w-3xl mx-auto"><CarouselContent className="-ml-4">{OFFERS.map((offer) => (<CarouselItem key={offer.id} className="pl-4 basis-[85%] sm:basis-1/2 md:basis-1/3"><div className={`h-28 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden ${offer.bg} border border-white/10 shadow-lg cursor-pointer transition-transform hover:scale-[1.02]`}><h3 className="text-white font-bold text-xl relative z-10">{offer.title}</h3><p className="text-white/90 text-xs font-medium relative z-10">{offer.desc}</p><div className="absolute right-[-20px] top-[-20px] w-24 h-24 bg-white/20 rounded-full blur-2xl" /></div></CarouselItem>))}</CarouselContent></Carousel>
        </div>
      </div>

      {/* SEARCH AREA */}
      <div className="flex-1 bg-slate-950 rounded-t-[2.5rem] shadow-[0_-10px_50px_-15px_rgba(0,0,0,0.7)] border-t border-white/10 relative z-20 pt-12 px-4 pb-24 min-h-[60vh] mt-8">
        <div className="max-w-2xl mx-auto -mt-20 mb-8 flex gap-3 items-center">
          <div className="flex-1 bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-2 flex items-center gap-2 h-14 ring-1 ring-white/5">
            <Search className="w-5 h-5 text-slate-400 ml-2" /><Input className="border-0 h-full bg-transparent focus-visible:ring-0 px-2 placeholder:text-slate-500 font-medium text-white text-base" placeholder={mode === "hire" ? "Search 'Plumber'..." : "Search 'Jobs'..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="pr-2 border-l border-white/10 pl-2 flex items-center gap-1 text-xs text-slate-400 font-medium whitespace-nowrap max-w-[100px] overflow-hidden text-ellipsis"><MapPin className="w-3 h-3" /> {locationName.split(',')[0]}</div>
          </div>
          
          {/* --- FILTER SHEET --- */}
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button size="icon" className="h-14 w-14 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl hover:bg-white/5 shrink-0 ring-1 ring-white/5"><SlidersHorizontal className="w-6 h-6 text-white" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-slate-950 border-white/10 text-white sm:max-w-md w-full flex flex-col h-full">
               <SheetHeader className="text-left mb-6"><SheetTitle className="text-white text-2xl">Filters</SheetTitle><SheetDescription className="text-slate-400">Refine your search results.</SheetDescription></SheetHeader>
               <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                 
                 <div className="space-y-6"><div className="flex justify-between items-center"><Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Radius</Label><span className="text-sm font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded">{filters.radius[0]} km</span></div><Slider value={filters.radius} max={50} step={1} onValueChange={(val) => setFilters({...filters, radius: val})} className="py-2"/></div>
                 
                 {mode === 'hire' ? (
                    <>
                        <div className="space-y-4"><Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Sort By</Label><Select value={filters.sortBy} onValueChange={(val) => setFilters({...filters, sortBy: val})}><SelectTrigger className="h-12 bg-white/5 border-white/10 text-white text-base"><SelectValue placeholder="Recommended" /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white"><SelectItem value="recommended">Recommended</SelectItem><SelectItem value="price_asc">Price: Low to High</SelectItem><SelectItem value="rating_desc">Rating: High to Low</SelectItem><SelectItem value="distance_asc">Distance: Nearest</SelectItem></SelectContent></Select></div>
                        <div className="space-y-4"><Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Hourly Rate (₹)</Label><div className="flex items-center gap-4"><div className="relative flex-1"><IndianRupee className="absolute left-3 top-3 w-4 h-4 text-slate-500"/><Input type="number" placeholder="Min" value={filters.minRate} onChange={(e) => setFilters({...filters, minRate: e.target.value})} className="pl-9 bg-white/5 border-white/10 text-white"/></div><span className="text-slate-500">-</span><div className="relative flex-1"><IndianRupee className="absolute left-3 top-3 w-4 h-4 text-slate-500"/><Input type="number" placeholder="Max" value={filters.maxRate} onChange={(e) => setFilters({...filters, maxRate: e.target.value})} className="pl-9 bg-white/5 border-white/10 text-white"/></div></div></div>
                        <div className="space-y-4"><Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Gender</Label><RadioGroup value={filters.gender} onValueChange={(val) => setFilters({...filters, gender: val})} className="grid grid-cols-3 gap-3">{['all', 'male', 'female'].map((g) => (<div key={g}><RadioGroupItem value={g} id={g} className="peer sr-only" /><Label htmlFor={g} className="flex flex-col items-center justify-center rounded-xl border-2 border-white/5 bg-white/5 p-3 hover:bg-white/10 peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-500/10 cursor-pointer transition-all capitalize text-sm font-medium text-slate-300 peer-data-[state=checked]:text-blue-400">{g}</Label></div>))}</RadioGroup></div>
                    </>
                 ) : (
                    <div className="space-y-4"><Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Min Budget (₹)</Label><div className="relative"><IndianRupee className="absolute left-3 top-3 w-4 h-4 text-slate-500"/><Input type="number" placeholder="Minimum payout" value={filters.minRate} onChange={(e) => setFilters({...filters, minRate: e.target.value})} className="pl-9 bg-white/5 border-white/10 text-white"/></div></div>
                 )}
               </div>
               <SheetFooter className="mt-auto pt-6 border-t border-white/10"><Button className="w-full h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20" onClick={handleApplyFilters}>Apply Filters</Button></SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex justify-start md:justify-center gap-4 overflow-x-auto pb-4 no-scrollbar px-2">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)} className={`flex flex-col items-center gap-2 min-w-[70px] cursor-pointer group transition-all duration-200 ${selectedCategory === cat.id ? "scale-105" : "opacity-70 hover:opacity-100"}`}><div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 transition-all ${selectedCategory === cat.id ? "bg-blue-600 border-blue-500 text-white shadow-lg" : "bg-white/5 border-white/5 text-slate-400"}`}>{cat.icon}</div><span className={`text-[11px] font-medium ${selectedCategory === cat.id ? "text-blue-400" : "text-slate-500"}`}>{cat.label}</span></div>
            ))}
          </div>
        </div>

        {/* RESULTS */}
        <div className="max-w-4xl mx-auto min-h-[300px]">
          {loading || initialLoading ? (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {[1,2,3,4].map(i => (
                 <Card key={i} className="bg-white/5 border-white/10 h-32 rounded-2xl p-4 flex gap-4"><Skeleton className="h-14 w-14 rounded-xl bg-white/10" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 bg-white/10" /><Skeleton className="h-3 w-1/2 bg-white/10" /></div></Card>
               ))}
             </div>
          ) : filteredResults.length === 0 ? (
             <div className="text-center py-16 bg-white/5 rounded-3xl border border-dashed border-white/10">
               <p className="text-slate-400 font-medium">No matches found.</p>
               {/* Show specific message if user's own jobs were filtered out */}
               {mode === 'work' && results.some(item => item.customer_id === user?.id) && (
                 <p className="text-slate-500 text-xs mt-2 text-amber-400/80">
                   <ShieldAlert className="w-3 h-3 inline mr-1"/> You cannot see jobs you posted yourself.
                 </p>
               )}
             </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {filteredResults.map((item) => (
                 mode === 'hire' ? (
                   // WORKER CARD
                   <Card key={item.worker_id} onClick={() => openWorkerDetails(item)} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-all group rounded-2xl cursor-pointer">
                     <CardContent className="p-5">
                       <div className="flex gap-4">
                         <Avatar className="h-14 w-14 rounded-xl border border-white/10 bg-slate-800"><AvatarImage src={item.avatar_url} className="object-cover"/><AvatarFallback className="bg-slate-800 text-blue-400 font-bold text-lg">{item.name?.[0]}</AvatarFallback></Avatar>
                         <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-start"><h4 className="font-bold text-lg text-white truncate">{item.name}</h4><div className="flex items-center gap-1 text-amber-400 text-xs font-bold bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20"><Star className="w-3 h-3 fill-current" /> {item.rating_avg || "New"}</div></div>
                           <p className="text-xs text-slate-400 truncate mb-2 mt-1">{item.services?.join(", ")}</p>
                           <div className="flex items-center gap-3 text-xs text-slate-500"><Badge variant="secondary" className="h-6 px-2 text-[10px] bg-blue-500/10 text-blue-300 border-0 hover:bg-blue-500/20">{item.worker_type}</Badge><span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {(item.distance_meters / 1000).toFixed(1)} km</span></div>
                         </div>
                       </div>
                       <Separator className="my-4 bg-white/10" />
                       <div className="flex items-center justify-between"><p className="text-lg font-bold text-white">₹{item.min_hourly_rate_cents / 100}<span className="text-xs font-normal text-slate-500">/hr</span></p><Button onClick={(e) => { e.stopPropagation(); setSelectedWorker(item); setHireModalOpen(true); }} className={`h-10 px-6 font-semibold rounded-xl shadow-lg text-white ${item.accepts_direct_hire && item.is_online ? "bg-emerald-600 hover:bg-emerald-500" : "bg-blue-600 hover:bg-blue-500"}`}>{item.accepts_direct_hire && item.is_online ? "Hire" : "Request"}</Button></div>
                     </CardContent>
                   </Card>
                 ) : (
                   // JOB CARD
                   <Card key={item.job_id || item.id} onClick={() => { setSelectedJob(item); setJobModalOpen(true); }} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-all cursor-pointer rounded-2xl group">
                     <CardContent className="p-5 space-y-4">
                       <div className="flex justify-between items-start"><div><h4 className="font-bold text-lg text-white line-clamp-1 group-hover:text-blue-400 transition-colors">{item.title}</h4><div className="flex items-center gap-2 mt-1"><Badge variant="outline" className="border-white/10 text-slate-400 text-[10px] bg-white/5">{item.category}</Badge><span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(item.created_at).toLocaleDateString()}</span></div></div><Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-sm font-bold px-2 py-1">₹{item.budget_max_cents ? item.budget_max_cents / 100 : 'Offer'}</Badge></div>
                       <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed">{item.description || "No description."}</p>
                       <Button variant="secondary" className="w-full h-10 text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-medium rounded-xl">View Details</Button>
                     </CardContent>
                   </Card>
                 )
               ))}
             </div>
          )}
        </div>
      </div>

      {/* --- WORKER DETAILS MODAL --- */}
      <Dialog open={workerDetailsOpen} onOpenChange={setWorkerDetailsOpen}>
         <DialogContent className="bg-slate-950 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
           <DialogHeader><div className="flex items-center gap-4 mb-2"><Avatar className="h-20 w-20 border-4 border-white/10"><AvatarImage src={selectedWorker?.avatar_url} className="object-cover"/><AvatarFallback className="bg-slate-800 text-blue-400 text-xl font-bold">{selectedWorker?.name?.[0]}</AvatarFallback></Avatar><div><DialogTitle className="text-2xl font-bold text-white">{selectedWorker?.name}</DialogTitle><p className="text-slate-400 text-sm">{selectedWorker?.worker_type} • {selectedWorker?.experience_years} Yrs Exp</p><div className="flex items-center gap-1 text-amber-400 text-sm font-bold mt-1"><Star className="w-4 h-4 fill-current" /> {selectedWorker?.rating_avg || "New"}</div></div></div></DialogHeader>
           <div className="space-y-6 py-2">
              {selectedWorker?.about_text && <div className="bg-white/5 p-4 rounded-xl border border-white/5"><h4 className="text-xs font-bold text-slate-500 uppercase mb-2">About</h4><p className="text-sm text-slate-300 leading-relaxed">{selectedWorker.about_text}</p></div>}
              
              {/* Professions & Skills */}
              {(selectedWorker?.professions || selectedWorker?.skills) && (
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
                     {selectedWorker?.professions?.length > 0 && (
                         <div className="flex flex-wrap gap-2">
                            {selectedWorker.professions.map(p => <Badge key={p} variant="secondary" className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30">{p}</Badge>)}
                         </div>
                     )}
                     {selectedWorker?.skills?.length > 0 && (
                         <div className="flex flex-wrap gap-2">
                            {selectedWorker.skills.map(s => <Badge key={s} variant="outline" className="border-white/20 text-slate-400 text-[10px]">{s}</Badge>)}
                         </div>
                     )}
                  </div>
              )}

              <div className="grid grid-cols-2 gap-4"><div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center"><p className="text-xs text-slate-500 uppercase">Rate</p><p className="text-lg font-bold text-white">₹{selectedWorker?.min_hourly_rate_cents/100}<span className="text-xs font-normal text-slate-500">/hr</span></p></div><div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center"><p className="text-xs text-slate-500 uppercase">Services</p><p className="text-sm font-medium text-white truncate">{selectedWorker?.services?.length || 0} Listed</p></div></div>
              
              <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-white">Reviews</h4>
                    <span className="text-xs text-slate-500">{selectedWorker?.rating_count} Ratings</span>
                  </div>
                  {reviewsLoading ? <Loader2 className="animate-spin mx-auto" /> : workerReviews.length === 0 ? <p className="text-slate-500 text-sm italic text-center">No reviews yet.</p> : <div className="space-y-3 max-h-40 overflow-y-auto pr-1">{workerReviews.map((review, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-lg border border-white/5">
                       <div className="flex justify-between mb-1 items-center">
                          <span className="text-xs text-slate-400 font-medium">{review.reviewer_name || "User"}</span>
                          <div className="flex gap-0.5 text-amber-500"><Star className="w-3 h-3 fill-current" /> <span className="text-xs">{review.rating}</span></div>
                       </div>
                       {review.comment && <p className="text-sm text-slate-300">"{review.comment}"</p>}
                       <span className="text-[10px] text-slate-500 block mt-1 text-right">{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}</div>}
              </div>
           </div>
           <DialogFooter className="gap-2 mt-4"><Button variant="outline" onClick={() => setWorkerDetailsOpen(false)} className="border-white/10 text-slate-400">Close</Button><Button onClick={() => { setWorkerDetailsOpen(false); setHireModalOpen(true); }} className={`text-white font-bold w-full sm:w-auto ${selectedWorker?.accepts_direct_hire && selectedWorker?.is_online ? "bg-emerald-600 hover:bg-emerald-500" : "bg-blue-600 hover:bg-blue-500"}`}>{selectedWorker?.accepts_direct_hire && selectedWorker?.is_online ? "Hire Now" : "Request Service"}</Button></DialogFooter>
         </DialogContent>
      </Dialog>

      {/* --- HIRE MODAL --- */}
      <Dialog open={hireModalOpen} onOpenChange={setHireModalOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white sm:max-w-md overflow-y-auto max-h-[90vh]">
          <DialogHeader><DialogTitle className="text-2xl text-white">{selectedWorker?.accepts_direct_hire && selectedWorker?.is_online ? `Hire ${selectedWorker?.name}` : `Request ${selectedWorker?.name}`}</DialogTitle><DialogDescription className="text-slate-400">{selectedWorker?.accepts_direct_hire && selectedWorker?.is_online ? "Instant assignment." : "Worker approval required."}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs text-slate-500 uppercase font-bold">Job Title</Label><Input value={hireForm.title} onChange={(e) => setHireForm({...hireForm, title: e.target.value})} placeholder="e.g. Fix Leaking Pipe" className="bg-white/5 border-white/10 text-white h-12 rounded-xl" /></div>
            <div className="space-y-2"><Label className="text-xs text-slate-500 uppercase font-bold">Service Required</Label><Input value={hireForm.service} onChange={(e) => setHireForm({...hireForm, service: e.target.value})} placeholder="e.g. Leak Fix, Tap Replacement" className="bg-white/5 border-white/10 text-white h-12 rounded-xl" /></div>
            <div className="space-y-2"><Label className="text-xs text-slate-500 uppercase font-bold">Description</Label><Textarea value={hireForm.description} onChange={(e) => setHireForm({...hireForm, description: e.target.value})} className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl" /></div>
            <div className="space-y-2"><Label className="text-xs text-slate-500 uppercase font-bold">Budget (₹)</Label><Input type="number" value={hireForm.budget} onChange={(e) => setHireForm({...hireForm, budget: e.target.value})} placeholder="e.g. 500" className="bg-white/5 border-white/10 text-white h-12 rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-4"><div className="col-span-2 space-y-2"><Label className="text-xs uppercase font-bold text-slate-500">Address</Label><Input value={hireForm.address} onChange={(e) => setHireForm({...hireForm, address: e.target.value})} placeholder="Street Address" className="bg-white/5 border-white/10 text-white h-12 rounded-xl" /></div><div className="space-y-2"><Label className="text-xs uppercase font-bold text-slate-500">City</Label><Input value={hireForm.city} onChange={(e) => setHireForm({...hireForm, city: e.target.value})} placeholder="City" className="bg-white/5 border-white/10 text-white h-12 rounded-xl" /></div><div className="space-y-2"><Label className="text-xs uppercase font-bold text-slate-500">Pincode</Label><Input value={hireForm.pincode} onChange={(e) => setHireForm({...hireForm, pincode: e.target.value})} placeholder="Pincode" className="bg-white/5 border-white/10 text-white h-12 rounded-xl" /></div></div>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setHireModalOpen(false)} className="border-white/10 text-slate-400">Cancel</Button><Button onClick={handleDirectHire} disabled={hiring} className={`h-12 font-bold rounded-xl text-white shadow-lg ${selectedWorker?.accepts_direct_hire && selectedWorker?.is_online ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20"}`}>{hiring ? <Loader2 className="animate-spin mr-2" /> : (selectedWorker?.accepts_direct_hire && selectedWorker?.is_online ? "Hire Now" : "Send Request")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- VIEW JOB DIALOG (BIDDING) --- */}
      <Dialog open={jobModalOpen} onOpenChange={setJobModalOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-2xl text-white">{selectedJob?.title}</DialogTitle><DialogDescription className="text-slate-400">Posted by {selectedJob?.customer_name || "Client"}</DialogDescription></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold">Budget</p><p className="text-xl font-bold text-emerald-400">₹{selectedJob?.budget_max_cents ? selectedJob.budget_max_cents / 100 : 0}</p></div>
                <div className="h-10 w-[1px] bg-white/10" />
                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold">Distance</p><p className="text-xl font-bold text-white">{((selectedJob?.distance_meters || selectedJob?.dist_m || 0)/1000).toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span></p></div>
            </div>
            <div className="space-y-2"><h4 className="font-bold text-sm text-white uppercase tracking-wider text-xs">Description</h4><p className="text-sm text-slate-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">{selectedJob?.description}</p></div>
            
            <div className="space-y-4 pt-4 border-t border-white/10">
                <h4 className="font-bold text-sm text-white uppercase tracking-wider text-xs">Place a Bid</h4>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 mb-1.5 block">Your Price (₹)</label>
                        <Input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="e.g. 500" className="bg-white/5 border-white/10 text-white h-12 rounded-xl" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 mb-1.5 block">Proposal</label>
                        <Textarea value={bidMessage} onChange={(e) => setBidMessage(e.target.value)} placeholder="Why are you the best fit?" className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl resize-none" />
                    </div>
                </div>
            </div>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setJobModalOpen(false)} className="border-white/10 text-slate-400">Cancel</Button><Button onClick={handleBidSubmit} disabled={bidding} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">{bidding ? <Loader2 className="animate-spin" /> : "Submit Bid"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} user={user} />
    </div>
  );
}