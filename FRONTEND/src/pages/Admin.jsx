import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { API_BASE_URL } from "../config";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Loader2, Check, X, ShieldAlert, FileText, User } from "lucide-react";

// Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function Admin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kycRequests, setKycRequests] = useState([]);
  const [complaints, setComplaints] = useState([]);
  
  // Review Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // 1. Initial Load
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      
      const token = session.access_token;

      // Parallel fetch: Pending KYC & Complaints
      const [kycRes, compRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/kyc/pending`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/admin/complaints?status_filter=pending`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (kycRes.ok) {
        const kycData = await kycRes.json();
        setKycRequests(kycData.data || []);
      } else {
        // If 403, likely not admin
        if(kycRes.status === 403) {
            toast.error("Access Denied: Admin only.");
            navigate("/home");
            return;
        }
      }

      if (compRes.ok) {
        const compData = await compRes.json();
        setComplaints(compData.data || []);
      }

    } catch (e) {
      console.error("Admin fetch error:", e);
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  // 2. KYC Action
  const handleKycReview = async (status) => {
    if (status === 'rejected' && !rejectReason) {
        toast.warning("Please provide a rejection reason.");
        return;
    }
    setActionLoading(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch(`${API_BASE_URL}/api/admin/kyc/${selectedItem.id}/review`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ 
                status: status, 
                reason: rejectReason 
            })
        });

        if (res.ok) {
            toast.success(`KYC ${status === 'verified' ? 'Approved' : 'Rejected'}`);
            setReviewModalOpen(false);
            fetchData(); // Refresh list
        } else {
            const err = await res.json();
            toast.error(err.detail || "Action failed");
        }
    } catch (e) {
        toast.error("Network error");
    } finally {
        setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 h-8 w-8" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <ShieldAlert className="w-8 h-8 text-red-500" /> Admin Console
                </h1>
                <p className="text-slate-400 mt-1">Manage verification and safety.</p>
            </div>
            <Button variant="outline" onClick={fetchData} className="border-white/10 text-slate-300">Refresh</Button>
        </div>

        <Tabs defaultValue="kyc" className="w-full">
            <TabsList className="bg-white/5 border border-white/10 p-1">
                <TabsTrigger value="kyc" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">KYC Requests <Badge className="ml-2 bg-white/20 text-white">{kycRequests.length}</Badge></TabsTrigger>
                <TabsTrigger value="complaints" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">Complaints <Badge className="ml-2 bg-white/20 text-white">{complaints.length}</Badge></TabsTrigger>
            </TabsList>

            {/* --- KYC TAB --- */}
            <TabsContent value="kyc" className="space-y-4 mt-6">
                {kycRequests.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 italic bg-white/5 rounded-xl border border-dashed border-white/10">No pending KYC requests.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {kycRequests.map(req => (
                            <Card key={req.id} className="bg-white/5 border-white/10 overflow-hidden">
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <Badge variant="outline" className="border-blue-500/30 text-blue-400 uppercase text-[10px]">{req.doc_type}</Badge>
                                        <span className="text-xs text-slate-500">{new Date(req.uploaded_at).toLocaleDateString()}</span>
                                    </div>
                                    <CardTitle className="text-lg text-white mt-2">{req.full_name}</CardTitle>
                                    <CardDescription className="text-slate-400 flex items-center gap-1"><User className="w-3 h-3"/> {req.worker_type}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Image Preview (You might need signed URLs or proxy if bucket private) */}
                                    <div className="aspect-video bg-black/40 rounded-lg flex items-center justify-center border border-white/5 overflow-hidden relative group">
                                        <img 
                                            src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/KYC_DOCS/${req.storage_path}`} 
                                            alt="Doc" 
                                            className="w-full h-full object-contain"
                                            onError={(e) => { e.target.style.display='none'; }}
                                        />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <a 
                                                href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/KYC_DOCS/${req.storage_path}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="text-white text-xs underline"
                                            >
                                                View Full Size
                                            </a>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <Button onClick={() => { setSelectedItem(req); setReviewModalOpen(true); }} className="w-full bg-white/10 hover:bg-white/20 text-white">Review</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </TabsContent>

            {/* --- COMPLAINTS TAB --- */}
            <TabsContent value="complaints" className="mt-6">
                {complaints.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 italic bg-white/5 rounded-xl border border-dashed border-white/10">No pending complaints.</div>
                ) : (
                    <div className="space-y-3">
                        {complaints.map(comp => (
                            <div key={comp.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <Badge variant="destructive" className="uppercase text-[10px]">{comp.complaint_type}</Badge>
                                        <span className="text-xs text-slate-500">Reported by {comp.reporter_name}</span>
                                    </div>
                                    <h3 className="font-bold text-white text-lg">{comp.subject}</h3>
                                    <p className="text-slate-300 text-sm mt-1">{comp.description}</p>
                                </div>
                                <Button size="sm" variant="secondary">Resolve</Button>
                            </div>
                        ))}
                    </div>
                )}
            </TabsContent>
        </Tabs>

        {/* REVIEW DIALOG */}
        <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
            <DialogContent className="bg-slate-900 border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Review Document</DialogTitle>
                    <DialogDescription>Action for {selectedItem?.full_name}'s {selectedItem?.doc_type}</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Rejection Reason (If rejecting)</label>
                        <Textarea 
                            placeholder="e.g. Image blurry, Name mismatch..." 
                            value={rejectReason} 
                            onChange={(e) => setRejectReason(e.target.value)} 
                            className="bg-white/5 border-white/10 min-h-[80px]"
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button 
                        variant="destructive" 
                        onClick={() => handleKycReview('rejected')} 
                        disabled={actionLoading}
                        className="w-full sm:w-auto"
                    >
                        {actionLoading ? <Loader2 className="animate-spin" /> : <><X className="w-4 h-4 mr-2" /> Reject</>}
                    </Button>
                    <Button 
                        onClick={() => handleKycReview('verified')} 
                        disabled={actionLoading}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                        {actionLoading ? <Loader2 className="animate-spin" /> : <><Check className="w-4 h-4 mr-2" /> Approve & Verify</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}