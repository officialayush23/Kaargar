import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Send, ArrowLeft, Paperclip, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import Headback from "../components/Headback";

export default function Chat() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const scrollRef = useRef(null);

  // 1. Initialize Chat
  useEffect(() => {
    const initChat = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      setUser(session.user);
      const token = session.access_token;

      // A. Get/Create Chat Room
      try {
        // First get Job details to know who we are talking to
        const jobRes = await fetch(`http://localhost:8000/api/jobs/${jobId}`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        if (!jobRes.ok) throw new Error("Job not found");
        const jobData = await jobRes.json();
        const j = jobData.job;
        
        // Determine other party
        const isCustomer = session.user.id === j.customer_id;
        setOtherUser({
            name: isCustomer ? j.worker_name : j.customer_name,
            avatar: isCustomer ? j.worker_avatar : j.customer_avatar
        });

        // Get Chat ID
        const chatRes = await fetch(`http://localhost:8000/api/jobs/${jobId}/chat`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
        const chatData = await chatRes.json();
        setChatId(chatData.chat_id);

        // Load History
        const historyRes = await fetch(`http://localhost:8000/api/chats/${chatData.chat_id}/messages`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        const history = await historyRes.json();
        setMessages(history.messages || []);

      } catch (e) {
        console.error(e);
      }
    };
    initChat();
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
          setMessages(prev => [...prev, payload.new]);
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

  // 4. Send Handler
  const handleSend = async () => {
    if (!newMessage.trim()) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(`http://localhost:8000/api/chats/${chatId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ content: newMessage })
        });
        setNewMessage("");
    } catch (e) { console.error("Send failed"); }
  };

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
                <h3 className="font-bold text-white text-sm">{otherUser?.name || "Loading..."}</h3>
                <p className="text-xs text-slate-400 flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/> Online</p>
            </div>
        </div>
        <Button size="icon" variant="ghost" className="text-slate-400 hover:text-emerald-400"><Phone className="w-5 h-5" /></Button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
         <div className="space-y-4 pb-4">
            {messages.map((msg, i) => {
                const isMe = msg.sender_id === user?.id;
                return (
                    <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                            isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/10 text-slate-200 rounded-tl-none'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                )
            })}
            <div ref={scrollRef} />
         </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-slate-900 border-t border-white/10 flex gap-3 items-center relative z-20">
         <Button size="icon" variant="ghost" className="text-slate-400 hover:text-white shrink-0"><Paperclip className="w-5 h-5" /></Button>
         <Input 
            className="bg-white/5 border-white/10 text-white rounded-full h-12 px-4 focus-visible:ring-blue-500/50"
            placeholder="Type a message..." 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
         />
         <Button onClick={handleSend} size="icon" className="bg-blue-600 hover:bg-blue-500 text-white rounded-full h-12 w-12 shrink-0 shadow-lg shadow-blue-900/20">
            <Send className="w-5 h-5" />
         </Button>
      </div>
    </div>
  );
}