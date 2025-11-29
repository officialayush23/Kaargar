import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { 
  Loader2, 
  Briefcase, 
  User, 
  MapPin, 
  Settings, 
  ShieldCheck, 
  Save, 
  ArrowLeft 
} from "lucide-react";

// UI Components
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "../config";
// Select
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";

export default function Wregister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      // Identity
      full_name: "",
      phone: "",
      gender: "",
      dob: "",
      // Address
      address_text: "",
      city: "",
      state: "",
      pincode: "",
      // Worker Specifics
      worker_type: "individual",
      professions: "", // Single select for primary profession
      services: "", // Comma separated string
      min_hourly_rate_cents: "",
      experience_years: "",
      about_text: "",
      // Settings
      accepts_auto_assign: false,
      // Policies
      policy_terms: false,
      policy_privacy: false,
      policy_consent: false
    }
  });

  const policies = watch(["policy_terms", "policy_privacy", "policy_consent"]);

  // 1. LOAD DATA
  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/login");
          return;
        }

        const res = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          const w = data.user.worker_profile || {};

          reset({
            full_name: u.full_name || "",
            phone: u.phone || "",
            gender: u.gender || "",
            dob: u.dob || "",
            address_text: u.address_text || "",
            city: u.city || "",
            state: u.state || "",
            pincode: u.pincode || "",
            
            worker_type: w.worker_type || "individual",
            professions: w.professions?.[0] || "", // Take first profession as primary
            services: w.services?.join(", ") || "", // Convert array to string
            min_hourly_rate_cents: w.min_hourly_rate_cents ? w.min_hourly_rate_cents / 100 : "", // Convert cents to Rupees
            experience_years: w.experience_years || "",
            about_text: w.about_text || "",
            accepts_auto_assign: w.accepts_auto_assign || false,
            
            policy_terms: false,
            policy_privacy: false,
            policy_consent: false
          });
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        toast.error("Failed to load profile data");
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [navigate, reset]);

  // 2. SUBMIT HANDLER
  async function onSubmit(values) {
    if (!policies.every(Boolean)) {
      toast.warning("Please accept all policies to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session.access_token;

      // A. Prepare Data
      // Convert services string "Fix leaks, pipe fitting" -> ["Fix leaks", "pipe fitting"]
      const servicesList = values.services.split(",").map(s => s.trim()).filter(s => s !== "");
      // Convert Rate to Cents
      const rateCents = parseFloat(values.min_hourly_rate_cents) * 100;

      // B. Step 1: Update Identity & Address (PATCH /api/me/profile)
      const userPayload = {
        full_name: values.full_name,
        phone: values.phone,
        gender: values.gender,
        dob: values.dob, // Include DOB here for basic update
        address_text: values.address_text,
        city: values.city,
        state: values.state,
        pincode: values.pincode
      };

      const res1 = await fetch(`${API_BASE_URL}/api/me/profile`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(userPayload)
      });

      if (!res1.ok) throw new Error("Failed to update personal details");

      // C. Step 2: Upgrade/Update Worker Role (POST /api/profiles/onboard)
      const workerPayload = {
        role: "worker",
        gender: values.gender, // Required by onboard API
        dob: values.dob,       // Required by onboard API
        worker_type: values.worker_type,
        professions: [values.professions], // Backend expects list
        services: servicesList,
        min_hourly_rate_cents: Math.round(rateCents),
        experience_years: parseInt(values.experience_years),
        about_text: values.about_text,
        accepts_auto_assign: values.accepts_auto_assign
      };

      const res2 = await fetch(`${API_BASE_URL}/api/profiles/onboard`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(workerPayload)
      });

      if (!res2.ok) {
        const errorData = await res2.json();
        throw new Error(errorData.detail || "Failed to register as worker");
      }

      toast.success("Worker Profile Activated Successfully!");
      navigate("/dashboard"); // Redirect to dashboard

    } catch (err) {
      console.error("Submission Error:", err);
      toast.error(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#0f0f17] text-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0f0f17] text-gray-200 flex justify-center px-4 py-10 selection:bg-blue-500/30">
      
      {/* Background Glow */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
      </div>

      <Card className="w-full max-w-4xl bg-[#13131d]/80 backdrop-blur-xl border border-blue-900/20 shadow-2xl rounded-xl overflow-hidden relative z-10">
        
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Briefcase className="w-8 h-8 text-blue-500" />
              Worker Registration
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              Join the Kaargar network. Fill in your details to start receiving jobs.
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate("/profile")} className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </div>

        <ScrollArea className="h-[75vh]">
          <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-10">

            {/* SECTION 1: PERSONAL DETAILS */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-blue-400 mb-4">
                <User className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Identity & Contact</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-gray-300">Full Name</Label>
                  <Input {...register("full_name", { required: true })} className="bg-[#181824] border-white/10 text-white focus:border-blue-500/50 transition-colors" placeholder="e.g. Rahul Kumar" />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">Phone Number</Label>
                  <Input {...register("phone", { required: true })} className="bg-[#181824] border-white/10 text-white focus:border-blue-500/50 transition-colors" placeholder="+91 98765 43210" />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">Date of Birth</Label>
                  <Input type="date" {...register("dob", { required: true })} className="bg-[#181824] border-white/10 text-white focus:border-blue-500/50 transition-colors block w-full" />
                  <p className="text-xs text-gray-500">You must be at least 18 years old.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">Gender</Label>
                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="bg-[#181824] border-white/10 text-white">
                          <SelectValue placeholder="Select Gender" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#181824] border-blue-900/40 text-white">
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </section>

            <Separator className="bg-white/10" />

            {/* SECTION 2: ADDRESS */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-blue-400 mb-4">
                <MapPin className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Location</h3>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Street Address</Label>
                <Textarea {...register("address_text", { required: true })} className="bg-[#181824] border-white/10 text-white min-h-[80px]" placeholder="Flat No, Building, Area..." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-gray-300">City</Label>
                  <Input {...register("city", { required: true })} className="bg-[#181824] border-white/10 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">State</Label>
                  <Input {...register("state", { required: true })} className="bg-[#181824] border-white/10 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Pincode</Label>
                  <Input {...register("pincode", { required: true })} className="bg-[#181824] border-white/10 text-white" />
                </div>
              </div>
            </section>

            <Separator className="bg-white/10" />

            {/* SECTION 3: WORKER PROFILE */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-blue-400 mb-4">
                <Briefcase className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Professional Details</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-gray-300">Primary Profession</Label>
                  <Controller
                    control={control}
                    name="professions"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="bg-[#181824] border-white/10 text-white">
                          <SelectValue placeholder="Select Profession" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#181824] border-blue-900/40 text-white max-h-[200px]">
                          <SelectItem value="plumber">Plumber</SelectItem>
                          <SelectItem value="electrician">Electrician</SelectItem>
                          <SelectItem value="carpenter">Carpenter</SelectItem>
                          <SelectItem value="cleaning">Cleaning</SelectItem>
                          <SelectItem value="driver">Driver</SelectItem>
                          <SelectItem value="gardener">Gardener</SelectItem>
                          <SelectItem value="painter">Painter</SelectItem>
                          <SelectItem value="pest_control">Pest Control</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">Work Type</Label>
                  <Controller
                    control={control}
                    name="worker_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="bg-[#181824] border-white/10 text-white">
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#181824] border-blue-900/40 text-white">
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="freelancer">Freelancer</SelectItem>
                          <SelectItem value="part_time">Part Time</SelectItem>
                          <SelectItem value="agency">Agency / Company</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              {/* SERVICES & EXPERIENCE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-gray-300">Services Offered</Label>
                  <Input {...register("services")} className="bg-[#181824] border-white/10 text-white" placeholder="e.g. Leak repair, Pipe fitting (Comma separated)" />
                  <p className="text-xs text-gray-500">Separate specific services with commas.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Years of Experience</Label>
                  <Input type="number" {...register("experience_years", { min: 0 })} className="bg-[#181824] border-white/10 text-white" placeholder="e.g. 5" />
                </div>
              </div>

              {/* HOURLY RATE */}
              <div className="space-y-2">
                <Label className="text-gray-300">Minimum Hourly Rate (₹)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-500">₹</span>
                  <Input type="number" {...register("min_hourly_rate_cents", { min: 0 })} className="bg-[#181824] border-white/10 text-white pl-8" placeholder="e.g. 200" />
                </div>
                <p className="text-xs text-gray-500">This helps customers filter by budget.</p>
              </div>

              {/* BIO */}
              <div className="space-y-2">
                <Label className="text-gray-300">Professional Bio</Label>
                <Textarea {...register("about_text")} className="bg-[#181824] border-white/10 text-white h-24" placeholder="Describe your skills and work ethic..." />
              </div>
            </section>

            <Separator className="bg-white/10" />

            {/* SECTION 4: PREFERENCES */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-blue-400 mb-4">
                <Settings className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Job Preferences</h3>
              </div>

              <div className="bg-[#181824] p-4 rounded-lg border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium">Auto-Assign Jobs</h4>
                  <p className="text-sm text-gray-500">Allow customers to book you instantly without approval.</p>
                </div>
                <Controller
                  control={control}
                  name="accepts_auto_assign"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            </section>

            <Separator className="bg-white/10" />

            {/* SECTION 5: POLICIES */}
            <section className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Agreements</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Checkbox id="terms" checked={policies[0]} onCheckedChange={(v) => setValue("policy_terms", v)} className="border-white/20 data-[state=checked]:bg-blue-600" />
                  <label htmlFor="terms" className="text-sm text-gray-400 cursor-pointer">I agree to the <span className="text-blue-400 underline">Terms & Conditions</span>.</label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox id="privacy" checked={policies[1]} onCheckedChange={(v) => setValue("policy_privacy", v)} className="border-white/20 data-[state=checked]:bg-blue-600" />
                  <label htmlFor="privacy" className="text-sm text-gray-400 cursor-pointer">I accept the <span className="text-blue-400 underline">Privacy Policy</span>.</label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox id="consent" checked={policies[2]} onCheckedChange={(v) => setValue("policy_consent", v)} className="border-white/20 data-[state=checked]:bg-blue-600" />
                  <label htmlFor="consent" className="text-sm text-gray-400 cursor-pointer">I consent to background verification checks.</label>
                </div>
              </div>
            </section>

            {/* SUBMIT BUTTON */}
            <Button 
              type="submit" 
              disabled={submitting} 
              className="w-full bg-blue-600 hover:bg-blue-500 text-white h-14 text-lg font-semibold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:scale-[1.01]"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Saving Profile...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Save className="w-5 h-5" /> Complete Registration
                </div>
              )}
            </Button>

          </form>
        </ScrollArea>
      </Card>
    </div>
  );
}