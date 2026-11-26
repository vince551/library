import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../store/AuthProvider";
import { apiRequest } from "../lib/api";
import "./notifications.css";

const formatTime = value => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(date);
};

export function NotificationBell({ onNavigate }) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token || user?.role !== "member") return;
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest("/notifications", { token });
      setItems(Array.isArray(result.notifications) ? result.notifications : []);
      setUnread(Number(result.unreadCount) || 0);
    } catch (err) {
      setError(err.message || "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (item) => {
    if (!item.read_at) {
      try {
        await apiRequest("/notifications/" + encodeURIComponent(item.id) + "/read", { token, method: "PATCH" });
        setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
        setUnread(count => Math.max(0, count - 1));
      } catch (err) {
        setError(err.message || "Could not update this notification.");
        return;
      }
    }
    setOpen(false);
    if (item.link === "newsSection" || item.link === "profileSection") onNavigate(item.link);
  };

  const markAllRead = async () => {
    try {
      await apiRequest("/notifications/read-all", { token, method: "PATCH" });
      const now = new Date().toISOString();
      setItems(current => current.map(item => ({ ...item, read_at: item.read_at || now })));
      setUnread(0);
    } catch (err) {
      setError(err.message || "Could not mark notifications as read.");
    }
  };

  if (!token || user?.role !== "member") return null;

  return (
    <div className="amg-notifications">
      <button className="amg-notification-trigger" type="button"
        aria-label={unread ? unread + " unread notifications" : "Notifications"}
        aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load(); }}>
        <span aria-hidden="true">♧</span>
        <span>Alerts</span>
        {unread > 0 && <b className="amg-notification-count">{unread > 99 ? "99+" : unread}</b>}
      </button>
      {open && (
        <section className="amg-notification-panel" aria-label="Your notifications">
          <header className="amg-notification-heading">
            <div><strong>Notifications</strong><small>{unread} unread</small></div>
            <div className="amg-notification-tools">
              <button type="button" onClick={() => void load()} aria-label="Refresh notifications">↻</button>
              {unread > 0 && <button type="button" onClick={() => void markAllRead()}>Mark all read</button>}
            </div>
          </header>
          {error && <p className="amg-notification-error">{error}</p>}
          {loading && <p className="amg-notification-empty">Loading your alerts…</p>}
          {!loading && items.length === 0 && <p className="amg-notification-empty">You’re all caught up. New library updates will appear here.</p>}
          <div className="amg-notification-list">
            {items.map(item => (
              <button type="button" key={item.id}
                className={"amg-notification-item" + (item.read_at ? "" : " is-unread")}
                onClick={() => void markRead(item)}>
                <span className="amg-notification-dot" aria-hidden="true"></span>
                <span className="amg-notification-copy">
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <small>{formatTime(item.created_at)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
