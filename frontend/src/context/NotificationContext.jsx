import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import useAuth from '../hooks/useAuth';
import { TOKEN_KEY, normalizeApiUrl } from '../api/axios';

export const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [activeBanner, setActiveBanner] = useState(null);

  const markAsRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setActiveBanner(null);
  }, []);

  const dismissBanner = useCallback(() => {
    setActiveBanner(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setNotifications([]);
      setActiveBanner(null);
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const baseURL = normalizeApiUrl(import.meta.env.VITE_API_URL || 'http://localhost:5000/api');
    const sseUrl = `${baseURL}/notifications/stream?token=${encodeURIComponent(token)}`;

    let eventSource = null;
    try {
      eventSource = new EventSource(sseUrl);

      eventSource.addEventListener('connected', () => {
        // Connected to SSE notification stream
      });

      eventSource.addEventListener('waiting_list_assigned', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const notificationItem = {
            id: payload.appointmentId || String(Date.now()),
            type: 'waiting_list_assigned',
            title: 'Waiting List Slot Assigned!',
            message:
              payload.message ||
              `An appointment slot on ${payload.date} at ${payload.startTime} has been assigned to you!`,
            data: payload,
            createdAt: new Date().toISOString(),
            read: false,
          };
          setNotifications((prev) => [notificationItem, ...prev]);
          setActiveBanner(notificationItem);
        } catch (err) {
          console.error('Failed to parse SSE notification payload:', err);
        }
      });

      eventSource.onerror = () => {
        // EventSource will automatically attempt reconnection
      };
    } catch (err) {
      console.error('SSE connection error:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isAuthenticated, user]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      activeBanner,
      markAsRead,
      markAllAsRead,
      clearNotifications,
      dismissBanner,
    }),
    [notifications, unreadCount, activeBanner, markAsRead, markAllAsRead, clearNotifications, dismissBanner]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {activeBanner && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-md rounded-xl border border-brand-300 bg-white p-4 shadow-xl transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-brand-500 animate-ping" />
              <h4 className="font-semibold text-brand-900">{activeBanner.title}</h4>
            </div>
            <button
              type="button"
              onClick={dismissBanner}
              className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none"
              aria-label="Close notification"
            >
              &times;
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-700">{activeBanner.message}</p>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
