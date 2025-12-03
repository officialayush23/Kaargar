import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Send, ArrowLeft, Paperclip, Phone, Loader2, FileText, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import Headback from "../components/Headback";
import { API_BASE_URL } from "../config"; 

export default function Chat() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef(null);

  // 1. Initialize & Load History
  useEffect(() => {
    const initChat = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/login"); return; }
        setUser(session.user);
        const token = session.access_token;

        // A. Get Job Details (to identify the other user)
        const jobRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!jobRes.ok) throw new Error("Job not found");
        const jobJson = await jobRes.json();
        const j = jobJson.data; // v4 API returns { ok: true, data: {...} }
        
        const isCustomer = session.user.id === j.customer_id;
        // Ideally fetch other user profile details if not present in job object
        // For now using placeholder logic or data from job if available
        setOtherUser({
            name: isCustomer ? (j.worker_name || "Worker") : (j.customer_name || "Customer"),
            avatar: null 
        });

        // B. Get or Create Chat Room ID
        const chatRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/chat`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const chatData = await chatRes.json();
        if (chatData.data?.id) {
            const roomId = chatData.data.id;
            setChatId(roomId);
            
            // C. Load History REST API
            const historyRes = await fetch(`${API_BASE_URL}/api/chats/${roomId}/messages`, {
                 headers: { Authorization: `Bearer ${token}` }
            });
            if (historyRes.ok) {
                const history = await historyRes.json();
                setMessages(history.data || []);
            }

            // D. Connect WebSocket
            connectWebSocket(roomId, token);
        }
      } catch (e) {
        console.error(e);
        toast.error("Connection failed");
      } finally {
        setLoading(false);
      }
    };
    
    if (jobId) initChat();

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [jobId, navigate]);

  // 2. WebSocket Connection Logic
  const connectWebSocket = (roomId, token) => {
    // Construct WS URL (Handle http/https -> ws/wss)
    // Assuming API_BASE_URL is like "http://localhost:8000" or "https://api.kaargar.com"
    const wsBase = API_BASE_URL.replace(/^http/, 'ws'); 
    
    // We pass token as a query param for standard browser WebSocket compatibility
    // The backend endpoint is: /ws/chat/{chat_id}?token={jwt}
    // Note: Your backend implementation of websocket_chat(..., token: str = Query(...)) handles this perfectly.
    // If your backend expects header, standard JS WebSocket API doesn't support custom headers easily.
    // Query param is the robust way for browser clients.
    const wsUrl = `${wsBase}/ws/chat/${roomId}?token=${encodeURIComponent(token)}`;
    
    console.log("Connecting to WS:", wsUrl);
    
    const ws = new WebSocket(wsUrl); 

    ws.onopen = () => {
      console.log("WS Connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WS Message:", data);
        
        setMessages((prev) => {
          // Dedup logic
          if (prev.find(m => m.id === data.id)) return prev;
          return [...prev, data];
        });
      } catch (err) {
        console.error("WS Parse Error", err);
      }
    };

    ws.onclose = (event) => {
      console.log("WS Disconnected", event.code, event.reason);
      setIsConnected(false);
      // Optional: Reconnect logic could be added here
    };

    ws.onerror = (err) => {
      console.error("WS Error:", err);
      setIsConnected(false);
    };

    socketRef.current = ws;
  };

  // 3. Auto-Scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Handlers
  const handleSend = async (mediaUrl = null, mediaType = null) => {
    const content = newMessage.trim();
    if (!content && !mediaUrl) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const payload = {
            content: content,
            media_url: mediaUrl,
            media_type: mediaType
        };
        socketRef.current.send(JSON.stringify(payload));
        setNewMessage("");
    } else {
        toast.error("Connection lost. Reconnecting...");
        // Fallback: Use HTTP endpoint if WS is down
        // This ensures message isn't lost if socket momentarily dropped
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await fetch(`${API_BASE_URL}/api/chats/${chatId}/messages`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ content, media_url: mediaUrl, media_type: mediaType })
            });
            setNewMessage("");
        } catch (e) {
            toast.error("Failed to send message via fallback.");
        }
    }
  };

  const handleFileSelect = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setIsUploading(true);
      try {
          const fileName = `${chatId}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
          const { error } = await supabase.storage.from('chat_media').upload(fileName, file);
          if (error) throw error;

          const { data } = supabase.storage.from('chat_media').getPublicUrl(fileName);
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          
          // Send via WS
          await handleSend(data.publicUrl, type);
      } catch (err) {
          toast.error("Upload failed");
      } finally {
          setIsUploading(false);
      }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative flex flex-col">
      <Headback />
      
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
                <p className="text-xs flex items-center gap-1">
                    {isConnected ? (
                        <span className="text-emerald-400 flex items-center gap-1"><Wifi className="w-3 h-3"/> Live</span>
                    ) : (
                        <span className="text-red-400 flex items-center gap-1"><WifiOff className="w-3 h-3"/> Offline</span>
                    )}
                </p>
            </div>
        </div>
        <Button size="icon" variant="ghost" className="text-slate-400 hover:text-emerald-400"><Phone className="w-5 h-5" /></Button>
      </div>

      <ScrollArea className="flex-1 overflow-y-auto p-4">
         <div className="space-y-4 pb-4">
            {messages.length === 0 && <div className="text-center text-slate-500 text-sm mt-10">Start the conversation...</div>}
            {messages.map((msg, i) => {
                const isMe = msg.sender_id === user?.id;
                return (
                    <div key={msg.id || i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm space-y-2 ${
                            isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/10 text-slate-200 rounded-tl-none'
                        }`}>
                            {msg.media_url && (
                                msg.media_type === 'image' ? 
                                <img src={msg.media_url} alt="attachment" className="rounded-lg max-h-48 object-cover border border-white/10 w-full" /> :
                                <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline text-xs text-white/80 hover:text-white"><FileText className="w-4 h-4"/> Attachment</a>
                            )}
                            {msg.content && <p>{msg.content}</p>}
                            <span className="text-[10px] opacity-50 block text-right pt-1">
                                {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                    </div>
                )
            })}
            <div ref={scrollRef} />
         </div>
      </ScrollArea>

      <div className="p-4 bg-slate-900 border-t border-white/10 flex gap-3 items-center relative bottom-0 z-20">
         <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
         <Button size="icon" variant="ghost" className="text-slate-400 hover:text-white shrink-0" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
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