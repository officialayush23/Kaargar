import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { 
  ArrowLeft, Loader2, Trash2, Users, CheckCircle2, Clock, 
  AlertCircle, Briefcase, User, IndianRupee, Calendar, Zap, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import Headback from "../components/Headback";
import { API_BASE_URL } from "../config";
import NotificationListener from "../components/use_ui/AuthenticatedLayout";

export default function UserPosted() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  
  // Bid Management State
  const [selectedJob, setSelectedJob] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [bidsDrawerOpen, setBidsDrawerOpen] = useState(false);
  const [hiringId, setHiringId] = useState(null);

  const fetchJobs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      const res = await fetch(`${API_BASE_URL}/api/me/jobs/posted`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleViewBids = async (job) => {
    setSelectedJob(job);
    setBidsDrawerOpen(true);
    setBidsLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/jobs/${job.id}/bids`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setBids(data.data || []);
      }
    } catch (err) {
      toast.error("Could not load bids");
    } finally {
      setBidsLoading(false);
    }
  };

  const handleHireBid = async (bidId) => {
    setHiringId(bidId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/jobs/hire`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          job_id: selectedJob.id,
          bid_id: bidId
        })
      });

      if (res.ok) {
        toast.success("Worker Hired Successfully!");
        setBidsDrawerOpen(false);
        fetchJobs(); 
        navigate(`/status/${selectedJob.id}`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to hire worker");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setHiringId(null);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!confirm("Are you sure you want to delete this job?")) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        toast.success("Job deleted");
        setJobs(jobs.filter(j => j.id !== jobId));
      } else {
        const err = await res.json();
        toast.error(err.detail || "Could not delete job");
      }
    } catch (err) {
      toast.error("Error deleting job");
    }
  };

  const formatCurrency = (cents) => {
    if (!cents) return "₹0";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'open': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'bidding': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'assigned': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'in_progress': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'pending_acceptance': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20 relative overflow-x-hidden">
      <Headback />
      <NotificationListener />

      <div className="relative z-20 px-6 py-6 flex items-center gap-4 max-w-5xl mx-auto">
        <Button variant="ghost" size="icon" onClick={() => navigate("/home")} className="text-slate-400 hover:text-white hover:bg-white/10 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <h1 className="text-2xl font-bold text-white tracking-tight">My Postings</h1>
      </div>

      <div className="max-w-5xl mx-auto px-4 relative z-10">
        {loading ? (
          <div className="space-y-4">
             <Skeleton className="h-10 w-64 bg-white/10 mb-6 rounded-lg" />
             {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 h-32 flex flex-col justify-between">
                   <div className="flex justify-between">
                      <div className="space-y-2">
                         <Skeleton className="h-6 w-48 bg-white/10" />
                         <Skeleton className="h-4 w-24 bg-white/10" />
                      </div>
                      <Skeleton className="h-6 w-20 bg-white/10 rounded-full" />
                   </div>
                   <div className="flex justify-end gap-2">
                      <Skeleton className="h-9 w-24 bg-white/10 rounded-lg" />
                      <Skeleton className="h-9 w-24 bg-white/10 rounded-lg" />
                   </div>
                </div>
             ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10">
            <Briefcase className="w-12 h-12 mx-auto text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-white">No Jobs Posted</h3>
            <p className="text-slate-400 mb-6">You haven't posted any jobs yet.</p>
            <Button onClick={() => navigate("/post_job")} className="bg-blue-600 hover:bg-blue-500 text-white">Post a Job</Button>
          </div>
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="bg-white/5 border border-white/10 mb-6 w-full justify-start overflow-x-auto no-scrollbar h-12 p-1 rounded-xl">
              <TabsTrigger value="active" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg h-full px-6">Active & Open</TabsTrigger>
              <TabsTrigger value="completed" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg h-full px-6">History</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {jobs.filter(j => ['open', 'bidding', 'assigned', 'in_progress', 'pending_acceptance', 'requested'].includes(j.status)).map(job => (
                <JobCard key={job.id} job={job} onDelete={handleDeleteJob} onViewBids={handleViewBids} getStatusColor={getStatusColor} formatCurrency={formatCurrency} navigate={navigate} />
              ))}
              {jobs.filter(j => ['open', 'bidding', 'assigned', 'in_progress', 'pending_acceptance', 'requested'].includes(j.status)).length === 0 && (
                <p className="text-slate-500 text-center py-8">No active jobs.</p>
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {jobs.filter(j => ['completed', 'cancelled'].includes(j.status)).map(job => (
                <JobCard key={job.id} job={job} onDelete={handleDeleteJob} onViewBids={handleViewBids} getStatusColor={getStatusColor} formatCurrency={formatCurrency} navigate={navigate} />
              ))}
              {jobs.filter(j => ['completed', 'cancelled'].includes(j.status)).length === 0 && (
                <p className="text-slate-500 text-center py-8">No job history.</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Drawer open={bidsDrawerOpen} onOpenChange={setBidsDrawerOpen}>
        <DrawerContent className="bg-slate-950 border-t border-white/10 text-white max-h-[85vh]">
          <div className="mx-auto w-full max-w-2xl h-full flex flex-col">
            <DrawerHeader>
              <DrawerTitle className="text-2xl">Applicants for "{selectedJob?.title}"</DrawerTitle>
              <DrawerDescription className="text-slate-400">Review bids and hire the best fit.</DrawerDescription>
            </DrawerHeader>
            
            <ScrollArea className="flex-1 p-4">
              {bidsLoading ? (
                 <div className="space-y-4">
                    {[1,2].map(i => (
                       <div key={i} className="bg-white/5 rounded-xl p-4 flex gap-4">
                          <Skeleton className="h-12 w-12 rounded-full bg-white/10" />
                          <div className="flex-1 space-y-2">
                             <Skeleton className="h-4 w-1/3 bg-white/10" />
                             <Skeleton className="h-3 w-1/2 bg-white/10" />
                          </div>
                       </div>
                    ))}
                 </div>
              ) : bids.length === 0 ? (
                 <div className="text-center py-10 text-slate-500">No bids received yet.</div>
              ) : (
                 <div className="space-y-4">
                   {bids.map((bid) => (
                     <div key={bid.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:bg-white/[0.07] transition-colors">
                        <div className="flex gap-4 items-center w-full sm:w-auto">
                           <Avatar className="h-12 w-12 border border-white/10">
                             <AvatarImage src={bid.avatar_url} />
                             <AvatarFallback className="bg-slate-800 text-blue-400 font-bold">{bid.full_name?.[0] || "U"}</AvatarFallback>
                           </Avatar>
                           <div>
                             <div className="flex items-center gap-2">
                                 <h4 className="font-bold text-white text-lg">{bid.full_name || "Worker"}</h4>
                                 <div className="flex text-amber-400 text-xs items-center bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                     <Star className="w-3 h-3 fill-current mr-1"/>
                                     <span className="font-bold">{bid.rating || "New"}</span>
                                 </div>
                             </div>
                             <div className="flex flex-wrap gap-2 mt-1">
                               {bid.professions && bid.professions.map(p => (
                                   <Badge key={p} variant="outline" className="text-[10px] border-white/20 text-slate-400 bg-white/5">{p}</Badge>
                               ))}
                               <span className="text-xs text-slate-500">{bid.experience_years || 0} Yrs Exp</span>
                             </div>
                           </div>
                        </div>
                        <div className="flex-1 w-full sm:w-auto pl-0 sm:pl-4 border-l-0 sm:border-l border-white/10 flex flex-col sm:items-end gap-3 mt-3 sm:mt-0">
                          {bid.message && <p className="text-sm text-slate-300 italic line-clamp-2 sm:text-right w-full">"{bid.message}"</p>}
                          <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                             <span className="text-xl font-bold text-emerald-400 font-mono">{formatCurrency(bid.amount_cents)}</span>
                             <Button 
                               size="sm" 
                               onClick={() => handleHireBid(bid.id)} 
                               disabled={hiringId === bid.id}
                               className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 h-10"
                             >
                               {hiringId === bid.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Hire"}
                             </Button>
                          </div>
                        </div>
                     </div>
                   ))}
                 </div>
              )}
            </ScrollArea>
            <DrawerFooter>
              <DrawerClose asChild><Button variant="outline" className="border-white/10 text-slate-400 hover:bg-white/10 hover:text-white">Close</Button></DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

const JobCard = ({ job, onDelete, onViewBids, getStatusColor, formatCurrency, navigate }) => {
  const isPending = ['open', 'bidding'].includes(job.status);
  const isOngoing = ['assigned', 'in_progress', 'pending_acceptance'].includes(job.status);
  
  return (
    <Card className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-colors">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg text-white font-bold line-clamp-1">{job.title}</CardTitle>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <Clock className="w-3 h-3" /> Posted on {new Date(job.created_at).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className={`${getStatusColor(job.status)} border-0 uppercase text-[10px] font-bold px-2 py-1`}>
          {job.status.replace('_', ' ')}
        </Badge>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
             {job.worker_name ? (
               <div className="flex items-center gap-2 text-sm text-slate-300">
                 <User className="w-4 h-4 text-blue-400" /> 
                 Hired: <span className="font-semibold text-white">{job.worker_name}</span>
               </div>
             ) : (
               <div className="flex items-center gap-2 text-sm text-slate-300">
                 <Users className="w-4 h-4 text-slate-500" /> 
                 {job.bid_count !== undefined ? `${job.bid_count} Bids` : "Waiting for applicants"}
               </div>
             )}
          </div>
          <div className="text-right">
             <p className="text-xs text-slate-500 uppercase">Budget</p>
             <p className="text-lg font-bold text-emerald-400">{formatCurrency(job.budget_max_cents)}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 flex gap-3 justify-end border-t border-white/5 p-4">
        {isPending && (
          <>
            <Button variant="ghost" size="sm" onClick={() => onDelete(job.id)} className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-9">
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
            <Button size="sm" onClick={() => onViewBids(job)} className="bg-blue-600 hover:bg-blue-500 text-white h-9">
              View Applicants
            </Button>
          </>
        )}
        
        {isOngoing && (
           <Button size="sm" variant="secondary" onClick={() => navigate(`/status/${job.id}`)} className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 h-9">
             Track Status
           </Button>
        )}
        
        {job.status === 'completed' && (
           <Button size="sm" variant="outline" className="border-white/10 text-slate-400 h-9" disabled>
             Archived
           </Button>
        )}
      </CardFooter>
    </Card>
  );
};