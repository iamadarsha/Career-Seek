"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Archive,
  Bell,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  actionArchiveNotification,
  actionGetNotifications,
  actionMarkAllAsRead,
  actionMarkAsRead,
} from "../automation-actions";

function priorityClass(priority: string) {
  if (priority === "high") return "bg-danger shadow-golden-sm";
  if (priority === "medium") return "bg-warning shadow-golden-sm";
  return "bg-primary shadow-golden-sm";
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  const unread = notifications.filter((notification) => !notification.isRead).length;
  const highPriority = notifications.filter((notification) => notification.priority === "high").length;

  const load = () => {
    startTransition(async () => {
      const res = await actionGetNotifications(false);
      if (res.success) setNotifications(res.notifications);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const handleMarkAsRead = async (id: number) => {
    await actionMarkAsRead(id);
    load();
  };

  const handleMarkAllRead = async () => {
    await actionMarkAllAsRead();
    load();
  };

  const handleArchive = async (id: number) => {
    await actionArchiveNotification(id);
    load();
  };

  return (
    <div className="space-y-7 pb-16">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="design-label">Notifications</p>
          <h1 className="mt-2 max-w-4xl font-display text-3xl font-semibold leading-tight md:text-4xl">Follow-ups, scan outcomes, and stale-job nudges</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            This is the recovery rail for the job search: reminders, automation outcomes, and actions that should not get lost.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            disabled={isPending}
            className="design-button-secondary px-4 text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          {unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="design-button-primary px-4 text-sm font-semibold"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </header>

      <section className="surface-grid grid gap-4 md:grid-cols-3">
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">Unread</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none text-primary">{unread}</p>
        </div>
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">High priority</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none text-danger">{highPriority}</p>
        </div>
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">Total visible</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none">{notifications.length}</p>
        </div>
      </section>

      {notifications.length === 0 ? (
        <div className="apple-card rounded-apple p-10 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Nothing needs attention right now</h2>
          <p className="mt-2 text-muted-foreground">
            When scans finish, follow-ups go stale, or reminders become due, they will appear here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/" className="design-button-primary px-5 text-sm font-semibold">
              Open Today
            </Link>
            <Link href="/pipeline" className="design-button-secondary px-5 text-sm font-semibold">
              Review Pipeline
            </Link>
          </div>
        </div>
      ) : (
        <div className="apple-card overflow-hidden rounded-apple">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`flex flex-col gap-4 border-b border-card-border p-5 last:border-b-0 md:flex-row md:items-start ${
                notification.isRead ? "bg-surface/50" : "bg-surface-container-low/50"
              }`}
            >
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-sharp shadow-lg ${priorityClass(notification.priority)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{notification.title}</h2>
                  {!notification.isRead && (
                    <span className="rounded-apple bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">New</span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{notification.message}</p>
                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleString("en-IN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {notification.actionUrl && (
                  <Link href={notification.actionUrl} className="design-button-secondary px-3 text-sm font-semibold">
                    Open <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
                {!notification.isRead && (
                  <button
                    onClick={() => handleMarkAsRead(notification.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-apple border border-success-border bg-success-bg px-3 text-sm font-semibold text-success"
                  >
                    <Check className="h-4 w-4" />
                    Read
                  </button>
                )}
                <button
                  onClick={() => handleArchive(notification.id)}
                  className="design-button-secondary px-3 text-sm font-semibold text-muted-foreground"
                >
                  <Archive className="h-4 w-4" />
                  Archive
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
