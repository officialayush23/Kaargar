// src/config.js

// Production URL or Localhost depending on Vite mode
export const API_BASE_URL =
  import.meta.env.VITE_BACKEND_BASE || "http://localhost:8000";

// Helper to get WebSocket URL
export const getWsUrl = (path) => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  // If base url is http://localhost:8000 -> ws://localhost:8000
  // If base url is https://kaargar.onrender.com -> wss://kaargar.onrender.com
  const host = API_BASE_URL.replace(/^https?:\/\//, "");
  return `${protocol}//${host}${path.startsWith("/") ? path : "/" + path}`;
};
