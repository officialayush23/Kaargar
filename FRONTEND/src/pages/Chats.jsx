import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Send, ArrowLeft, Paperclip, Phone, Loader2, Image as ImageIcon, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import Headback from "../components/Headback";

export default function Chat() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Media State
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const scrollRef = useRef(null);

  // 1. Initialize Chat
  useEffect(() => {
    const initChat = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/login"); return; }
        setUser(session.user);
        const token = session.access_token;

        // A. Get Job Details
        const jobRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!jobRes.ok) throw new Error("Job not found");
        const jobData = await jobRes.json();
        const j = jobData.job;
        
        const isCustomer = session.user.id === j.customer_id;
        setOtherUser({
            name: isCustomer ? j.worker_name : j.customer_name,
            avatar: isCustomer ? j.worker_avatar : j.customer_avatar
        });

        // B. Get/Create Chat Room
        const chatRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/chat`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!chatRes.ok) throw new Error("Failed to initialize chat");
        const chatData = await chatRes.json();
        
        if (chatData.chat_id) {
            setChatId(chatData.chat_id);
            
            // C. Load History
            const historyRes = await fetch(`${API_BASE_URL}/api/chats/${chatData.chat_id}/messages`, {
                 headers: { Authorization: `Bearer ${token}` }
            });
            if (historyRes.ok) {
                const history = await historyRes.json();
                setMessages(history.messages || []);
            }
        }
      } catch (e) {
        console.error(e);
        toast.error("Could not load chat");
      } finally {
        setLoading(false);
      }
    };
    
    if (jobId) initChat();
  }, [jobId, navigate]);

  // 2. Realtime Subscription
  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages', 
          filter: `chat_id=eq.${chatId}` 
      }, (payload) => {
          // Only add if we don't already have it (Optimistic UI handling)
          setMessages(prev => {
              if (prev.find(m => m.id === payload.new.id)) return prev;
              return [...prev, payload.new];
          });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  // 3. Auto-Scroll
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // 4. Handlers

  const handleSend = async (mediaUrl = null, mediaType = null) => {
    const textContent = newMessage.trim();
    if (!textContent && !mediaUrl) return;

    // Optimistic UI Update
    const tempId = Math.random().toString();
    const optimisticMsg = {
        id: tempId,
        chat_id: chatId,
        sender_id: user.id,
        content: textContent,
        media_url: mediaUrl,
        media_type: mediaType,
        created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage(""); // Clear input immediately

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`http://localhost:8000/api/chats/${chatId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ 
                content: textContent,
                media_url: mediaUrl,
                media_type: mediaType
            })
        });
        
        if (!res.ok) throw new Error("Send failed");
        
    } catch (e) { 
        console.error("Send failed"); 
        toast.error("Failed to send message");
        // Rollback optimistic update
        setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  };

  const handleFileSelect = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setIsUploading(true);
      try {
          // 1. Upload to 'chat_media' bucket
          const fileExt = file.name.split('.').pop();
          const fileName = `${chatId}/${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
              .from('chat_media')
              .upload(fileName, file);
          
          if (uploadError) throw uploadError;

          // 2. Get Signed URL (so it works even if bucket is private)
          // Or Public URL if bucket is public. Using Public for chat usually easier.
          const { data } = supabase.storage.from('chat_media').getPublicUrl(fileName);
          
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          
          // 3. Send Message with Media
          await handleSend(data.publicUrl, type);

      } catch (err) {
          toast.error("Upload failed");
          console.error(err);
      } finally {
          setIsUploading(false);
      }
  };

  if (loading) return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-500" />
      </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative flex flex-col">
      <Headback />
      
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(-1)} className="text-slate-400 hover:text-white p-0 h-10 w-10 rounded-full">
                <ArrowLeft className="w-5 h-5" />
            </Button>
            <Avatar className="h-10 w-10 border border-white/10">
                <AvatarImage src={otherUser?.avatar} />
                <AvatarFallback className="bg-blue-600 text-white font-bold">{otherUser?.name?.[0]}</AvatarFallback>
            </Avatar>
            <div>
                <h3 className="font-bold text-white text-sm">{otherUser?.name || "User"}</h3>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/> Online
                </p>
            </div>
        </div>
        <Button size="icon" variant="ghost" className="text-slate-400 hover:text-emerald-400"><Phone className="w-5 h-5" /></Button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
         <div className="space-y-4 pb-4">
            {messages.length === 0 && (
                <div className="text-center text-slate-500 text-sm mt-10">Start the conversation...</div>
            )}
            {messages.map((msg, i) => {
                const isMe = msg.sender_id === user?.id;
                return (
                    <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm space-y-2 ${
                            isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/10 text-slate-200 rounded-tl-none'
                        }`}>
                            {/* Media Rendering */}
                            {msg.media_url && msg.media_type === 'image' && (
                                <img src={msg.media_url} alt="attachment" className="rounded-lg max-h-48 object-cover border border-white/10" />
                            )}
                            {msg.media_url && msg.media_type === 'file' && (
                                <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs underline text-white/80 hover:text-white">
                                    <FileText className="w-4 h-4" /> Attachment
                                </a>
                            )}
                            
                            {msg.content && <p>{msg.content}</p>}
                        </div>
                    </div>
                )
            })}
            <div ref={scrollRef} />
         </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-slate-900 border-t border-white/10 flex gap-3 items-center relative z-20">
         <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileSelect}
         />
         <Button 
            size="icon" 
            variant="ghost" 
            className="text-slate-400 hover:text-white shrink-0"
            onClick={() => fileInputRef.current.click()}
            disabled={isUploading}
         >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
         </Button>
         
         <Input 
            className="bg-white/5 border-white/10 text-white rounded-full h-12 px-4 focus-visible:ring-blue-500/50"
            placeholder="Type a message..." 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
         />
         <Button onClick={() => handleSend()} size="icon" className="bg-blue-600 hover:bg-blue-500 text-white rounded-full h-12 w-12 shrink-0 shadow-lg shadow-blue-900/20">
            <Send className="w-5 h-5" />
         </Button>
      </div>
    </div>
  );
}