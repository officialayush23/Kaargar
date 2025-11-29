import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    Search, MapPin, Briefcase, Wrench, User, ChevronRight,
    Percent, Gift, ShieldCheck, Star, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
// Using your specified paths
import Sidebar from "../components/use_ui/Sidebar";
import ModeToggle from "../components/use_ui/ModeToggle";
import Headback from "../components/Headback";
import { supabase } from "../lib/supabaseClient";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

// --- DATA ---
const CATEGORIES = [
    { id: "plumber", label: "Plumber", icon: <Wrench className="w-6 h-6" />, color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
    { id: "mechanic", label: "Mechanic", icon: <Briefcase className="w-6 h-6" />, color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    { id: "maid", label: "Maid", icon: <User className="w-6 h-6" />, color: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400" },
    { id: "electrician", label: "Electrician", icon: <Wrench className="w-6 h-6" />, color: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" },
    { id: "driver", label: "Driver", icon: <MapPin className="w-6 h-6" />, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
    { id: "tutor", label: "Tutor", icon: <Briefcase className="w-6 h-6" />, color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
    { id: "security", label: "Security", icon: <User className="w-6 h-6" />, color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
    { id: "cleaner", label: "Cleaner", icon: <User className="w-6 h-6" />, color: "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400" },
];

const OFFERS = [
    { id: 1, title: "20% OFF", desc: "On your first plumbing job", icon: <Percent className="w-8 h-8 text-white" />, bg: "bg-gradient-to-br from-blue-500 to-blue-700" },
    { id: 2, title: "Refer & Earn", desc: "Get ₹500 per referral", icon: <Gift className="w-8 h-8 text-white" />, bg: "bg-gradient-to-br from-purple-500 to-purple-700" },
    { id: 3, title: "Verified", desc: "Free ID check for workers", icon: <ShieldCheck className="w-8 h-8 text-white" />, bg: "bg-gradient-to-br from-emerald-500 to-emerald-700" },
];

// FIX: Point directly to your FastAPI backend port (usually 8000)
const BACKEND_URL = "http://127.0.0.1:8000"; 

const Home = () => {
    const [mode, setMode] = useState("hire");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [user, setUser] = useState(null);
    
    // Search & Results State
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // 1. Auth Check
    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user || null);
        };
        checkUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    // 2. Scroll Handler
    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // 3. Data Fetching (Search Wiring)
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Hardcoded Nagpur coords for MVP
                const lat = 21.1458;
                const lon = 79.0882;

                const params = new URLSearchParams({
                    lat, lon,
                    radius_meters: 20000,
                    limit: 20
                });
                
                // Priority: Selected Category -> Search Query Text
                if (selectedCategory) params.append("category", selectedCategory);
                else if (searchQuery) params.append("category", searchQuery);

                let endpoint = mode === "hire" ? "/api/search" : "/api/jobs/feed";

                // Use the explicit BACKEND_URL
                const res = await fetch(`${BACKEND_URL}${endpoint}?${params.toString()}`);
                
                // Safety check: Ensure we got JSON back, not HTML (which happens on 404/500s sometimes)
                const contentType = res.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    throw new Error("Received non-JSON response from server");
                }

                if (!res.ok) throw new Error("Search request failed");
                const data = await res.json();

                if (mode === "hire") setResults(data.workers || []);
                else setResults(data.jobs || []);

            } catch (err) {
                console.error("Search error:", err);
                setResults([]);
            } finally {
                setLoading(false);
            }
        };

        // Debounce search to prevent too many API calls
        const timer = setTimeout(fetchData, 500);
        return () => clearTimeout(timer);
    }, [mode, searchQuery, selectedCategory]);

    const getInitials = () => {
        if (!user) return "U";
        const name = user.user_metadata?.full_name || user.user_metadata?.name;
        if (name) return name.charAt(0).toUpperCase();
        if (user.email) return user.email.charAt(0).toUpperCase();
        return "U";
    };

    return (
        <div className="min-h-screen overflow-x-hidden flex flex-col font-poppins">
            <Headback />
            
            {/* --- HERO SECTION --- */}
            <div className="relative w-screen min-h-[45vh] pb-12 overflow-hidden flex flex-col">

                {/* --- HEADER OVERLAY --- */}
                <header className={`sticky top-0 z-40 px-4 py-3 flex items-center justify-between transition-all duration-300 ${scrolled ? "bg-background/80 backdrop-blur-md shadow-sm border-b border-border/50" : "bg-transparent"}`}>
                    {/* Logo */}
                    <div className="flex items-center z-50">
                        <Link to="/home" className="text-2xl tracking-tight text-white font-heading">
                            KAARGAR
                        </Link>
                    </div>

                    {/* Centered Toggle */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
                        <div className="flex items-center backdrop-blur-sm p-1 rounded-full border border-white/30 bg-white/10 shadow-sm">
                            <button
                                onClick={() => setMode("hire")}
                                className={`px-4 py-1 rounded-full text-xs font-bold transition-all duration-200 ${mode === "hire" ? "bg-black text-white shadow-md" : "text-white/80 hover:text-white"}`}
                            >
                                Hire
                            </button>
                            <button
                                onClick={() => setMode("work")}
                                className={`px-4 py-1 rounded-full text-xs font-bold transition-all duration-200 ${mode === "work" ? "bg-black text-white shadow-md" : "text-white/80 hover:text-white"}`}
                            >
                                Work
                            </button>
                        </div>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-3 z-50">
                        <ModeToggle />
                        <div onClick={() => setSidebarOpen(true)} className="cursor-pointer transition-transform hover:scale-105 active:scale-95">
                            <Avatar className="w-9 h-9 border-2 border-white dark:border-slate-800 shadow-sm">
                                <AvatarImage src={user?.user_metadata?.avatar_url} />
                                <AvatarFallback className="bg-blue-600 text-white font-bold text-xs">
                                    {getInitials()}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    </div>
                </header>

                {/* --- CAROUSEL --- */}
                <div className="flex-1 flex flex-col items-center text-center justify-center gap-4 py-6">
                    <div className="px-6 mb-2">
                        <h2 className="text-3xl font-bold text-white leading-tight drop-shadow-sm">
                            {mode === "hire" ? "Hire Professionals" : "Find Work Nearby"}
                            <br />
                            <span className="text-white/80 text-lg font-normal">Offers valid now</span>
                        </h2>
                    </div>

                    <div className="w-full px-6">
                        <Carousel className="w-full max-w-sm sm:max-w-xl md:max-w-2xl">
                            <CarouselContent className="-ml-4">
                                {OFFERS.map((offer) => (
                                    <CarouselItem key={offer.id} className="pl-4 basis-[85%] sm:basis-1/2 lg:basis-1/3">
                                        <div className={`h-40 rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden ${offer.bg} group cursor-pointer transition-transform hover:scale-[1.02]`}>
                                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-2xl" />
                                            <div className="relative z-10">
                                                <div className="bg-white/20 w-fit p-2 rounded-lg backdrop-blur-sm mb-3">
                                                    {offer.icon}
                                                </div>
                                                <h3 className="text-white font-bold text-2xl">{offer.title}</h3>
                                                <p className="text-white/90 text-sm font-medium">{offer.desc}</p>
                                            </div>
                                            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold text-xs bg-black/20 px-2 py-1 rounded">
                                                Claim Now
                                            </div>
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                        </Carousel>
                    </div>
                </div>
            </div>

            {/* --- MAIN CONTENT SHEET --- */}
            <div className="flex-1 bg-background rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] -mt-8 relative z-30 px-4 pt-8 pb-20">

                {/* Search Pill */}
                <div className="max-w-2xl mx-auto -mt-14 mb-8">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-xl border border-border/50 p-2 flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 border-r border-border px-2">
                            <Search className="w-4 h-4 text-muted-foreground" />
                            <Input
                                className="border-0 h-10 bg-transparent focus-visible:ring-0 px-0 placeholder:text-muted-foreground font-medium text-slate-800 dark:text-white"
                                placeholder={mode === "hire" ? "Search for Plumber, Maid..." : "Search for Jobs..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="w-[35%] flex items-center gap-2 px-2">
                            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="text-sm truncate text-slate-700 dark:text-white font-medium">Nagpur</div>
                        </div>
                        <Button size="icon" className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shrink-0">
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* Categories Grid */}
                <div className="max-w-4xl mx-auto mb-8">
                    <div className="flex items-center justify-between px-2 mb-4">
                        <h3 className="font-bold text-lg text-foreground">Categories</h3>
                        <Button variant="ghost" className="text-xs text-blue-600 hover:text-blue-700 h-auto p-0">See all</Button>
                    </div>

                    <div className="flex overflow-x-auto pb-2 gap-4 no-scrollbar">
                        <div
                            onClick={() => { setSelectedCategory(null); setSearchQuery(""); }}
                            className={`flex flex-col items-center min-w-[60px] gap-2 cursor-pointer transition-opacity ${!selectedCategory ? 'opacity-100' : 'opacity-50'}`}
                        >
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                                <span className="text-xs font-bold">All</span>
                            </div>
                        </div>
                        {CATEGORIES.map((cat) => (
                            <div 
                                key={cat.id} 
                                onClick={() => setSelectedCategory(cat.id)} 
                                className={`flex flex-col items-center min-w-[60px] gap-2 cursor-pointer transition-opacity ${selectedCategory === cat.id ? 'opacity-100 scale-105' : 'opacity-70'}`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${cat.color}`}>
                                    {cat.icon}
                                </div>
                                <span className="text-[10px] font-medium text-center truncate w-full">{cat.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Results List (Wired to Backend) */}
                <div className="max-w-4xl mx-auto space-y-4 mb-8">
                    <h3 className="font-bold text-lg px-1 mb-2">
                        {loading ? "Searching..." : `Top ${mode === "hire" ? "Workers" : "Jobs"} Near You`}
                    </h3>

                    {results.length === 0 && !loading && (
                        <div className="text-center py-10 text-muted-foreground bg-muted/30 rounded-xl border border-dashed">
                            No {mode === "hire" ? "workers" : "jobs"} found matching your criteria. <br/> Try searching for "Plumber" or "Driver".
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {results.map((item) => (
                            <Card
                                key={item.worker_id || item.job_id}
                                className="overflow-hidden hover:shadow-lg transition-all cursor-pointer border-border/60 dark:bg-card/50"
                                onClick={() => {
                                    if (mode === 'hire') navigate(`/worker/${item.worker_id}`);
                                    else navigate(`/job/${item.job_id}`);
                                }}
                            >
                                <CardContent className="p-4 flex gap-4 items-start">
                                    {mode === "hire" ? (
                                        // --- WORKER CARD ---
                                        <>
                                            <Avatar className="h-14 w-14 border border-slate-100 rounded-xl">
                                                <AvatarFallback className="bg-blue-50 text-blue-600 font-bold rounded-xl">{item.name?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <h4 className="font-bold text-base truncate">{item.name}</h4>
                                                    <Badge variant="secondary" className="text-[10px] h-5 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900 dark:text-green-300">
                                                        ₹{item.hourly_rate_cents ? item.hourly_rate_cents / 100 : 'N/A'}/hr
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate mb-2">
                                                    {item.professions && item.professions.length > 0 ? item.professions.join(", ") : "General Worker"}
                                                </p>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                                                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                                                        <Star className="w-3 h-3 fill-current" /> {item.rating_avg || "New"}
                                                    </span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {item.distance_m ? (item.distance_m / 1000).toFixed(1) + " km" : "Nearby"}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        // --- JOB CARD ---
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="font-bold text-base line-clamp-1">{item.title}</h4>
                                                <span className="text-green-600 dark:text-green-400 font-bold text-sm whitespace-nowrap ml-2">
                                                    ₹{item.pay_cents ? item.pay_cents / 100 : 'Offer'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-3 line-clamp-2 min-h-[2.5em]">
                                                {item.description || "No description provided for this job."}
                                            </p>
                                            <div className="flex gap-2 items-center">
                                                <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                                                    {item.price_type}
                                                </Badge>
                                                {item.is_remote && <Badge variant="secondary" className="text-[10px]">Remote</Badge>}
                                                <span className="text-[10px] text-muted-foreground ml-auto">
                                                    {item.distance_m ? (item.distance_m / 1000).toFixed(1) + " km away" : ""}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Promo Banner / Secondary Content */}
                <div className="mt-8 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white relative overflow-hidden shadow-lg">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-10 -mt-10" />
                    <div className="relative z-10 max-w-[80%]">
                        <h4 className="font-bold text-lg mb-1">Kaargar Premium</h4>
                        <p className="text-slate-300 text-xs mb-4">Get priority support and zero convenience fees on all your bookings.</p>
                        <Button size="sm" variant="secondary" className="text-xs h-8 bg-white text-slate-900 hover:bg-slate-100 border-0">Try Free for 30 Days</Button>
                    </div>
                </div>

                {/* Footer / Bottom Space */}
                <div className="h-20" />
            </div>

            <Sidebar
                open={sidebarOpen}
                onOpenChange={setSidebarOpen}
                user={user}
                mode={mode}
                setMode={setMode}
            />
        </div>
    );
};

export default Home;