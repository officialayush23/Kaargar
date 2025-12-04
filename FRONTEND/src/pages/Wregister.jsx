import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { 
  Loader2, Save, Briefcase, IndianRupee, Map, Settings, 
  UploadCloud, FileText, CheckCircle2, ArrowLeft 
} from "lucide-react";

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { API_BASE_URL } from "../config";

const workerSchema = z.object({
  worker_type: z.enum(["individual", "freelancer", "part_time", "company", "agency"]),
  professions: z.string().min(3, "At least one profession is required (e.g. Plumber)"),
  services: z.string().min(5, "List a few services you offer"),
  min_hourly_rate: z.coerce.number().min(1, "Rate must be valid"),
  experience_years: z.coerce.number().min(0),
  search_radius_km: z.array(z.number()).default([10]),
  about_text: z.string().optional(),
  accepts_direct_hire: z.boolean().default(false),
  accepts_remote: z.boolean().default(false),
  is_online: z.boolean().default(false),
});

export default function Wregister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [kycFile, setKycFile] = useState(null);
  const [uploadingKyc, setUploadingKyc] = useState(false);
  const [existingKyc, setExistingKyc] = useState([]);

  const form = useForm({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      worker_type: "individual", professions: "", services: "", min_hourly_rate: "",
      experience_years: 0, search_radius_km: [10], about_text: "",
      accepts_direct_hire: false, accepts_remote: false, is_online: true,
    },
  });

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      try {
        const res = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (res.ok) {
          const apiData = await res.json();
          const wp = apiData.data.worker_profile;
          const docs = apiData.data.kyc_documents || [];
          setExistingKyc(docs);

          if (wp) {
            form.reset({
              worker_type: wp.worker_type || "individual",
              professions: wp.professions?.join(", ") || "",
              services: wp.services?.join(", ") || "",
              min_hourly_rate: wp.min_hourly_rate_cents ? wp.min_hourly_rate_cents / 100 : "",
              experience_years: wp.experience_years || 0,
              search_radius_km: [wp.search_radius_meters ? wp.search_radius_meters / 1000 : 10],
              about_text: wp.about_text || "",
              accepts_direct_hire: wp.accepts_direct_hire || false,
              accepts_remote: wp.accepts_remote || false,
              is_online: wp.is_online || false,
            });
          }
        }
      } catch (err) { console.error(err); } finally { setFetching(false); }
    };
    loadData();
  }, [navigate, form]);

  const onSubmit = async (values) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = {
        ...values,
        professions: values.professions.split(",").map(s => s.trim()).filter(Boolean),
        services: values.services.split(",").map(s => s.trim()).filter(Boolean),
        min_hourly_rate_cents: Math.round(values.min_hourly_rate * 100),
        search_radius_meters: Math.round(values.search_radius_km[0] * 1000),
      };
      delete payload.min_hourly_rate; delete payload.search_radius_km;

      const res = await fetch(`${API_BASE_URL}/api/me/worker`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed");
      toast.success("Worker profile saved!"); navigate("/home");
    } catch (err) { toast.error("Error saving profile"); } finally { setLoading(false); }
  };

  const handleKycUpload = async () => {
    if (!kycFile) return toast.warning("Select a file");
    setUploadingKyc(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData(); formData.append("file", kycFile);

      const uploadRes = await fetch(`${API_BASE_URL}/api/upload/kyc`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      const kycRes = await fetch(`${API_BASE_URL}/api/kyc`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ doc_type: "aadhaar", storage_path: url, doc_number: "PENDING" })
      });

      if (kycRes.ok) { toast.success("Uploaded!"); setKycFile(null); } 
      else { toast.warning("Record failed"); }
    } catch { toast.error("KYC Upload failed"); } finally { setUploadingKyc(false); }
  };

  if (fetching) return (
    <div className="min-h-screen py-10 px-4 flex justify-center">
        <Card className="w-full max-w-3xl border-white/10 bg-slate-950/50 backdrop-blur-xl shadow-2xl">
            <CardHeader className="space-y-2">
                <Skeleton className="h-8 w-64 bg-white/10" />
                <Skeleton className="h-4 w-48 bg-white/10" />
            </CardHeader>
            <CardContent className="space-y-8">
                <Skeleton className="h-40 w-full bg-white/10" />
                <Skeleton className="h-40 w-full bg-white/10" />
                <Skeleton className="h-20 w-full bg-white/10" />
            </CardContent>
        </Card>
    </div>
  );

  return (
    <div className="min-h-screen text-slate-100 font-sans py-10 px-4 flex justify-center">
      <Card className="w-full max-w-3xl border-white/10 bg-slate-950/50 backdrop-blur-xl shadow-2xl">
        <CardHeader>
          <Button variant="ghost" onClick={() => navigate("/home")} className="w-fit -ml-2 text-slate-400 hover:text-white mb-2 h-8 px-2"><ArrowLeft className="w-4 h-4 mr-2"/> Back</Button>
          <div className="flex items-center justify-between"><div><CardTitle className="text-2xl font-bold text-white">Worker Registration</CardTitle><CardDescription className="text-slate-400">Setup your professional profile to start receiving jobs.</CardDescription></div><div className="bg-blue-600/10 p-3 rounded-full"><Briefcase className="w-6 h-6 text-blue-500" /></div></div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-4"><div className="flex items-center gap-2 text-sm font-bold text-blue-400 uppercase tracking-wider"><Briefcase className="w-4 h-4" /> Professional Details</div><Separator className="bg-white/10" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="worker_type" render={({ field }) => (<FormItem><FormLabel>Worker Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}><FormControl><SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger></FormControl><SelectContent className="bg-slate-900 border-white/10 text-white"><SelectItem value="individual">Individual</SelectItem><SelectItem value="freelancer">Freelancer</SelectItem><SelectItem value="part_time">Part Time</SelectItem><SelectItem value="agency">Agency</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="experience_years" render={({ field }) => (<FormItem><FormLabel>Experience (Years)</FormLabel><FormControl><Input type="number" {...field} className="bg-white/5 border-white/10 text-white" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="professions" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Professions (Comma separated)</FormLabel><FormControl><Input placeholder="Plumber, Electrician..." {...field} className="bg-white/5 border-white/10 text-white" /></FormControl><FormMessage /></FormItem>)} />
                </div>
              </div>
              <div className="space-y-4"><div className="flex items-center gap-2 text-sm font-bold text-emerald-400 uppercase tracking-wider"><IndianRupee className="w-4 h-4" /> Services & Rates</div><Separator className="bg-white/10" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="min_hourly_rate" render={({ field }) => (<FormItem><FormLabel>Hourly Rate (₹)</FormLabel><FormControl><Input type="number" {...field} className="bg-white/5 border-white/10 text-white font-bold text-lg" /></FormControl><FormMessage /></FormItem>)} />
                    <div className="md:col-span-2"><FormField control={form.control} name="services" render={({ field }) => (<FormItem><FormLabel>Specific Services</FormLabel><FormControl><Textarea placeholder="Tap Repair, Pipe Fitting..." {...field} className="bg-white/5 border-white/10 text-white resize-none" /></FormControl><FormMessage /></FormItem>)} /></div>
                </div>
                <FormField control={form.control} name="about_text" render={({ field }) => (<FormItem><FormLabel>About You</FormLabel><FormControl><Textarea placeholder="Tell customers about your work..." {...field} className="bg-white/5 border-white/10 text-white resize-none" /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <div className="space-y-4"><div className="flex items-center gap-2 text-sm font-bold text-amber-400 uppercase tracking-wider"><Settings className="w-4 h-4" /> Work Preferences</div><Separator className="bg-white/10" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-white/5 rounded-xl border border-white/5">
                    <FormField control={form.control} name="search_radius_km" render={({ field }) => (<FormItem className="col-span-2"><div className="flex justify-between mb-2"><FormLabel>Work Radius</FormLabel><span className="text-sm font-bold text-blue-400">{field.value?.[0]} km</span></div><FormControl><Slider min={1} max={50} step={1} defaultValue={field.value} onValueChange={field.onChange} className="py-2" /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="accepts_direct_hire" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border border-white/10 p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Direct Hire</FormLabel><FormDescription className="text-xs">Allow instant booking</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="is_online" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border border-white/10 p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Online Status</FormLabel><FormDescription className="text-xs">Visible in search</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                </div>
              </div>
              <div className="space-y-4"><div className="flex items-center gap-2 text-sm font-bold text-purple-400 uppercase tracking-wider"><FileText className="w-4 h-4" /> KYC Verification</div><Separator className="bg-white/10" />
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <div className="flex flex-col sm:flex-row items-center gap-4"><Input type="file" className="file:text-white file:bg-white/10 file:border-0 file:rounded-md file:px-2 file:text-xs text-sm text-slate-400" onChange={(e) => setKycFile(e.target.files[0])} /><Button type="button" onClick={handleKycUpload} disabled={uploadingKyc || !kycFile} variant="secondary" className="w-full sm:w-auto">{uploadingKyc ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />} Upload Doc</Button></div>
                    {existingKyc.length > 0 && (<div className="mt-4 space-y-2"><p className="text-xs text-slate-500 uppercase font-bold">Uploaded Documents</p>{existingKyc.map((doc) => (<div key={doc.id} className="flex items-center justify-between p-2 bg-slate-900 rounded border border-white/10 text-xs"><span className="text-slate-300">{doc.doc_type.toUpperCase()}</span><Badge className={doc.status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}>{doc.status}</Badge></div>))}</div>)}
                </div>
              </div>
              <div className="pt-6"><Button type="submit" className="w-full h-12 text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-900/20" disabled={loading}>{loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />} Save Worker Profile</Button></div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}