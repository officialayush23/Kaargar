export const API_BASE_URL =
  import.meta.env.VITE_BACKEND_BASE || "http://localhost:8000";

export const getWsUrl = (path) => {
  // Auto-detect protocol based on current page or API_BASE_URL
  const isSecure = API_BASE_URL.startsWith("https");
  const protocol = isSecure ? "wss:" : "ws:";
  
  // Strip protocol from base url to get host
  const host = API_BASE_URL.replace(/^https?:\/\//, "");
  
  // Ensure path starts with /
  const sanitizedPath = path.startsWith("/") ? path : `/${path}`;
  
  return `${protocol}//${host}${sanitizedPath}`;
};