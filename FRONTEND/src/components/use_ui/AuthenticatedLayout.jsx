import { useNotifications } from "../../hooks/useNotification";

/**
 * A "Headless" component that manages the Realtime Notification socket.
 * It renders nothing visible to the DOM.
 * * Usage: Place this inside any component that is only rendered 
 * when the user is authenticated (e.g., Navbar, Home, or Dashboard).
 */
const NotificationListener = () => {
  // Activate the hook
  useNotifications();

  // Render nothing
  return null;
};

export default NotificationListener;