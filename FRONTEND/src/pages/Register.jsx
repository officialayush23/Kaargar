import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient"; 
import { toast } from "sonner"; 
import { Loader2, Save, User, MapPin, Phone, Calendar, ArrowLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { API_BASE_URL } from "../config";

// --- VALIDATION SCHEMA ---
const profileSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters."),
  phone: z.string().min(10, "Phone number must be at least 10 digits."),
  gender: z.enum(["male", "female", "other"], {
    required_error: "Please select a gender.",
  }),
  dob: z.string().refine((val) => new Date(val).toString() !== 'Invalid Date', { message: "Valid date required" }),
  address_text: z.string().min(5, "Address is too short."),
  city: z.string().min(2, "City is required."),
  state: z.string().min(2, "State is required."),
  pincode: z.string().min(6, "Invalid Pincode."),
});

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState("");

  // Initialize Form
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      phone: "",
      gender: "",
      dob: "",
      address_text: "",
      city: "",
      state: "",
      pincode: "",
    },
  });

  // 1. Fetch Existing Data (Pre-fill)
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (res.ok) {
          const apiData = await res.json();
          const user = apiData.data.user; // Corrected path
          
          // Set Avatar from DB or Social Provider
          const displayAvatar = user.avatar_url || session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture;
          setAvatarUrl(displayAvatar);

          // Reset form with existing data if available
          form.reset({
            full_name: user.full_name || "",
            phone: user.phone || "",
            gender: user.gender || "",
            dob: user.dob || "",
            address_text: user.address_text || "",
            city: user.city || "",
            state: user.state || "",
            pincode: user.pincode || "",
          });
        }
      } catch (error) {
        console.error("Load error:", error);
      } finally {
        setFetching(false);
      }
    };
    loadProfile();
  }, [navigate, form]);

  // 2. Handle Submit
  const onSubmit = async (values) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_BASE_URL}/api/me/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error("Failed to update profile");

      toast.success("Profile updated successfully!");
      navigate("/home");
    } catch (error) {
      toast.error("Error updating profile. Please try again.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name) => name ? name.charAt(0).toUpperCase() : "U";

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 flex justify-center">
      
      <Card className="w-full max-w-2xl shadow-2xl border  bg-slate-900 text-slate-100 font-sans selection:bg-blue-500/30 ">
        <CardHeader className="space-y-4 pb-2">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/home")} 
            className="w-fit -ml-2 text-slate-400 hover:text-white hover:bg-white/10 h-8 px-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2"/> Back
          </Button>

          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-24 w-24 border-4 border-slate-800 shadow-xl">
              <AvatarImage src={avatarUrl} className="object-cover" />
              <AvatarFallback className="text-2xl bg-slate-800 text-blue-400 font-bold">
                {getInitials(form.getValues("full_name"))}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <CardTitle className="text-2xl font-bold tracking-tight text-white">Complete your Profile</CardTitle>
              <CardDescription className="text-slate-400">
                Update your personal details to get verified.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              {/* --- SECTION 1: IDENTITY --- */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-400">
                  <User className="w-4 h-4" />
                  <h3>Personal Details</h3>
                </div>
                <Separator className="bg-white/10" />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} className="bg-white/5 border-white/10 text-white focus-visible:ring-blue-500" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Phone */}
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Phone Number</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                            <Input className="pl-10 bg-white/5 border-white/10 text-white focus-visible:ring-blue-500" placeholder="9876543210" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Gender */}
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Gender</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white focus:ring-blue-500">
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-900 border-white/10 text-white">
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Date of Birth */}
                  <FormField
                    control={form.control}
                    name="dob"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Date of Birth</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                            <Input type="date" className="pl-10 block bg-white/5 border-white/10 text-white focus-visible:ring-blue-500 dark-calendar" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* --- SECTION 2: ADDRESS --- */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-400">
                  <MapPin className="w-4 h-4" />
                  <h3>Address</h3>
                </div>
                <Separator className="bg-white/10" />

                <FormField
                  control={form.control}
                  name="address_text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Street Address</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Flat No, Building, Street Area..." 
                          className="resize-none bg-white/5 border-white/10 text-white focus-visible:ring-blue-500 min-h-[80px]" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">City</FormLabel>
                        <FormControl>
                          <Input placeholder="Srinagar" {...field} className="bg-white/5 border-white/10 text-white focus-visible:ring-blue-500" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">State</FormLabel>
                        <FormControl>
                          <Input placeholder="J&K" {...field} className="bg-white/5 border-white/10 text-white focus-visible:ring-blue-500" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pincode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Pincode</FormLabel>
                        <FormControl>
                          <Input placeholder="190001" {...field} className="bg-white/5 border-white/10 text-white focus-visible:ring-blue-500" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="pt-4">
                <Button type="submit" className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 px-8 rounded-xl shadow-lg shadow-blue-900/20" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>

            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}