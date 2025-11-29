import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { 
  MessageSquare, AlertTriangle, Calendar, MapPin, 
  CheckCircle2, Clock, FileText, Upload, Plus, Trash2, 
  IndianRupee, ArrowLeft, Loader2, ShieldCheck, Mail, File
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Headback from "../components/Headback";

export default function JobStatus() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  
  // Worker Submission State
  const [submitOpen, setSubmitOpen] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const [billItems, setBillItems] = useState([{ item: "", price: "" }]);
  const [submitting, setSubmitting] = useState(false);

  // Customer Approval State
  const [approveOpen, setApproveOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintText, setComplaintText] = useState("");
  
  const pollingRef = useRef(null);

  // 1. Fetch
  const fetchJob = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!isBackground) navigate("/login"); return; }
      if (!user) setUser(session.user);
      const token = session.access_token;

      const res = await fetch(`http://localhost:8000/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
          const data = await res.json();
          setJob(data.job);
      } else {
          if (!isBackground) { toast.error("Access Denied"); navigate("/home"); }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchJob();
    pollingRef.current = setInterval(() => fetchJob(true), 5000);
    return () => clearInterval(pollingRef.current);
  }, [jobId]);

  // 2. File Upload (Signed URL Fix)
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedUrls = [];

    try {
      for (const file of files) {
        // Sanitize filename
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const path = `${jobId}/${Date.now()}_${sanitizedName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('JOB_PROOF')
          .upload(path, file);

        if (uploadError) throw uploadError;

        // FIX: Use createSignedUrl instead of getPublicUrl to avoid 404 on private buckets
        const { data, error: signError } = await supabase.storage
            .from('JOB_PROOF')
            .createSignedUrl(path, 60 * 60 * 24 * 365); // Valid for 1 year
            
        if (signError) throw signError;
        uploadedUrls.push(data.signedUrl);
      }
      setPhotos(prev => [...prev, ...uploadedUrls]);
      toast.success("Files uploaded successfully");
    } catch (e) { 
      console.error("Upload error:", e);
      toast.error("Upload failed: " + e.message); 
    }
    finally { setUploading(false); }
  };

  // 3. Bill Helpers
  const handleAddBillItem = () => setBillItems([...billItems, { item: "", price: "" }]);
  const handleRemoveBillItem = (index) => {
    const newItems = [...billItems];
    newItems.splice(index, 1);
    setBillItems(newItems);
  };
  const handleBillChange = (index, field, value) => {
    const newItems = [...billItems];
    newItems[index][field] = value;
    setBillItems(newItems);
  };
  const calculateTotal = () => billItems.reduce((acc, curr) => acc + (parseFloat(curr.price) || 0), 0);

  // 4. Submit Logic
  const handleSubmitWork = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const cleanBills = billItems.filter(i => i.item && i.price).map(i => ({ item: i.item, price: parseFloat(i.price) }));

      const res = await fetch(`http://localhost:8000/api/jobs/${jobId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ photos, comment: desc, bill_details: cleanBills })
      });

      if (res.ok) {
        toast.success("Submitted!");
        setSubmitOpen(false);
        fetchJob();
      }
    } catch (e) { toast.error("Error submitting"); }
    finally { setSubmitting(false); }
  };

  const handleApproveWork = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`http://localhost:8000/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        toast.success("Payment Released!");
        setApproveOpen(false);
        fetchJob();
      }
    } catch (e) { toast.error("Failed"); }
    finally { setSubmitting(false); }
  };

  const handleReport = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const targetId = user.id === job.customer_id ? job.worker_id : job.customer_id;
      
      const res = await fetch("http://localhost:8000/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            target_user_id: targetId,
            job_id: jobId,
            complaint_type: "job_dispute",
            subject: "Issue reported from Job Status",
            description: complaintText
        })
      });
      
      if (res.ok) {
          toast.success("Report Filed.");
          setComplaintOpen(false);
      }
    } catch(e) { toast.error("Report failed"); }
    finally { setSubmitting(false); }
  };

  const billTotal = useMemo(() => {
    if (!job?.bill_details) return 0;
    let details = job.bill_details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch (e) { return 0; }
    }
    if (!Array.isArray(details)) return 0;
    return details.reduce((acc, item) => acc + (parseFloat(item.price) || 0), 0);
  }, [job?.bill_details]);


  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  if (!job) return null;

  const isWorker = user?.id === job.worker_id;
  const isCustomer = user?.id === job.customer_id;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans relative">
      <Headback />

      <div className="relative z-10 px-6 py-6 flex items-center justify-between max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/home")} className="text-slate-400 hover:text-white -ml-4">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </Button>
        <div className="flex gap-2">
           <Button variant="outline" className="border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/10" onClick={() => setComplaintOpen(true)}>
             <AlertTriangle className="w-4 h-4 mr-2" /> Report
           </Button>
        </div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-2xl text-white">{job.title}</CardTitle>
              <CardDescription>{job.description}</CardDescription>
              <Badge className="bg-blue-600/20 text-blue-400 border-0 w-fit mt-2">{job.status.replace('_', ' ')}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-slate-500 uppercase">Budget</p>
                      <p className="text-lg font-bold text-emerald-400">₹{(job.budget_max_cents || 0) / 100}</p>
                   </div>
                   <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-slate-500 uppercase">Location</p>
                      <p className="text-sm text-white truncate">{job.city}</p>
                   </div>
                </div>
            </CardContent>
          </Card>

          {(job.status === 'in_progress' || job.status === 'completed') && job.worker_submitted_at && (
             <Card className="bg-slate-900 border-emerald-500/20 shadow-lg shadow-emerald-900/10">
                <CardHeader>
                   <CardTitle className="text-emerald-400 flex items-center gap-2"><FileText className="w-5 h-5" /> Work Submitted</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   <p className="text-slate-300 text-sm bg-white/5 p-3 rounded-lg">"{job.worker_comment}"</p>
                   
                   {billTotal > 0 && (
                     <div className="border border-white/10 rounded-lg overflow-hidden">
                        <div className="bg-white/5 p-2 text-xs font-bold text-slate-400 flex justify-between px-4"><span>Item</span><span>Cost</span></div>
                        {Array.isArray(job.bill_details) && job.bill_details.map((b, i) => (
                           <div key={i} className="p-2 flex justify-between px-4 text-sm border-t border-white/5 text-slate-300">
                              <span>{b.item}</span>
                              <span>₹{b.price}</span>
                           </div>
                        ))}
                        <div className="bg-emerald-500/10 p-2 px-4 flex justify-between text-emerald-400 font-bold text-sm border-t border-white/10">
                           <span>Total Extra</span>
                           <span>₹{billTotal}</span>
                        </div>
                     </div>
                   )}

                   {job.worker_proof_imgs && job.worker_proof_imgs.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                         {job.worker_proof_imgs.map((url, i) => (
                            <a href={url} target="_blank" key={i} rel="noreferrer">
                               <img src={url} className="h-24 w-24 object-cover rounded-lg border border-white/10 hover:scale-105 transition-transform" 
                                 onError={(e) => {e.target.style.display='none'}} 
                               />
                            </a>
                         ))}
                      </div>
                   )}
                </CardContent>
             </Card>
          )}
        </div>

        <div className="lg:col-span-1">
           <Card className="bg-gradient-to-b from-slate-900 to-slate-950 border-white/10 h-full">
             <CardHeader><CardTitle className="text-white">Actions</CardTitle></CardHeader>
             <CardContent className="space-y-4">
               
               {isWorker && (
                  job.status === 'assigned' || job.status === 'in_progress' ? (
                    <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
                      <DialogTrigger asChild><Button className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white text-lg shadow-lg shadow-blue-900/20">Submit Work</Button></DialogTrigger>
                      <DialogContent className="bg-slate-900 border-white/10 text-white">
                         <DialogHeader><DialogTitle>Submit Details</DialogTitle></DialogHeader>
                         <div className="space-y-4 py-4">
                            <Label>Description</Label>
                            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="bg-white/5 border-white/10" />
                            
                            <Label>Bill Items</Label>
                            {billItems.map((item, i) => (
                               <div key={i} className="flex gap-2">
                                  <Input placeholder="Item" value={item.item} onChange={(e) => {const n = [...billItems]; n[i].item = e.target.value; setBillItems(n)}} className="bg-white/5 border-white/10"/>
                                  <Input type="number" placeholder="₹" value={item.price} onChange={(e) => {const n = [...billItems]; n[i].price = e.target.value; setBillItems(n)}} className="bg-white/5 border-white/10 w-20"/>
                                  <Button size="icon" variant="ghost" onClick={() => setBillItems(billItems.filter((_, idx) => idx !== i))}><Trash2 className="w-4 h-4 text-red-400"/></Button>
                               </div>
                            ))}
                            <Button size="sm" variant="outline" onClick={() => setBillItems([...billItems, {item:'', price:''}])}><Plus className="w-4 h-4 mr-2"/> Add Item</Button>

                            <Label>Photos</Label>
                            <Input type="file" multiple onChange={handleFileUpload} className="bg-white/5 border-white/10" />
                         </div>
                         <Button onClick={handleSubmitWork} disabled={submitting || uploading} className="w-full bg-blue-600 text-white">{submitting ? <Loader2 className="animate-spin"/> : "Submit"}</Button>
                      </DialogContent>
                    </Dialog>
                  ) : <div className="text-center text-slate-500 italic">No actions available</div>
               )}

               {isCustomer && (
                  job.status === 'in_progress' && job.worker_submitted_at ? (
                     <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                       <DialogTrigger asChild>
                          <Button className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white text-lg shadow-lg shadow-emerald-900/20 animate-pulse">
                             Review & Pay
                          </Button>
                       </DialogTrigger>
                       <DialogContent className="bg-slate-900 border-white/10 text-white">
                          <DialogHeader>
                             <DialogTitle>Confirm Payment</DialogTitle>
                             <DialogDescription>Funds will be released to the worker.</DialogDescription>
                          </DialogHeader>
                          <div className="py-6 text-center">
                             <p className="text-sm text-slate-400 mt-1">Total Payable Amount</p>
                          </div>
                          <Button onClick={handleApproveWork} disabled={submitting} className="w-full bg-emerald-600 h-12 text-lg">{submitting ? <Loader2 className="animate-spin"/> : "Pay Now"}</Button>
                       </DialogContent>
                     </Dialog>
                  ) : <div className="text-center text-slate-500 italic">Waiting for worker...</div>
               )}

               <Button variant="outline" className="w-full border-white/10 text-slate-300 hover:bg-white/5" onClick={() => navigate(`/chat/${jobId}`)}>
                 <MessageSquare className="w-4 h-4 mr-2" /> Chat
               </Button>

             </CardContent>
           </Card>
        </div>

      </div>

      <Dialog open={complaintOpen} onOpenChange={setComplaintOpen}>
         <DialogContent className="bg-slate-900 border-white/10 text-white">
            <DialogHeader><DialogTitle>Report Issue</DialogTitle></DialogHeader>
            <Textarea placeholder="Describe the issue..." value={complaintText} onChange={(e) => setComplaintText(e.target.value)} className="bg-white/5 border-white/10 min-h-[100px]" />
            <Button onClick={handleReport} disabled={submitting} variant="destructive" className="w-full">{submitting ? <Loader2 className="animate-spin"/> : "Submit Report"}</Button>
         </DialogContent>
      </Dialog>

    </div>
  );
}