import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';

export type NotificationType = 'error' | 'warning' | 'success';

interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationContextValue {
  notify: (type: NotificationType, message: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    // Return a no-op if used outside provider (graceful fallback)
    return { notify: () => {} };
  }
  return context;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const notify = useCallback((type: NotificationType, message: string) => {
    const id = crypto.randomUUID();
    setNotifications((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <NotificationContainer notifications={notifications} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

function NotificationContainer({
  notifications,
  onDismiss,
}: {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 400,
      }}
    >
      {notifications.map((notification) => (
        <Toast key={notification.id} notification={notification} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({
  notification,
  onDismiss,
}: {
  notification: NotificationItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  const colors: Record<NotificationType, { bg: string; border: string; text: string }> = {
    error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' },
    warning: { bg: '#fff3cd', border: '#ffeeba', text: '#856404' },
    success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
  };

  const style = colors[notification.type];

  return (
    <div
      role="alert"
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        padding: '12px 16px',
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      <span>{notification.message}</span>
      <button
        onClick={() => onDismiss(notification.id)}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          color: style.text,
          cursor: 'pointer',
          fontSize: 18,
          marginLeft: 12,
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Standalone Notification component that renders the provider-less toast container.
 * Used in App.tsx for global notifications triggered by the event bus.
 */
export function Notification() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    function handleNotification(event: CustomEvent<{ type: NotificationType; message: string }>) {
      const id = crypto.randomUUID();
      setNotifications((prev) => [...prev, { id, type: event.detail.type, message: event.detail.message }]);
    }

    window.addEventListener('app-notification', handleNotification as EventListener);
    return () => {
      window.removeEventListener('app-notification', handleNotification as EventListener);
    };
  }, []);

  return <NotificationContainer notifications={notifications} onDismiss={dismiss} />;
}

/** Dispatch a global notification event (usable from anywhere, including API client). */
export function dispatchNotification(type: NotificationType, message: string): void {
  window.dispatchEvent(
    new CustomEvent('app-notification', { detail: { type, message } })
  );
}
