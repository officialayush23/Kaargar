import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MapPin, Briefcase, Wrench, User, ChevronRight,
  ShieldCheck, Hammer, Zap, SlidersHorizontal,
  Star, Clock, Loader2, Filter, IndianRupee
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// Custom Components
import Sidebar from "../components/use_ui/Sidebar";
import Headback from "../components/Headback";
import ModeToggle from "../components/use_ui/ModeToggle";
import { supabase } from "../lib/supabaseClient";

// --- CONSTANTS ---
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

  // -- STATE --
  const [mode, setMode] = useState("hire"); // 'hire' or 'work'
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  
  // Location
  const [coords, setCoords] = useState({ lat: 21.1458, lon: 79.0882 }); // Default Nagpur
  const [locationName, setLocationName] = useState("Locating...");

  // Data
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applyingFilters, setApplyingFilters] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  
  // Filter State Object
  const [filters, setFilters] = useState({
    sortBy: "recommended",
    radius: [15], // km
    gender: "all"
  });

  // Drawers & Modals
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDrawerOpen, setJobDrawerOpen] = useState(false);
  
  // Bidding
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [bidding, setBidding] = useState(false);

  // 1. AUTH & PROFILE & LOCATION INIT
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      setUser(session.user);

      // Fetch Profile
      try {
        const res = await fetch("http://localhost:8000/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data.user);
        }
      } catch (err) { console.error(err); }

      // Get Location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          setCoords({ lat: latitude, lon: longitude });
          setLocationName("Current Location"); // Could use reverse geocoding API here

          // Update Location in DB
          await fetch("http://localhost:8000/api/me/location", {
            method: "PATCH",
            headers: { 
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}` 
            },
            body: JSON.stringify({ lat: latitude, lon: longitude })
          });
        }, (err) => {
          console.warn("Location denied, using default.", err);
          setLocationName("Nagpur (Default)");
        });
      }
    };
    init();

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [navigate]);

  // 2. DATA FETCHING
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        lat: coords.lat,
        lon: coords.lon,
        radius: filters.radius[0] * 1000, // meters
        sort_by: filters.sortBy
      });

      if (selectedCategory) params.append("profession", selectedCategory); // Maps to 'category' in job search too potentially
      
      // API Selection Logic
      let endpoint = "";
      
      if (mode === 'hire') {
        // Searching Workers
        endpoint = "/api/search"; 
        if (searchQuery) params.append("service", searchQuery); // Search service tags
        if (filters.gender !== 'all') params.append("gender", filters.gender);
      } else {
        // Searching Jobs
        if (searchQuery) {
          endpoint = "/api/jobs/search";
          params.append("query", searchQuery); // Search title/desc
        } else {
          endpoint = "/api/jobs/feed";
          // Feed supports category filter via profession mapping if backend enabled, 
          // but currently feed filters mainly by location/radius in the basic implementation.
          // We rely on client side or basic param passing.
        }
      }

      const res = await fetch(`http://localhost:8000${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.results || data.jobs || []);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
      setApplyingFilters(false);
    }
  };

  // Trigger fetch on state changes
  useEffect(() => {
    const timer = setTimeout(fetchData, 500);
    return () => clearTimeout(timer);
  }, [mode, searchQuery, selectedCategory, coords]); 
  // Note: We do NOT depend on 'filters' here to avoid auto-refetch. 
  // User must click "Apply" in the sheet.

  // 3. HANDLERS
  const handleApplyFilters = async () => {
    setApplyingFilters(true);
    await fetchData(); // Force re-fetch with new filters
    setFilterSheetOpen(false);
  };

  const handleModeSwitch = (newMode) => {
    if (newMode === 'work') {
      const isWorker = profile?.role === 'worker' || profile?.role === 'agency';
      if (!isWorker) {
        setShowRegisterPrompt(true);
        return;
      }
    }
    setMode(newMode);
    setResults([]); // Clear to avoid stale data
  };

  const handleBidSubmit = async () => {
    setBidding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`http://localhost:8000/api/jobs/${selectedJob.id || selectedJob.job_id}/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          amount_cents: parseInt(bidAmount) * 100,
          message: bidMessage
        })
      });

      if (res.ok) {
        toast.success("Bid placed!");
        setJobDrawerOpen(false);
        setBidAmount("");
        setBidMessage("");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed");
      }
    } catch (e) { toast.error("Error placing bid"); }
    finally { setBidding(false); }
  };

  // Formatters
  const formatCurrency = (cents) => {
    if (!cents) return "₹0";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(cents / 100);
  };
  const getInitials = () => user?.user_metadata?.full_name ? user.user_metadata.full_name.charAt(0).toUpperCase() : "U";


  return (
    <div className="min-h-screen pb-0 relative flex flex-col overflow-x-hidden">
      
      <Headback /> {/* Aurora Background */}

      {/* --- WORKER PROMPT MODAL --- */}
      <AnimatePresence>
        {showRegisterPrompt && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center space-y-6 relative overflow-hidden"
            >
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
               <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mx-auto ring-4 ring-blue-500/10">
                <Briefcase className="w-8 h-8" />
               </div>
               <div>
                <h2 className="text-2xl font-bold text-white">Worker Account Needed</h2>
                <p className="text-slate-400 text-sm mt-2">Register as a worker to access the job feed.</p>
               </div>
               <div className="grid gap-3">
                <Button onClick={() => navigate("/register_worker")} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 rounded-xl">Register Now</Button>
                <Button variant="ghost" onClick={() => setShowRegisterPrompt(false)} className="w-full text-slate-400 hover:text-white hover:bg-white/5 h-12 rounded-xl">Cancel</Button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- HEADER --- */}
      <header className={`sticky top-0 z-50 px-4 py-3 flex items-center justify-between transition-all duration-300 ${scrolled ? "bg-slate-950/80 backdrop-blur-md border-b border-white/5" : "bg-transparent"}`}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-xl tracking-tight text-white drop-shadow-md">KAARGAR</span>
        </div>

        {/* Mode Toggle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-sm">
            <button onClick={() => handleModeSwitch("hire")} className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${mode === "hire" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>Hire</button>
            <button onClick={() => handleModeSwitch("work")} className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${mode === "work" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>Work</button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ModeToggle />
          <div onClick={() => setSidebarOpen(true)} className="cursor-pointer transition-transform hover:scale-105 active:scale-95">
            <Avatar className="w-9 h-9 border-2 border-white/10 shadow-sm">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-slate-800 text-blue-400 font-bold text-xs">{getInitials()}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      {/* --- HERO SECTION --- */}
      <div className="px-4 pt-8 pb-16 relative z-10 min-h-[35vh] flex flex-col justify-center">
        <div className="max-w-4xl mx-auto space-y-8 w-full">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight drop-shadow-lg">
              {mode === "hire" ? "Expert Help, Instantly." : "Find Jobs, Earn Money."}
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-medium">
              {mode === "hire" ? "Verified professionals at your doorstep" : "Your skills, your schedule"}
            </p>
          </div>

          {/* Carousel */}
          <Carousel className="w-full max-w-3xl mx-auto">
            <CarouselContent className="-ml-4">
              {OFFERS.map((offer) => (
                <CarouselItem key={offer.id} className="pl-4 basis-[85%] sm:basis-1/2 md:basis-1/3">
                  <div className={`h-28 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden ${offer.bg} border border-white/10 shadow-lg cursor-pointer transition-transform hover:scale-[1.02]`}>
                    <h3 className="text-white font-bold text-xl relative z-10">{offer.title}</h3>
                    <p className="text-white/90 text-xs font-medium relative z-10">{offer.desc}</p>
                    <div className="absolute right-[-20px] top-[-20px] w-24 h-24 bg-white/20 rounded-full blur-2xl" />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </div>

      {/* --- MAIN CONTENT SHEET --- */}
      <div className="flex-1 bg-slate-950 rounded-t-[2.5rem] shadow-[0_-10px_50px_-15px_rgba(0,0,0,0.7)] border-t border-white/10 relative z-20 pt-12 px-4 pb-24 min-h-[60vh] mt-8">
        
        {/* SEARCH BAR ROW */}
        <div className="max-w-2xl mx-auto -mt-20 mb-8 flex gap-3 items-center">
          <div className="flex-1 bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-2 flex items-center gap-2 h-14 ring-1 ring-white/5">
            <Search className="w-5 h-5 text-slate-400 ml-2" />
            <Input 
              className="border-0 h-full bg-transparent focus-visible:ring-0 px-2 placeholder:text-slate-500 font-medium text-white text-base"
              placeholder={mode === "hire" ? "Search 'Plumber'..." : "Search 'Jobs'..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="pr-2 border-l border-white/10 pl-2 flex items-center gap-1 text-xs text-slate-400 font-medium whitespace-nowrap max-w-[100px] overflow-hidden text-ellipsis">
              <MapPin className="w-3 h-3" /> {locationName.split(',')[0]}
            </div>
          </div>

          {/* FILTER SHEET */}
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button size="icon" className="h-14 w-14 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl hover:bg-white/5 shrink-0 ring-1 ring-white/5">
                <SlidersHorizontal className="w-6 h-6 text-white" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-slate-950 border-white/10 text-white sm:max-w-md w-full">
              <SheetHeader className="text-left mb-6">
                <SheetTitle className="text-white text-2xl">Filters</SheetTitle>
                <SheetDescription className="text-slate-400">Customize your search results.</SheetDescription>
              </SheetHeader>
              
              <div className="space-y-8">
                 {/* Sort */}
                 <div className="space-y-4">
                  <Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Sort By</Label>
                  <Select value={filters.sortBy} onValueChange={(val) => setFilters({...filters, sortBy: val})}>
                    <SelectTrigger className="h-12 bg-white/5 border-white/10 text-white text-base">
                      <SelectValue placeholder="Recommended" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="price_asc">Price: Low to High</SelectItem>
                      <SelectItem value="rating_desc">Rating: High to Low</SelectItem>
                      <SelectItem value="distance_asc">Distance: Nearest</SelectItem>
                    </SelectContent>
                  </Select>
                 </div>

                 {/* Radius */}
                 <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Radius</Label>
                    <span className="text-sm font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded">{filters.radius[0]} km</span>
                  </div>
                  <Slider 
                    value={filters.radius} max={50} step={1} 
                    onValueChange={(val) => setFilters({...filters, radius: val})}
                    className="py-2"
                  />
                 </div>

                 {/* Gender (Hire Only) */}
                 {mode === 'hire' && (
                   <div className="space-y-4">
                    <Label className="text-sm text-slate-400 uppercase tracking-wider font-bold">Gender</Label>
                    <RadioGroup value={filters.gender} onValueChange={(val) => setFilters({...filters, gender: val})} className="grid grid-cols-3 gap-3">
                      {['all', 'male', 'female'].map((g) => (
                        <div key={g}>
                          <RadioGroupItem value={g} id={g} className="peer sr-only" />
                          <Label htmlFor={g} className="flex flex-col items-center justify-center rounded-xl border-2 border-white/5 bg-white/5 p-3 hover:bg-white/10 peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-500/10 cursor-pointer transition-all capitalize text-sm font-medium text-slate-300 peer-data-[state=checked]:text-blue-400">
                            {g}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                   </div>
                 )}
              </div>

              <SheetFooter className="mt-auto absolute bottom-6 left-6 right-6">
                <Button onClick={handleApplyFilters} disabled={applyingFilters} className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-900/20">
                  {applyingFilters ? <Loader2 className="animate-spin" /> : "Apply Filters"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* CATEGORIES LIST */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex justify-start md:justify-center gap-4 overflow-x-auto pb-4 no-scrollbar px-2">
            {CATEGORIES.map((cat) => (
              <div 
                key={cat.id} 
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                className={`flex flex-col items-center gap-2 min-w-[70px] cursor-pointer group transition-all duration-200 ${selectedCategory === cat.id ? "scale-105" : "opacity-70 hover:opacity-100"}`}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 transition-all ${selectedCategory === cat.id ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-white/5 border-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white group-hover:border-white/20"}`}>
                  {cat.icon}
                </div>
                <span className={`text-[11px] font-medium ${selectedCategory === cat.id ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}`}>{cat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* LIST HEADER */}
        <div className="max-w-4xl mx-auto mb-4 px-2 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {mode === 'hire' ? <User className="w-5 h-5 text-blue-500" /> : <Briefcase className="w-5 h-5 text-blue-500" />}
            {mode === 'hire' ? "Top Professionals" : "Recent Jobs"}
          </h3>
        </div>

        {/* RESULTS GRID */}
        <div className="max-w-4xl mx-auto min-h-[300px]">
          {loading ? (
             <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500 h-10 w-10" /></div>
          ) : results.length === 0 ? (
             <div className="text-center py-16 bg-white/5 rounded-3xl border border-dashed border-white/10">
               <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500"><Filter className="w-8 h-8" /></div>
               <p className="text-slate-400 font-medium">No matches found.</p>
               <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or search area.</p>
               <Button variant="link" onClick={() => {setSearchQuery(""); setSelectedCategory(null); setFilters({...filters, radius: [50]})}} className="text-blue-400 mt-2">Reset All</Button>
             </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {results.map((item) => (
                 mode === 'hire' ? (
                   // WORKER CARD
                   <Card key={item.worker_id} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-all group rounded-2xl">
                     <CardContent className="p-5">
                       <div className="flex gap-4">
                         <Avatar className="h-16 w-16 rounded-2xl border-2 border-white/10 bg-slate-800">
                           <AvatarImage src={item.avatar_url} className="object-cover"/>
                           <AvatarFallback className="bg-slate-800 text-blue-400 font-bold text-lg">{item.name?.[0]}</AvatarFallback>
                         </Avatar>
                         <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-start">
                             <h4 className="font-bold text-lg text-white truncate">{item.name}</h4>
                             <div className="flex items-center gap-1 text-amber-400 text-xs font-bold bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                               <Star className="w-3 h-3 fill-current" /> {item.rating_avg || "New"}
                             </div>
                           </div>
                           <p className="text-xs text-slate-400 truncate mb-2 mt-1">{item.services?.join(", ") || "General Worker"}</p>
                           <div className="flex items-center gap-3 text-xs text-slate-500">
                             <Badge variant="secondary" className="h-6 px-2 text-[10px] bg-blue-500/10 text-blue-300 border-0 hover:bg-blue-500/20">{item.worker_type}</Badge>
                             <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {(item.distance_meters / 1000).toFixed(1)} km</span>
                           </div>
                         </div>
                       </div>
                       <Separator className="my-4 bg-white/10" />
                       <div className="flex items-center justify-between">
                         <div>
                           <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Rate</p>
                           <p className="text-lg font-bold text-white">₹{item.min_hourly_rate_cents ? item.min_hourly_rate_cents / 100 : 'N/A'}<span className="text-xs font-normal text-slate-500">/hr</span></p>
                         </div>
                         <Button onClick={() => navigate("/enter_job_details", { state: { workerId: item.worker_id } })} className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-900/20">Hire</Button>
                       </div>
                     </CardContent>
                   </Card>
                 ) : (
                   // JOB CARD
                   <Card key={item.job_id || item.id} onClick={() => { setSelectedJob(item); setJobDrawerOpen(true); }} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-all cursor-pointer rounded-2xl group">
                     <CardContent className="p-5 space-y-4">
                       <div className="flex justify-between items-start">
                         <div>
                           <h4 className="font-bold text-lg text-white line-clamp-1 group-hover:text-blue-400 transition-colors">{item.title}</h4>
                           <div className="flex items-center gap-2 mt-1">
                             <Badge variant="outline" className="border-white/10 text-slate-400 text-[10px] bg-white/5">{item.category}</Badge>
                             <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(item.created_at).toLocaleDateString()}</span>
                           </div>
                         </div>
                         <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-sm font-bold px-2 py-1">
                           ₹{item.budget_max_cents ? item.budget_max_cents / 100 : 'Offer'}
                         </Badge>
                       </div>
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

      {/* --- JOB DETAILS DRAWER --- */}
      <Drawer open={jobDrawerOpen} onOpenChange={setJobDrawerOpen}>
        <DrawerContent className="max-h-[90vh] bg-slate-950 border-t border-white/10 text-white">
          <div className="mx-auto w-full max-w-lg">
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-2xl font-bold text-white">{selectedJob?.title}</DrawerTitle>
              <DrawerDescription className="text-slate-400">Posted by {selectedJob?.customer_name || "Client"}</DrawerDescription>
            </DrawerHeader>
            
            <div className="p-4 space-y-6 overflow-y-auto">
              <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold">Budget</p><p className="text-xl font-bold text-emerald-400">₹{selectedJob?.budget_max_cents ? selectedJob.budget_max_cents / 100 : 0}</p></div>
                <div className="h-10 w-[1px] bg-white/10" />
                <div className="text-center"><p className="text-[10px] text-slate-500 uppercase font-bold">Distance</p><p className="text-xl font-bold text-white">{((selectedJob?.distance_meters || selectedJob?.dist_m || 0)/1000).toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span></p></div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-sm text-white uppercase tracking-wider text-xs">Description</h4>
                <p className="text-sm text-slate-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">{selectedJob?.description}</p>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/10">
                <h4 className="font-bold text-sm text-white uppercase tracking-wider text-xs">Place a Bid</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Your Price (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-slate-500">₹</span>
                      <Input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="e.g. 500" className="bg-white/5 border-white/10 text-white pl-8 h-12 rounded-xl" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Proposal</label>
                    <Textarea value={bidMessage} onChange={(e) => setBidMessage(e.target.value)} placeholder="Why are you the best fit?" className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl resize-none" />
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter>
              <Button onClick={handleBidSubmit} disabled={bidding} className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-lg font-bold shadow-lg shadow-blue-900/20">
                {bidding ? <Loader2 className="animate-spin" /> : "Submit Bid"}
              </Button>
              <DrawerClose asChild><Button variant="outline" className="h-12 border-white/10 text-slate-400 hover:bg-white/5 hover:text-white rounded-xl">Cancel</Button></DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} user={user} />
    </div>
  );
}