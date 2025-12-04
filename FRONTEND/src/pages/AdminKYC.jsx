import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { API_BASE_URL } from "@/config";
import { Eye, CheckCircle, XCircle, Loader2, RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AdminKYC() {
  const [requests, setRequests] = useState([]);
  const [selectedReq, setSelectedReq] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/admin/kyc/pending`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      const json = await res.json();
      if (json.ok) {
        setRequests(json.data);
      } else {
        toast.error("Failed to fetch KYC requests");
      }
    } catch (error) {
      console.error("Error fetching KYC:", error);
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleInspect = (req) => {
    setSelectedReq(req);
    setRejectionReason("");
  };

  const handleDecision = async (status) => {
    if (!selectedReq) return;
    if (status === "rejected" && !rejectionReason) {
        return toast.warning("Please provide a rejection reason.");
    }

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${API_BASE_URL}/api/admin/kyc/${selectedReq.id}/review`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({
            status: status,
            reason: status === "rejected" ? rejectionReason : null
        })
      });

      if (res.ok) {
        toast.success(`Document ${status === 'verified' ? 'Approved' : 'Rejected'}`);
        setSelectedReq(null);
        fetchRequests(); // Refresh list
      } else {
        const err = await res.json();
        toast.error(err.detail || "Action failed");
      }
    } catch (error) {
      toast.error("Error processing request");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="flex h-[50vh] items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">KYC Verification</h2>
            <p className="text-slate-400 text-sm mt-1">Review identity documents submitted by workers.</p>
        </div>
        <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={fetchRequests} className="border-white/10 text-slate-300 hover:bg-white/5">
                <RefreshCw className="w-4 h-4 mr-2"/> Refresh
            </Button>
            <Badge variant="outline" className="text-yellow-400 border-yellow-500/20 bg-yellow-500/5 px-3 py-1 h-9 flex items-center">
            {requests.length} Pending
            </Badge>
        </div>
      </div>

      <Card className="bg-[#001c2b] border-white/10 shadow-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#00111a]">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-gray-400">User Details</TableHead>
                <TableHead className="text-gray-400">Document Type</TableHead>
                <TableHead className="text-gray-400">Uploaded</TableHead>
                <TableHead className="text-right text-gray-400">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="text-center text-gray-500 py-16">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                    No pending requests
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((req) => (
                  <TableRow key={req.id} className="border-white/5 hover:bg-white/5">
                    <TableCell>
                      <div className="font-medium text-cyan-400">{req.full_name || "Unknown User"}</div>
                      <div className="text-xs text-gray-500">{req.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/5 capitalize">
                            {req.doc_type?.replace("_", " ")}
                          </Badge>
                          {req.doc_number && <span className="text-xs text-slate-500 font-mono">{req.doc_number}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {new Date(req.uploaded_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => handleInspect(req)} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white h-8">
                        <Eye className="w-3 h-3 mr-2" /> Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* REVIEW DIALOG */}
      <Dialog open={!!selectedReq} onOpenChange={(open) => !open && setSelectedReq(null)}>
        <DialogContent className="bg-[#002637] border-white/10 text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Document</DialogTitle>
            <DialogDescription className="text-gray-400">Verify identity document for the user.</DialogDescription>
          </DialogHeader>
          
          <div className="grid md:grid-cols-2 gap-6 mt-2">
            {/* Image Preview */}
            <div className="bg-black/50 border border-white/10 rounded-lg flex items-center justify-center min-h-[300px] p-2 relative group">
              {selectedReq?.storage_path ? (
                <a href={selectedReq.storage_path} target="_blank" rel="noreferrer">
                    <img 
                        src={selectedReq.storage_path} 
                        className="max-h-[300px] w-auto rounded object-contain hover:opacity-90 transition-opacity cursor-zoom-in" 
                        alt="KYC Doc" 
                    />
                </a>
              ) : (
                <span className="text-gray-500 flex flex-col items-center gap-2"><FileText className="w-8 h-8"/> No Preview Available</span>
              )}
            </div>

            {/* Details & Actions */}
            <div className="space-y-6 flex flex-col h-full">
              <div className="space-y-4 flex-1">
                  <div className="space-y-1">
                    <Label className="text-gray-500 text-xs uppercase font-bold">User Name</Label>
                    <div className="font-medium text-lg text-white">{selectedReq?.full_name}</div>
                    <div className="text-sm text-cyan-400">{selectedReq?.email}</div>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-gray-500 text-xs uppercase font-bold">Document Details</Label>
                    <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="border-white/20 text-gray-300 uppercase">{selectedReq?.doc_type}</Badge>
                        <span className="font-mono bg-black/30 px-2 rounded text-sm border border-white/5 flex items-center">{selectedReq?.doc_number || "N/A"}</span>
                    </div>
                  </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/10">
                <div className="space-y-2">
                    <Label className="text-gray-400 text-xs uppercase">Rejection Reason (If rejecting)</Label>
                    <Input 
                        placeholder="e.g. Blurry image, invalid ID..." 
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="bg-[#00111a] border-white/10 text-white focus-visible:ring-cyan-500"
                    />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <Button 
                    onClick={() => handleDecision("rejected")} 
                    disabled={processing}
                    variant="destructive"
                    className="flex-1 bg-red-600/80 hover:bg-red-600"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin"/> : <><XCircle className="w-4 h-4 mr-2" /> Reject</>}
                  </Button>
                  <Button 
                    onClick={() => handleDecision("verified")} 
                    disabled={processing}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin"/> : <><CheckCircle className="w-4 h-4 mr-2" /> Approve</>}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}