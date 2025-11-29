import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { 
  MessageSquare, AlertTriangle, Calendar, MapPin, 
  CheckCircle2, Clock, FileText, Upload, Plus, Trash2, 
  IndianRupee, ArrowLeft, Loader2, ShieldCheck, Mail, File,
  Navigation, XCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
  
  // Worker Accept/Decline State
  const [actionLoading, setActionLoading] = useState(false);

  // Customer Approval State
  const [approveOpen, setApproveOpen] = useState(false);

  // 1. Fetch Job Details
  const fetchJob = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      setUser(session.user);
      const token = session.access_token;

      // We can try fetching from both worked/posted lists to find the job details
      // Or if you implement a direct GET /api/jobs/{id}, use that.
      // For now, we check both lists to be safe since user could be either role.
      
      const [resPosted, resWorked] = await Promise.all([
          fetch("http://localhost:8000/api/me/jobs/posted", { headers: { Authorization: `Bearer ${token}` }}),
          fetch("http://localhost:8000/api/me/jobs/worked", { headers: { Authorization: `Bearer ${token}` }})
      ]);

      let foundJob = null;
      if (resPosted.ok) {
          const data = await resPosted.json();
          foundJob = data.jobs.find(j => j.id === jobId) || foundJob;
      }
      if (resWorked.ok && !foundJob) {
          const data = await resWorked.json();
          foundJob = data.jobs.find(j => j.id === jobId) || foundJob;
      }

      if (foundJob) {
        setJob(foundJob);
      } else {
        toast.error("Job not found or access denied");
        navigate("/home");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading job");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJob();
  }, [jobId, navigate]);

  // 2. File Upload Handler
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedUrls = [];

    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${jobId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('JOB_PROOF')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('JOB_PROOF').getPublicUrl(filePath);
        uploadedUrls.push(data.publicUrl);
      }
      setPhotos(prev => [...prev, ...uploadedUrls]);
      toast.success("Files uploaded successfully");
    } catch (error) {
      toast.error("Upload failed: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // 3. Bill Handlers
  const handleAddBillItem = () => {
    setBillItems([...billItems, { item: "", price: "" }]);
  };

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

  const calculateTotal = () => {
    return billItems.reduce((acc, curr) => acc + (parseFloat(curr.price) || 0), 0);
  };

  // 4. Submit Work Logic
  const handleSubmitWork = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const cleanBills = billItems
        .filter(i => i.item && i.price)
        .map(i => ({ item: i.item, price: parseFloat(i.price) }));

      const res = await fetch(`http://localhost:8000/api/jobs/${jobId}/proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          photos: photos,
          comment: desc,
          bill_details: cleanBills
        })
      });

      if (res.ok) {
        toast.success("Work Submitted! Customer notified.");
        setSubmitOpen(false);
        fetchJob();
      } else {
        throw new Error("Submission failed");
      }
    } catch (e) {
      toast.error("Error submitting work");
    } finally {
      setSubmitting(false);
    }
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
        toast.success("Job Completed! Payment Released.");
        setApproveOpen(false);
        fetchJob();
      }
    } catch (e) {
      toast.error("Approval failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  if (!job) return null;

  // SECURITY FIX: Ensure only the assigned worker is treated as the worker
  // If user is customer (job owner), they are NOT the worker.
  // If user is not the customer, check if they are the assigned worker for safety.
  const isWorker = user?.id !== job.customer_id; // Basic check (Viewer != Owner)
  
  // Status Mapping
  let statusStep = 1;
  if (job.status === 'pending_acceptance') statusStep = 2;
  if (job.status === 'assigned') statusStep = 3;
  if (job.status === 'in_progress') statusStep = 4;
  if (job.status === 'completed') statusStep = 5;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans relative">
      <Headback />

      {/* Header */}
      <div className="relative z-10 px-6 py-6 flex items-center justify-between max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(isWorker ? "/dashboard" : "/my_postings")} className="text-slate-400 hover:text-white -ml-4">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </Button>
        <Badge variant="outline" className="uppercase border-blue-500/30 text-blue-400 tracking-wider">
          ID: {job.id.slice(0,8)}
        </Badge>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT: Job Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Status Card */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle className="text-2xl text-white">{job.title}</CardTitle>
                <Badge className={`uppercase text-[10px] ${
                    job.status === 'completed' ? 'bg-emerald-500 text-white' : 
                    job.status === 'in_progress' ? 'bg-blue-600 text-white' : 
                    job.status === 'pending_acceptance' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300'
                }`}>
                    {job.status.replace('_', ' ')}
                </Badge>
              </div>
              <CardDescription className="text-slate-400">
                 {job.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Address Block */}
              <div className="mb-8 p-4 bg-white/5 rounded-xl border border-white/10">
                 <p className="text-xs text-slate-500 uppercase font-bold mb-2 flex items-center gap-1">
                    <Navigation className="w-3 h-3" /> Job Location
                 </p>
                 <p className="text-sm text-white font-medium">{job.address_text || "Address not provided"}</p>
                 <p className="text-sm text-slate-400">{job.city} {job.pincode ? `- ${job.pincode}` : ""}</p>
              </div>

              {/* Timeline */}
              <div className="relative flex items-center justify-between mb-8 px-2">
                <div className="absolute left-0 top-1/2 h-0.5 w-full bg-white/10 -z-10" />
                
                <div className={`flex flex-col items-center gap-2 bg-slate-950 p-2 rounded-full z-10 ${statusStep >= 1 ? "text-blue-500" : "text-slate-600"}`}>
                  <div className={`w-4 h-4 rounded-full ${statusStep >= 1 ? "bg-blue-500" : "bg-slate-800"}`} />
                  <span className="text-[10px] uppercase font-bold">Posted</span>
                </div>
                <div className={`flex flex-col items-center gap-2 bg-slate-950 p-2 rounded-full z-10 ${statusStep >= 3 ? "text-blue-500" : "text-slate-600"}`}>
                  <div className={`w-4 h-4 rounded-full ${statusStep >= 3 ? "bg-blue-500" : "bg-slate-800"}`} />
                  <span className="text-[10px] uppercase font-bold">Hired</span>
                </div>
                <div className={`flex flex-col items-center gap-2 bg-slate-950 p-2 rounded-full z-10 ${statusStep >= 4 ? "text-amber-500" : "text-slate-600"}`}>
                  <div className={`w-4 h-4 rounded-full ${statusStep >= 4 ? "bg-amber-500" : "bg-slate-800"}`} />
                  <span className="text-[10px] uppercase font-bold">Work</span>
                </div>
                <div className={`flex flex-col items-center gap-2 bg-slate-950 p-2 rounded-full z-10 ${statusStep >= 5 ? "text-emerald-500" : "text-slate-600"}`}>
                  <div className={`w-4 h-4 rounded-full ${statusStep >= 5 ? "bg-emerald-500" : "bg-slate-800"}`} />
                  <span className="text-[10px] uppercase font-bold">Paid</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                    <p className="text-xs text-slate-500 uppercase">Role</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-medium text-white">{isWorker ? "Worker" : "Customer"}</span>
                    </div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                    <p className="text-xs text-slate-500 uppercase">Budget</p>
                    <div className="flex items-center gap-2 mt-1">
                        <IndianRupee className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-white">{(job.amount_cents || 0) / 100}</span>
                    </div>
                  </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions Grid */}
          <div className="grid grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              className="h-14 border-white/10 bg-white/5 hover:bg-white/10 text-white"
              onClick={() => navigate(`/chat/${job.id}`)}
            >
              <MessageSquare className="w-5 h-5 mr-2 text-blue-400" /> Chat
            </Button>
            <Button 
              variant="outline" 
              className="h-14 border-white/10 bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-slate-300"
              onClick={() => navigate("/report")}
            >
              <AlertTriangle className="w-5 h-5 mr-2" /> Report Issue
            </Button>
          </div>

        </div>

        {/* RIGHT: Action Panel */}
        <div className="lg:col-span-1">
           <Card className="bg-gradient-to-b from-slate-900 to-slate-950 border-white/10 h-full shadow-2xl">
             <CardHeader>
               <CardTitle className="text-xl text-white">Action Required</CardTitle>
               <CardDescription>Next steps for this job.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-6">
               
               {/* WORKER VIEW */}
               {isWorker ? (
                 job.status === 'assigned' || job.status === 'in_progress' ? (
                   <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
                     <DialogTrigger asChild>
                       <Button className="w-full h-16 text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] animate-pulse">
                         <CheckCircle2 className="w-6 h-6 mr-2" /> Submit Work
                       </Button>
                     </DialogTrigger>
                     <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
                       <DialogHeader>
                         <DialogTitle>Submit Proof of Work</DialogTitle>
                         <DialogDescription>Upload photos and bill details.</DialogDescription>
                       </DialogHeader>
                       
                       <div className="space-y-6 py-4">
                         {/* Upload */}
                         <div className="space-y-2">
                            <Label>Photos & Documents</Label>
                            <div className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:border-blue-500/50 transition-colors cursor-pointer bg-white/5 relative">
                              <input type="file" multiple onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                              <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                              <p className="text-sm text-slate-400">{uploading ? "Uploading..." : "Tap to upload"}</p>
                            </div>
                            {photos.length > 0 && <p className="text-xs text-emerald-400">{photos.length} files attached</p>}
                         </div>

                         {/* Bill Generator */}
                         <div className="space-y-3">
                           <div className="flex justify-between items-center">
                             <h4 className="text-sm font-bold text-white">Bill of Materials</h4>
                             <Button size="sm" variant="ghost" onClick={handleAddBillItem}><Plus className="w-4 h-4" /></Button>
                           </div>
                           {billItems.map((item, idx) => (
                             <div key={idx} className="flex gap-2">
                               <Input 
                                 placeholder="Item Name" 
                                 className="bg-white/5 border-white/10" 
                                 value={item.item}
                                 onChange={(e) => handleBillChange(idx, 'item', e.target.value)}
                               />
                               <Input 
                                 type="number" 
                                 placeholder="Price" 
                                 className="bg-white/5 border-white/10 w-24" 
                                 value={item.price}
                                 onChange={(e) => handleBillChange(idx, 'price', e.target.value)}
                               />
                               <Button size="icon" variant="ghost" onClick={() => handleRemoveBillItem(idx)} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
                             </div>
                           ))}
                           <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/10">
                             <span>Total Bill:</span>
                             <span className="text-emerald-400">₹{calculateTotal()}</span>
                           </div>
                         </div>

                         <Textarea 
                           placeholder="Describe the work done..." 
                           className="bg-white/5 border-white/10 min-h-[100px]"
                           value={desc}
                           onChange={(e) => setDesc(e.target.value)}
                         />
                       </div>

                       <DialogFooter>
                         <Button onClick={handleSubmitWork} disabled={submitting || uploading} className="w-full bg-blue-600 text-white">
                           {submitting ? <Loader2 className="animate-spin" /> : "Submit & Notify Customer"}
                         </Button>
                       </DialogFooter>
                     </DialogContent>
                   </Dialog>
                 ) : job.status === 'completed' ? (
                   <div className="text-center p-6 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                     <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
                     <h3 className="text-emerald-400 font-bold">Job Completed</h3>
                     <p className="text-xs text-emerald-500/70">Payment has been released to your wallet.</p>
                   </div>
                 ) : (
                   <div className="text-center p-6 text-slate-500 italic">Waiting for job to start...</div>
                 )
               ) : (
                 // CUSTOMER VIEW
                 job.status === 'in_progress' ? ( 
                    <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                      <DialogTrigger asChild>
                        <Button className="w-full h-16 text-lg font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-pulse">
                          Review & Pay
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-white/10 text-white">
                        <DialogHeader>
                          <DialogTitle>Review Work</DialogTitle>
                          <DialogDescription>Confirm the details to release payment.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4 text-center space-y-4">
                           <FileText className="w-12 h-12 mx-auto text-slate-500" />
                           <p className="text-slate-300">Worker has submitted proof of work.</p>
                           <div className="bg-white/5 p-4 rounded-lg text-left">
                              <p className="text-xs text-slate-500 uppercase mb-2">Summary</p>
                              <p className="text-sm">Work completed as per requirement.</p>
                              <p className="text-sm mt-2 text-emerald-400 font-bold">Total to Pay: ₹{(job.amount_cents || 0)/100}</p>
                           </div>
                        </div>
                        <DialogFooter>
                           <Button onClick={handleApproveWork} disabled={submitting} className="w-full bg-emerald-600 text-white">
                             {submitting ? <Loader2 className="animate-spin" /> : "Approve & Release Funds"}
                           </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                 ) : job.status === 'completed' ? (
                    <div className="text-center p-6 bg-white/5 rounded-xl border border-white/10">
                      <CheckCircle2 className="w-12 h-12 mx-auto text-slate-500 mb-2" />
                      <h3 className="text-white font-bold">Job Closed</h3>
                      <p className="text-xs text-slate-500">Thank you for using Kaargar.</p>
                    </div>
                 ) : (
                    <div className="text-center p-6 text-slate-500 italic">Worker is working on your job...</div>
                 )
               )}

             </CardContent>
           </Card>
        </div>

      </div>
    </div>
  );
}