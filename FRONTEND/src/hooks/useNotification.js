import { useEffect } from "react";
import { getWsUrl } from "@/config";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export function useNotifications() {
  useEffect(() => {
    let ws;

    async function connect() {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;

      if (!token) return;

      const url = `${getWsUrl("ws/notifications")}?token=${token}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("Connected to Realtime Notifications");
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleNotification(payload);
        } catch (e) {
          console.log("Notification Parse Error", e);
        }
      };

      ws.onclose = () => {
        console.log("Notification socket closed");
      };
    }

    connect();

    return () => {
      if (ws) ws.close();
    };
  }, []);
}

function handleNotification(payload) {
  switch (payload.type) {
    case "new_message":
      toast.message(payload.title, {
          description: payload.message,
          action: {
              label: "View",
              onClick: () => window.location.href = `/chat/${payload.job_id}` // Simple redirect or use router
          }
      });
      break;
    case "job_status_update":
      toast.info(`Update: ${payload.message}`);
      break;
    case "bid":
      toast.info(`Bid Alert: ${payload.message}`);
      break;
    case "hired":
      toast.success(`Congratulations! ${payload.message}`);
      break;
    case "job_request":
      toast.info(`New Job Request: ${payload.message}`);
      break;
    case "direct_hire":
      toast.success(`You've been Hired! ${payload.message}`);
      break;
    case "payment_received":
      toast.success(`Payment Received: ${payload.message}`);
      break;
    case "work_submitted":
      toast.info(`Work Submitted: ${payload.message}`);
      break;
    default:
      toast(payload.message || "New Notification");
  }
}