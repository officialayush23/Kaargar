import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Star, Loader2, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";

export default function SearchWorker({ searchQuery, category }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Helper: Format Currency
  const formatCurrency = (cents) => {
    if (!cents) return "₹0";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(cents / 100);
  };

  useEffect(() => {
    const fetchWorkers = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Hardcoded Coords (Replace with real geolocation later)
        const lat = 21.1458;
        const lon = 79.0882;

        const params = new URLSearchParams({
          lat, lon, radius: 20000
        });

        if (category) params.append("profession", category);
        if (searchQuery) params.append("service", searchQuery); // Search by service tag

        const res = await fetch(`http://localhost:8000/api/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setWorkers(data.results || []);
        }
      } catch (err) {
        console.error("Worker search error:", err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchWorkers, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, category]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500 h-8 w-8" /></div>;
  }

  if (workers.length === 0) {
    return (
      <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/5 border-dashed">
        <p className="text-slate-500">No professionals found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {workers.map((item) => (
        <Card key={item.worker_id} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-all group">
          <CardContent className="p-5">
            <div className="flex gap-4">
              <Avatar className="h-16 w-16 rounded-2xl border-2 border-white/10">
                <AvatarImage src={item.avatar_url} />
                <AvatarFallback className="bg-slate-800 text-blue-400 font-bold text-lg">
                  {item.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-lg text-white truncate">{item.name}</h4>
                  <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded text-amber-400 text-xs font-bold">
                    <Star className="w-3 h-3 fill-current" /> {item.rating_avg || "New"}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 border-0">
                    {item.worker_type}
                  </Badge>
                  <span className="text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {(item.distance_meters / 1000).toFixed(1)} km
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {item.services && item.services.slice(0, 3).map((s, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/5">{s}</span>
                  ))}
                </div>
              </div>
            </div>
            
            <Separator className="my-4 bg-white/10" />
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Starting At</p>
                <p className="text-lg font-bold text-white">
                  {formatCurrency(item.min_hourly_rate_cents)}
                  <span className="text-xs font-normal text-slate-500">/hr</span>
                </p>
              </div>
              
              <Button 
                onClick={() => navigate("/enter_job_details", { state: { workerId: item.worker_id } })}
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]"
              >
                Hire Now
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}