import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { 
  CalendarIcon, 
  MapPin, 
  Briefcase, 
  IndianRupee, 
  Loader2, 
  ArrowLeft,
  LocateFixed
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

export default function JobPost() {
  const navigate = useNavigate();
  const [date, setDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(true);

  // Form Setup
  const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    defaultValues: {
      title: "",
      profession_required: "",
      description: "",
      services_required: "",
      address_text: "",
      city: "",
      pincode: "",
      budget: "",
      pay_type: "fixed",
      is_remote: false,
      lat: 21.1458, // Default Nagpur
      lon: 79.0882
    }
  });

  // 1. Fetch User Profile & Live Location
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/login"); return; }
        
        // A. Get User Profile (For Address Defaults)
        const res = await fetch("http://localhost:8000/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          // Auto-fill address if available
          if (u.address_text) setValue("address_text", u.address_text);
          if (u.city) setValue("city", u.city);
          if (u.pincode) setValue("pincode", u.pincode);
        }

        // B. Get Live Geolocation (Crucial for Search)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setValue("lat", pos.coords.latitude);
            setValue("lon", pos.coords.longitude);
            setFetchingLocation(false);
            toast.success("Location detected");
          },
          (err) => {
            console.warn("Location denied:", err);
            setFetchingLocation(false);
            toast.info("Using default location. Enable GPS for better matching.");
          }
        );

      } catch (e) {
        console.error(e);
        setFetchingLocation(false);
      }
    };
    init();
  }, [setValue, navigate]);

  // 2. Submit Handler
  const onSubmit = async (values) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Format Services String to Array
      const servicesList = values.services_required 
        ? values.services_required.split(",").map(s => s.trim()).filter(s => s)
        : [];

      // Append Date info to description since DB schema puts schedule in description or separate table
      // For now, we rely on the job creation payload structure
      let desc = values.description;
      if (date) desc += `\n\nPreferred Date: ${format(date, "PPP")}`;

      const payload = {
        title: values.title,
        description: desc,
        profession_required: values.profession_required,
        services_required: servicesList,
        category: values.profession_required, // Mapping profession to category
        
        // Location Data
        lat: values.lat,
        lon: values.lon,
        address_text: values.address_text,
        city: values.city,
        pincode: values.pincode,

        // Budget (Converted to Cents)
        budget_max_cents: parseInt(values.budget) * 100, 
        
        is_remote: values.is_remote
      };

      const res = await fetch("http://localhost:8000/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to post job");
      }

      toast.success("Job Posted Successfully!");
      // Redirect to the management page to see bids
      navigate("/my_postings");

    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-3xl mx-auto p-4 py-8 relative z-10">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" onClick={() => navigate("/home")} className="text-slate-400 hover:text-white hover:bg-white/5 rounded-full w-10 h-10 p-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">Post a Job</h1>
            <p className="text-slate-400 text-sm">Get offers from verified professionals nearby.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* ---------------------- Job Details ---------------------- */}
          <section className="p-6 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-xl shadow-xl space-y-6">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Briefcase className="w-5 h-5" />
              <h2 className="text-lg font-semibold tracking-wide uppercase text-xs">Job Details</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-slate-300">Job Title</Label>
                <Input
                  {...register("title", { required: true })}
                  placeholder="e.g. Fix bathroom tap"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Category / Profession</Label>
                <Controller
                  control={control}
                  name="profession_required"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Select profession" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-white/10 text-white">
                        <SelectItem value="plumber">Plumber</SelectItem>
                        <SelectItem value="electrician">Electrician</SelectItem>
                        <SelectItem value="maid">Maid</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                        <SelectItem value="mechanic">Mechanic</SelectItem>
                        <SelectItem value="carpenter">Carpenter</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Description</Label>
              <Textarea
                {...register("description", { required: true })}
                placeholder="Describe the problem or task in detail..."
                className="min-h-[120px] bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Services Needed (Optional)</Label>
              <Input
                {...register("services_required")}
                placeholder="e.g. Tap Repair, Pipe Fitting (Comma separated)"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50"
              />
            </div>
          </section>

          {/* ---------------------- Location ---------------------- */}
          <section className="p-6 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-xl shadow-xl space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-blue-400">
                <MapPin className="w-5 h-5" />
                <h2 className="text-lg font-semibold tracking-wide uppercase text-xs">Location</h2>
              </div>
              {fetchingLocation ? (
                 <span className="text-xs text-amber-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> GPS...</span>
              ) : (
                 <span className="text-xs text-emerald-400 flex items-center gap-1"><LocateFixed className="w-3 h-3" /> Active</span>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Street Address</Label>
              <Input 
                {...register("address_text", { required: true })}
                placeholder="Flat No, Building, Area"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">City</Label>
                <Input 
                  {...register("city", { required: true })}
                  placeholder="City"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Pincode</Label>
                <Input 
                  {...register("pincode", { required: true })}
                  placeholder="Pincode"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50"
                />
              </div>
            </div>
          </section>

          {/* ---------------------- Budget & Schedule ---------------------- */}
          <section className="grid md:grid-cols-2 gap-6">
            
            {/* Budget Card */}
            <div className="p-6 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-xl shadow-xl space-y-6">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <IndianRupee className="w-5 h-5" />
                <h2 className="text-lg font-semibold tracking-wide uppercase text-xs">Budget</h2>
              </div>
              
              <div className="space-y-2">
                 <Label className="text-slate-300">Estimated Budget (₹)</Label>
                 <Input 
                   type="number" 
                   {...register("budget", { required: true, min: 1 })}
                   placeholder="500"
                   className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50"
                 />
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <Label className="text-slate-300">Remote Job?</Label>
                <Controller
                  control={control}
                  name="is_remote"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            </div>

            {/* Schedule Card */}
            <div className="p-6 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-xl shadow-xl space-y-6">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <CalendarIcon className="w-5 h-5" />
                <h2 className="text-lg font-semibold tracking-wide uppercase text-xs">Schedule</h2>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Preferred Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`w-full justify-start text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 hover:text-white ${!date && "text-muted-foreground"}`}
                    >
                      {date ? format(date, "PPP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 text-white" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      className="text-white bg-slate-900 rounded-md border border-white/10"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

          </section>

          {/* Submit Button */}
          <Button 
            type="submit" 
            disabled={loading} 
            className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-900/20"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Post Job Now"}
          </Button>

        </form>
      </div>
    </div>
  );
}