import React, { useState, useEffect } from "react";
import { Loader2, Briefcase, MapPin, ShieldCheck, Clock, IndianRupee } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { supabase } from "@/lib/supabaseClient";
import { API_BASE_URL } from "../../config";

export default function SearchJob({ searchQuery, category }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Drawer State
  const [selectedJob, setSelectedJob] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [bidding, setBidding] = useState(false);

  // Helper: Format Currency
  const formatCurrency = (cents) => {
    if (!cents) return "₹0";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(cents / 100);
  };

  // 1. Fetch Jobs
  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const lat = 21.1458; // Hardcoded for MVP
        const lon = 79.0882;

        // Use Search endpoint if query exists, else Feed
        let endpoint = "/api/jobs/feed";
        const params = new URLSearchParams({ lat, lon, radius: 20000 });

        if (searchQuery) {
          endpoint = "/api/jobs/search"; // You created this in 2.7
          params.append("query", searchQuery);
        }
        // Note: Feed endpoint supports 'filter_by_profession' logic if we mapped category to user profession

        const res = await fetch(`${API_BASE_URL}${endpoint}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setJobs(data.results || data.jobs || []); // Handle both API response formats
        }
      } catch (err) {
        console.error("Job search error:", err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchJobs, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, category]);

  // 2. Handle Bid
  const handleBidSubmit = async () => {
    setBidding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/jobs/${selectedJob.id}/bids`, {
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
        toast.success("Bid placed successfully!");
        setDrawerOpen(false);
        setBidAmount("");
        setBidMessage("");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to place bid");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setBidding(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500 h-8 w-8" /></div>;
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/5 border-dashed">
        <p className="text-slate-500">No open jobs found nearby.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {jobs.map((item) => (
          <Card 
            key={item.job_id || item.id} // Handle different ID keys from diff endpoints
            onClick={() => { setSelectedJob(item); setDrawerOpen(true); }}
            className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-all cursor-pointer group"
          >
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-lg text-white line-clamp-1 group-hover:text-blue-400 transition-colors">{item.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    {item.category} • <Clock className="w-3 h-3" /> {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-sm font-bold px-2">
                  {formatCurrency(item.budget_max_cents)}
                </Badge>
              </div>

              <p className="text-sm text-slate-300 line-clamp-2">{item.description || "No description provided."}</p>

              <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {(item.distance_meters || item.dist_m ? ((item.distance_meters || item.dist_m)/1000).toFixed(1) : "0")} km
                </span>
                <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Verified Client</span>
              </div>
              
              <Button variant="secondary" className="w-full bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 h-9 text-xs mt-2">
                View Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* --- JOB DETAILS DRAWER --- */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="bg-slate-900 border-t border-white/10 text-slate-100 max-h-[90vh]">
          <div className="mx-auto w-full max-w-lg">
            <DrawerHeader>
              <DrawerTitle className="text-2xl font-bold text-white">{selectedJob?.title}</DrawerTitle>
              <DrawerDescription className="text-slate-400">Posted by {selectedJob?.customer_name || "Client"}</DrawerDescription>
            </DrawerHeader>
            
            <div className="p-4 space-y-6 overflow-y-auto">
              {/* Job Stats */}
              <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase">Budget</p>
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(selectedJob?.budget_max_cents)}</p>
                </div>
                <div className="h-8 w-[1px] bg-white/10" />
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase">Location</p>
                  <p className="text-lg font-bold text-white">{((selectedJob?.distance_meters || selectedJob?.dist_m || 0)/1000).toFixed(1)} km</p>
                </div>
                <div className="h-8 w-[1px] bg-white/10" />
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase">Type</p>
                  <p className="text-lg font-bold text-blue-400 capitalize">{selectedJob?.category}</p>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="font-bold text-white text-sm flex items-center gap-2"><Briefcase className="w-4 h-4" /> Description</h4>
                <p className="text-sm text-slate-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                  {selectedJob?.description}
                </p>
              </div>

              {/* Bidding Form */}
              <div className="space-y-4 pt-4 border-t border-white/10">
                <h4 className="font-bold text-white text-sm">Place a Bid</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Your Price (₹)</label>
                    <Input 
                      type="number" 
                      value={bidAmount} 
                      onChange={(e) => setBidAmount(e.target.value)} 
                      className="bg-white/5 border-white/10 text-white"
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Proposal Message</label>
                    <Textarea 
                      value={bidMessage} 
                      onChange={(e) => setBidMessage(e.target.value)} 
                      className="bg-white/5 border-white/10 text-white resize-none"
                      placeholder="I can do this job efficiently..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter>
              <Button onClick={handleBidSubmit} disabled={bidding} className="w-full bg-blue-600 hover:bg-blue-500 text-white h-12 text-lg">
                {bidding ? <Loader2 className="animate-spin" /> : "Submit Bid"}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline" className="border-white/10 text-slate-400 hover:bg-white/5 hover:text-white">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}