"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { actionGetNotifications, actionMarkAsRead, actionMarkAllAsRead, actionArchiveNotification } from "../automation-actions";
import { Bell, Check, Trash2, ExternalLink } from "lucide-react";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const res = await actionGetNotifications(false);
      if (res.success) setNotifications(res.notifications);
    });
  };

  useEffect(() => { load(); }, []);

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
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Bell className="w-6 h-6" /> Notifications
        </h1>
        {notifications.some(n => !n.isRead) && (
          <button 
            onClick={handleMarkAllRead}
            className="text-sm text-primary hover:underline font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-card border border-card-border rounded-apple-lg p-12 text-center text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No new notifications.</p>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-apple-lg shadow-sm divide-y divide-card-border">
          {notifications.map(n => (
            <div key={n.id} className={`p-4 flex items-start gap-4 transition-colors ${n.isRead ? 'opacity-70 bg-black/[0.01] dark:bg-white/[0.01]' : 'bg-background'}`}>
              <div className="mt-1">
                {n.priority === 'high' ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                ) : n.isRead ? (
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-muted-foreground/30" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.isRead ? 'font-medium text-foreground/80' : 'font-semibold text-foreground'}`}>
                  {n.title}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(n.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {n.actionUrl && (
                  <Link href={n.actionUrl} className="p-2 text-muted-foreground hover:text-primary rounded-apple hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                )}
                {!n.isRead && (
                  <button onClick={() => handleMarkAsRead(n.id)} className="p-2 text-muted-foreground hover:text-green-500 rounded-apple hover:bg-black/5 dark:hover:bg-white/5 transition-colors" title="Mark as read">
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => handleArchive(n.id)} className="p-2 text-muted-foreground hover:text-red-500 rounded-apple hover:bg-black/5 dark:hover:bg-white/5 transition-colors" title="Archive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
