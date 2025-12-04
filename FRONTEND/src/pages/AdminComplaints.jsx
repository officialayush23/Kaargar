import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { API_BASE_URL } from "@/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
    Loader2, CheckCircle, Ban, FileText, ExternalLink, RefreshCw, Briefcase, RotateCcw
} from "lucide-react";
import { toast } from "sonner";

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    setLoading(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${API_BASE_URL}/api/admin/complaints`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const json = await res.json();
        if (json.ok) setComplaints(json.data);
        else toast.error("Failed to fetch complaints");
    } catch (e) {
        console.error(e);
        toast.error("Network error");
    } finally {
        setLoading(false);
    }
  };

  const handleResolve = async (status, complaintId = null) => {
    // If ID passed directly (quick action), use it. Otherwise use selectedComplaint.id
    const targetId = complaintId || selectedComplaint?.id;
    
    if (!targetId) return;

    if (!notes && status !== 'investigating') {
        return toast.warning("Please add a resolution note.");
    }
    
    setResolving(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${API_BASE_URL}/api/admin/complaints/${targetId}/resolve`, {
            method: "PATCH",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}` 
            },
            body: JSON.stringify({
                status: status,
                resolution_notes: notes || (status === 'investigating' ? "Marked as investigating" : "Resolved by admin")
            })
        });

        if (res.ok) {
            const statusText = status.replace('resolved_', '').replace('_', ' ');
            toast.success(`Complaint marked as ${statusText}`);
            setResolveOpen(false);
            setNotes("");
            fetchComplaints(); 
        } else {
            const err = await res.json();
            toast.error(err.detail || "Action failed");
        }
    } catch (e) {
        toast.error("Error resolving complaint");
    } finally {
        setResolving(false);
    }
  };

  const openResolveDialog = (c) => {
      setSelectedComplaint(c);
      setNotes("");
      setResolveOpen(true);
  };

  const getSeverityBadge = (level) => {
    if (level >= 4) return <Badge className="bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30">High Severity</Badge>;
    if (level >= 2) return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50 hover:bg-orange-500/30">Medium</Badge>;
    return <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30">Low</Badge>;
  };

  const getStatusBadge = (status) => {
      const styles = {
          'pending': "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
          'investigating': "bg-purple-500/10 text-purple-400 border-purple-500/20",
          'resolved_dismissed': "bg-slate-500/10 text-slate-400 border-slate-500/20",
          'resolved_banned': "bg-red-500/10 text-red-400 border-red-500/20",
          'resolved_refunded': "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      };
      return (
        <Badge className={`uppercase text-[10px] font-bold px-2 py-1 ${styles[status] || styles['pending']}`}>
            {status?.replace("resolved_", "").replace("_", " ")}
        </Badge>
      );
  }

  if (loading) return <div className="flex h-[50vh] items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Disputes & Complaints</h2>
            <p className="text-slate-400 text-sm mt-1">Manage reports filed by users and workers.</p>
        </div>
        <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={fetchComplaints} className="border-white/10 text-slate-300 hover:bg-white/5">
                <RefreshCw className="w-4 h-4 mr-2"/> Refresh
            </Button>
            <Badge variant="outline" className="text-white border-white/20 px-3 py-1 h-9 flex items-center">
            {complaints.filter((c) => c.status === "pending").length} Pending
            </Badge>
        </div>
      </div>

      <div className="grid gap-4">
        {complaints.length === 0 && (
            <div className="text-center py-16 border border-dashed border-white/10 rounded-xl bg-[#001c2b]/50">
                <CheckCircle className="w-12 h-12 mx-auto text-slate-600 mb-3"/>
                <p className="text-slate-400">No complaints found.</p>
            </div>
        )}

        {complaints.map((c) => (
          <Card key={c.id} className="bg-[#001c2b] border-white/10 shadow-md hover:border-white/20 transition-all">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    {getSeverityBadge(c.severity_level)}
                    <Badge variant="outline" className="border-white/20 text-gray-400 uppercase text-[10px] tracking-wider">
                      {c.complaint_type?.replace("_", " ")}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                      {c.subject}
                  </CardTitle>
                  {c.job_title && <div className="flex items-center gap-2 text-xs text-cyan-400"><Briefcase className="w-3 h-3"/> Job: {c.job_title}</div>}
                </div>
                {getStatusBadge(c.status)}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="bg-[#00111a] p-4 rounded-lg text-sm text-gray-300 border border-white/5 leading-relaxed">
                {c.description}
              </div>

              {/* Evidence Section */}
              {c.evidence_files && c.evidence_files.length > 0 && (
                  <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-gray-500 uppercase font-bold flex items-center gap-1"><FileText className="w-3 h-3"/> Evidence Provided</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                          {c.evidence_files.map((url, i) => (
                              <a href={url} target="_blank" key={i} rel="noreferrer" className="block relative group">
                                  <img src={url} className="h-20 w-20 rounded border border-white/20 object-cover group-hover:opacity-80 transition-opacity" onError={(e) => e.target.style.display='none'} />
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded"><ExternalLink className="w-4 h-4 text-white"/></div>
                              </a>
                          ))}
                      </div>
                  </div>
              )}

              <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-4 pt-3 border-t border-white/5 text-xs">
                <div className="space-y-1">
                    <span className="text-slate-500 block">Reporter</span>
                    <div className="flex items-center gap-2 text-cyan-300">
                        <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                        {c.reporter_name || "Unknown"} <span className="text-slate-600">({c.reporter_email})</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <span className="text-slate-500 block">Target User</span>
                    <div className="flex items-center gap-2 text-red-300">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        {c.target_name || "Unknown"} <span className="text-slate-600">({c.target_email})</span>
                    </div>
                </div>
                <div className="text-gray-600 sm:ml-auto sm:text-right self-end">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </div>
              
              {/* Resolution Info */}
              {c.status !== 'pending' && c.status !== 'investigating' && c.resolution_notes && (
                  <div className="bg-emerald-900/20 border border-emerald-500/20 p-3 rounded text-xs text-emerald-200 mt-2">
                      <strong>Admin Note:</strong> {c.resolution_notes}
                  </div>
              )}
            </CardContent>

            {/* Actions Footer */}
            {(c.status === "pending" || c.status === "investigating") && (
              <CardFooter className="bg-[#001520] border-t border-white/5 pt-4 flex gap-3 justify-end rounded-b-xl">
                 {c.status === 'pending' && (
                    <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300" onClick={() => handleResolve('investigating', c.id)}>
                        Mark Investigating
                    </Button>
                 )}
                <Button size="sm" variant="secondary" className="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10" onClick={() => openResolveDialog(c)}>
                  Resolve Case
                </Button>
              </CardFooter>
            )}
          </Card>
        ))}
      </div>

      {/* RESOLUTION DIALOG */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="bg-[#001c2b] border-white/10 text-white sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Resolve Complaint</DialogTitle>
                <DialogDescription className="text-gray-400">Take action on this report. This cannot be undone.</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-gray-500">Resolution Notes (Required)</label>
                    <Textarea 
                        value={notes} 
                        onChange={(e) => setNotes(e.target.value)} 
                        placeholder="Explain the decision..." 
                        className="bg-[#00111a] border-white/10 text-white min-h-[100px] resize-none focus:border-cyan-500/50"
                    />
                </div>
            </div>

            <DialogFooter className="flex flex-col gap-2">
                <div className="flex gap-2 w-full">
                    <Button variant="ghost" onClick={() => setResolveOpen(false)} className="text-gray-400 hover:text-white flex-1">Cancel</Button>
                    <Button 
                        variant="secondary" 
                        disabled={resolving} 
                        onClick={() => handleResolve('resolved_dismissed')}
                        className="bg-slate-700 hover:bg-slate-600 text-white flex-1"
                    >
                        <CheckCircle className="w-4 h-4 mr-2"/> Dismiss
                    </Button>
                </div>
                <div className="flex gap-2 w-full">
                    <Button 
                        variant="outline" 
                        disabled={resolving} 
                        onClick={() => handleResolve('resolved_refunded')}
                        className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 flex-1"
                    >
                        <RotateCcw className="w-4 h-4 mr-2"/> Refund (Manual)
                    </Button>
                    <Button 
                        variant="destructive" 
                        disabled={resolving} 
                        onClick={() => handleResolve('resolved_banned')}
                        className="bg-red-600 hover:bg-red-700 text-white flex-1"
                    >
                        {resolving ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Ban className="w-4 h-4 mr-2"/> Ban Target</>}
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}