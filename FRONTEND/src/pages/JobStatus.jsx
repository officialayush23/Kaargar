import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { 
  MessageSquare, AlertTriangle, Calendar, MapPin, 
  CheckCircle2, Clock, FileText, Upload, Plus, Trash2, 
  IndianRupee, ArrowLeft, Loader2, ShieldCheck, Mail, File, Star
} from "lucide-react";
import { API_BASE_URL } from "../config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { Separator } from "../components/ui/separator";
import { toast } from "sonner";
import Headback from "../components/Headback";
import { Skeleton } from "@/components/ui/skeleton";


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
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  
  // Complaint State
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintData, setComplaintData] = useState({ type: "job_dispute", subject: "", description: "" });
  const [complaintEvidence, setComplaintEvidence] = useState([]);
  
  const pollingRef = useRef(null);

  // 1. Fetch Job Data
  const fetchJob = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!isBackground) navigate("/login"); return; }
      if (!user) setUser(session.user);
      const token = session.access_token;

      const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
          const data = await res.json();
          setJob(data.data); 
      } else {
          if (!isBackground) { toast.error("Access Denied or Job Not Found"); navigate("/home"); }
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

  // 2. File Upload Logic
  const handleFileUpload = async (e, bucket = 'JOB_PROOF') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedUrls = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const endpoint = bucket === 'complaint_proof' ? `/api/upload/complaint?job_id=${jobId}` : `/api/upload/proof?job_id=${jobId}`;
        
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: formData
        });

        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        uploadedUrls.push(data.url);
      }

      if (bucket === 'JOB_PROOF') {
          // Append new photos to existing list
          setPhotos(prev => [...prev, ...uploadedUrls]);
      } else {
          setComplaintEvidence(prev => [...prev, ...uploadedUrls]);
      }
      toast.success("Files uploaded");
    } catch (e) { 
      console.error("Upload error:", e);
      toast.error("Upload failed"); 
    } finally { 
      setUploading(false); 
    }
  };

  const handleSubmitWork = async () => {
    if (photos.length === 0) return toast.warning("Please upload at least one proof photo.");
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const cleanBills = billItems.filter(i => i.item && i.price).map(i => ({ item: i.item, price: parseFloat(i.price) }));

      const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/submit_work`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ worker_proof_imgs: photos, worker_comment: desc, bill_details: cleanBills })
      });

      if (res.ok) {
        toast.success("Work Submitted for Approval!");
        setSubmitOpen(false);
        fetchJob();
      } else { throw new Error("Failed"); }
    } catch (e) { toast.error("Error submitting work"); }
    finally { setSubmitting(false); }
  };

  const handleApproveAndPay = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/approve_work`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ rating: rating, customer_comment: reviewText })
      });

      if (res.ok) {
        toast.success("Payment Released & Job Completed!");
        setApproveOpen(false);
        fetchJob();
      } else { throw new Error("Approval failed"); }
    } catch (e) { toast.error("Failed to approve work"); }
    finally { setSubmitting(false); }
  };

  const handleReport = async () => {
    if (!complaintData.subject) return toast.warning("Subject is required");
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            job_id: jobId,
            complaint_type: complaintData.type,
            subject: complaintData.subject,
            description: complaintData.description,
            evidence_files: complaintEvidence,
            severity_level: 1
        })
      });
      
      if (res.ok) {
          toast.success("Report Filed Successfully.");
          setComplaintOpen(false);
          setComplaintData({ type: "job_dispute", subject: "", description: "" });
          setComplaintEvidence([]);
      } else { throw new Error("Report failed"); }
    } catch(e) { toast.error("Could not file report"); }
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

  const formatCurrency = (cents) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(cents / 100);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 p-6 flex justify-center pt-20">
       <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48 w-full bg-white/10 rounded-2xl" />
              <Skeleton className="h-64 w-full bg-white/10 rounded-2xl" />
           </div>
           <div className="lg:col-span-1">
              <Skeleton className="h-64 w-full bg-white/10 rounded-2xl" />
           </div>
       </div>
    </div>
  );

  if (!job) return null;

  const isWorker = user?.id === job.worker_id;
  const isCustomer = user?.id === job.customer_id;
  const statusColor = {
      'assigned': 'bg-blue-500', 'in_progress': 'bg-amber-500', 
      'pending_acceptance': 'bg-purple-500', 'completed': 'bg-emerald-500', 'cancelled': 'bg-red-500'
  }[job.status] || 'bg-slate-500';

  // Prepare proof images list (from job details)
  const proofImages = job.worker_proof_imgs || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans relative">
      <Headback />

      <div className="relative z-10 px-6 py-6 flex items-center justify-between max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/home")} className="text-slate-400 hover:text-white -ml-4">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </Button>
        <Button variant="outline" className="border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/10" onClick={() => setComplaintOpen(true)}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Report Issue
        </Button>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-6">
          
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <div className="flex justify-between items-start">
                 <div>
                    <CardTitle className="text-2xl text-white">{job.title}</CardTitle>
                    <CardDescription className="mt-1">Posted by {job.customer_name}</CardDescription>
                 </div>
                 <Badge className={`${statusColor} text-white border-0 px-3 py-1 text-sm capitalize`}>{job.status.replace('_', ' ')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 text-slate-300 text-sm leading-relaxed">
                    {job.description}
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-slate-500 uppercase font-bold">Agreed Price</p>
                      <p className="text-lg font-bold text-emerald-400">{formatCurrency(job.budget_max_cents || 0)}</p>
                   </div>
                   <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-slate-500 uppercase font-bold">Location</p>
                      <p className="text-sm text-white truncate">{job.city || "Remote"}</p>
                   </div>
                </div>
            </CardContent>
          </Card>

          {(job.status === 'pending_acceptance' || job.status === 'completed') && (
             <Card className="bg-slate-900 border-emerald-500/20 shadow-lg shadow-emerald-900/10">
                <CardHeader>
                   <CardTitle className="text-emerald-400 flex items-center gap-2"><FileText className="w-5 h-5" /> Work Submitted</CardTitle>
                   <CardDescription>Review the work details below.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                   {job.worker_comment && <div className="space-y-1"><Label className="text-xs uppercase text-slate-500 font-bold">Comment</Label><p className="text-slate-300 text-sm bg-white/5 p-3 rounded-lg italic">"{job.worker_comment}"</p></div>}
                   
                   {proofImages.length > 0 && (
                      <div className="space-y-2">
                          <p className="text-xs text-slate-500 uppercase font-bold">Proof Photos</p>
                          <div className="grid grid-cols-3 gap-2">
                             {proofImages.map((url, i) => (
                                <a href={url} target="_blank" key={i} rel="noreferrer" className="block relative group overflow-hidden rounded-lg border border-white/10">
                                   <img src={url} className="h-24 w-full object-cover transition-transform group-hover:scale-110" />
                                </a>
                             ))}
                          </div>
                      </div>
                   )}

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
                </CardContent>
             </Card>
          )}
        </div>

        <div className="lg:col-span-1 space-y-4">
           <Card className="bg-gradient-to-b from-slate-900 to-slate-950 border-white/10 h-fit sticky top-24">
             <CardHeader><CardTitle className="text-white">Actions</CardTitle></CardHeader>
             <CardContent className="space-y-4">
               
               {isWorker && (
                  job.status === 'assigned' || job.status === 'in_progress' ? (
                    <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
                      <DialogTrigger asChild><Button className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white text-lg font-bold shadow-lg shadow-blue-900/20">Submit Work</Button></DialogTrigger>
                      <DialogContent className="bg-slate-900 border-white/10 text-white max-h-[90vh] overflow-y-auto">
                          <DialogHeader><DialogTitle>Submit Job Completion</DialogTitle></DialogHeader>
                          <div className="space-y-4 py-4">
                             <div><Label>Work Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="bg-white/5 border-white/10 mt-1" placeholder="Describe what you did..." /></div>
                             <div>
                                <Label>Extra Bill Items (Parts/Material)</Label>
                                <div className="space-y-2 mt-1">
                                    {billItems.map((item, i) => (
                                       <div key={i} className="flex gap-2">
                                          <Input placeholder="Item Name" value={item.item} onChange={(e) => {const n = [...billItems]; n[i].item = e.target.value; setBillItems(n)}} className="bg-white/5 border-white/10"/>
                                          <Input type="number" placeholder="₹" value={item.price} onChange={(e) => {const n = [...billItems]; n[i].price = e.target.value; setBillItems(n)}} className="bg-white/5 border-white/10 w-24"/>
                                          <Button size="icon" variant="ghost" onClick={() => setBillItems(billItems.filter((_, idx) => idx !== i))}><Trash2 className="w-4 h-4 text-red-400"/></Button>
                                       </div>
                                    ))}
                                    <Button size="sm" variant="outline" onClick={() => setBillItems([...billItems, {item:'', price:''}])} className="w-full border-dashed border-white/20"><Plus className="w-4 h-4 mr-2"/> Add Item</Button>
                                </div>
                             </div>
                             <div>
                                <Label>Proof Photos</Label>
                                <Input type="file" multiple onChange={handleFileUpload} className="bg-white/5 border-white/10 mt-1" />
                                {uploading && <span className="text-xs text-blue-400 flex items-center gap-1 mt-1"><Loader2 className="w-3 h-3 animate-spin"/> Uploading...</span>}
                                {photos.length > 0 && (
                                    <div className="flex gap-2 mt-2 overflow-x-auto">
                                        {photos.map((url, i) => <img key={i} src={url} className="h-16 w-16 rounded object-cover border border-white/20" />)}
                                    </div>
                                )}
                             </div>
                          </div>
                          <Button onClick={handleSubmitWork} disabled={submitting || uploading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">{submitting ? <Loader2 className="animate-spin"/> : "Submit & Finish"}</Button>
                      </DialogContent>
                    </Dialog>
                  ) : <div className="text-center text-slate-500 text-sm bg-white/5 p-3 rounded-lg">Wait for customer approval or job start.</div>
               )}

               {isCustomer && (
                  job.status === 'pending_acceptance' ? (
                      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                        <DialogTrigger asChild>
                           <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-bold shadow-lg shadow-emerald-900/20 animate-pulse">
                              Review & Pay
                           </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-slate-900 border-white/10 text-white max-h-[90vh] overflow-y-auto">
                           <DialogHeader>
                              <DialogTitle>Approve & Pay</DialogTitle>
                              <DialogDescription>Release funds to the worker and rate them.</DialogDescription>
                           </DialogHeader>
                           
                           <div className="py-4 space-y-6">
                              {/* Payment Summary */}
                              <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 space-y-2">
                                 <div className="flex justify-between text-sm text-slate-300"><span>Base Price</span><span>{formatCurrency(job.budget_max_cents || 0)}</span></div>
                                 {billTotal > 0 && <div className="flex justify-between text-sm text-slate-300"><span>Extra Charges</span><span>{formatCurrency(billTotal * 100)}</span></div>}
                                 <Separator className="bg-emerald-500/20"/>
                                 <div className="flex justify-between items-end">
                                    <p className="text-xs text-emerald-400 uppercase tracking-wider">Total Payment</p>
                                    <p className="text-2xl font-bold text-white">{formatCurrency((job.budget_max_cents || 0) + billTotal * 100)}</p>
                                 </div>
                              </div>
                              
                              {/* Proof Preview (Small) */}
                              {proofImages.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-500 uppercase">Proof of Work</Label>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {proofImages.map((url, i) => (
                                            <img key={i} src={url} className="h-16 w-16 rounded object-cover border border-white/20 cursor-pointer hover:opacity-80" onClick={() => window.open(url, '_blank')} />
                                        ))}
                                    </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                 <Label>Rate the Worker</Label>
                                 <div className="flex gap-2 justify-center">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                       <Star key={star} className={`w-8 h-8 cursor-pointer transition-colors ${star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-600"}`} onClick={() => setRating(star)} />
                                    ))}
                                 </div>
                              </div>
                              <div className="space-y-2">
                                 <Label>Review (Optional)</Label>
                                 <Textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Great work!" className="bg-white/5 border-white/10" />
                              </div>
                           </div>

                           <Button onClick={handleApproveAndPay} disabled={submitting} className="w-full bg-emerald-600 h-12 text-lg font-bold">{submitting ? <Loader2 className="animate-spin"/> : "Confirm Payment"}</Button>
                        </DialogContent>
                      </Dialog>
                  ) : job.status === 'completed' ? (
                      <div className="text-center text-emerald-400 text-sm bg-emerald-500/10 p-3 rounded-lg font-medium border border-emerald-500/20">
                         Job Completed & Paid
                      </div>
                  ) : (
                      <div className="text-center text-slate-500 text-sm bg-white/5 p-3 rounded-lg">Waiting for worker submission...</div>
                  )
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
            <DialogHeader><DialogTitle>Report an Issue</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <Label>Issue Type</Label>
                    <Select value={complaintData.type} onValueChange={(val) => setComplaintData({...complaintData, type: val})}>
                        <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white">
                            <SelectItem value="job_dispute">Job Dispute</SelectItem>
                            <SelectItem value="behavioral">Behavioral Issue</SelectItem>
                            <SelectItem value="safety">Safety Concern</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input value={complaintData.subject} onChange={(e) => setComplaintData({...complaintData, subject: e.target.value})} className="bg-white/5 border-white/10"/>
                </div>
                <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={complaintData.description} onChange={(e) => setComplaintData({...complaintData, description: e.target.value})} className="bg-white/5 border-white/10 min-h-[100px]"/>
                </div>
                <div className="space-y-2">
                    <Label>Evidence</Label>
                    <Input type="file" multiple onChange={(e) => handleFileUpload(e, 'complaint_proof')} className="bg-white/5 border-white/10"/>
                </div>
            </div>
            <Button onClick={handleReport} disabled={submitting || uploading} variant="destructive" className="w-full">{submitting ? <Loader2 className="animate-spin"/> : "Submit Report"}</Button>
         </DialogContent>
      </Dialog>

    </div>
  );
}