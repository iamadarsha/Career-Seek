"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { actionGetDailyPriorities, actionGetNotifications, actionRunSchedulerNow, actionGetLatestBackup } from "../automation-actions";
import { actionListApplicationsForSelector, actionCreateNote } from "../pipeline/pipeline-actions";
import { Bell, Zap, Calendar, AlertCircle, ArrowRight, Play, CheckCircle, MessageSquare, Plus, ShieldCheck } from "lucide-react";

export default function TodayPage() {
  const [priorities, setPriorities] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [lastBackup, setLastBackup] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const [pRes, nRes, aRes, bRes] = await Promise.all([
        actionGetDailyPriorities(),
        actionGetNotifications(false),
        actionListApplicationsForSelector(),
        actionGetLatestBackup()
      ]);
      if (pRes.success) setPriorities(pRes.priorities);
      if (nRes.success) setNotifications(nRes.notifications);
      if (aRes.success) setApps(aRes.applications);
      if (bRes.success) setLastBackup(bRes.backup);
    });
  };

  useEffect(() => { load(); }, []);

  const handleRunAutomation = async () => {
    setRunning(true);
    await actionRunSchedulerNow();
    setRunning(false);
    load(); // Refresh data after run
  };

  const handleCreateQuickNote = async () => {
    if (!noteContent.trim() || !selectedAppId) return;
    const res = await actionCreateNote(Number(selectedAppId), noteContent.trim(), 'general');
    if (res.success) {
      setNoteContent("");
      alert("Note added to timeline.");
    } else {
      alert("Failed to add note.");
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <section className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
          <p className="text-muted-foreground">Your daily command center for career momentum.</p>
        </section>
        <button 
          onClick={handleRunAutomation}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-apple font-medium transition-colors disabled:opacity-50"
        >
          {running ? <Zap className="w-4 h-4 animate-pulse" /> : <Play className="w-4 h-4" />}
          {running ? "Running Checks..." : "Run Checks Now"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Priorities */}
        <div className="md:col-span-2 space-y-6">
          <h2 className="text-xl font-medium flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Top Priorities
          </h2>
          
          {priorities.length === 0 ? (
            <div className="bg-card border border-card-border rounded-apple-lg p-8 text-center text-muted-foreground flex flex-col items-center">
              <CheckCircle className="w-12 h-12 text-green-500/50 mb-3" />
              <p>You're all caught up!</p>
              <p className="text-sm mt-1">No urgent follow-ups or stale applications detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {priorities.map((p, i) => {
                let Icon = AlertCircle;
                let iconColor = "text-amber-500";
                let dotColor = "bg-amber-500";
                
                if (p.type === 'reminder') {
                  Icon = Calendar;
                  iconColor = "text-red-500";
                  dotColor = "bg-red-500";
                } else if (p.type === 'high_fit_job') {
                  Icon = CheckCircle;
                  iconColor = "text-green-500";
                  dotColor = "bg-green-500";
                } else if (p.type === 'follow_up_recommendation') {
                  Icon = Bell;
                  iconColor = "text-blue-500";
                  dotColor = "bg-blue-500";
                }

                return (
                  <Link key={i} href={p.actionUrl || "#"} className="block bg-card border border-card-border rounded-apple p-4 shadow-sm hover:shadow-apple-hover transition-all group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 flex items-center justify-center w-8 h-8 rounded-full bg-muted/50 ${iconColor}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium">{p.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{p.company}</span>
                            {p.metadata?.score && (
                              <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded font-bold">
                                {p.metadata.score}% Fit
                              </span>
                            )}
                            {p.description && (
                              <span className="text-xs italic">• {p.description}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Notifications & Quick Actions */}
        <div className="space-y-6">
          {/* Quick Note */}
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                <Plus size={20} />
              </div>
              <h2 className="text-xl font-semibold">Quick Note</h2>
            </div>
            
            <div className="space-y-4">
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="">Select Application...</option>
                {apps.map(app => (
                  <option key={app.id} value={app.id}>
                    {app.companyName} - {app.jobTitle}
                  </option>
                ))}
              </select>

              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Log a quick update, follow-up, or call note..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              />

              <button
                onClick={handleCreateQuickNote}
                disabled={!noteContent.trim() || !selectedAppId}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} />
                Save to Timeline
              </button>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-medium flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Recent Alerts
              </h2>
              {unreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {unreadCount} NEW
                </span>
              )}
            </div>
            
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No new alerts.</p>
              ) : (
                notifications.slice(0, 5).map(n => (
                  <div key={n.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{n.message}</p>
                  </div>
                ))
              )}
            </div>
            
            <Link href="/automation" className="mt-4 block text-center text-sm text-indigo-400 hover:text-indigo-300 font-medium">
              View All Alerts
            </Link>
          </div>

          {/* Backup Status */}
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2 text-slate-400 uppercase tracking-wider">
                <ShieldCheck size={16} className="text-emerald-500" />
                System Health
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-slate-500">Last Automated Backup</p>
                <p className="text-sm text-slate-200 font-medium">
                  {lastBackup 
                    ? new Date(lastBackup.createdAt).toLocaleDateString() + ' ' + new Date(lastBackup.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : "Pending..."}
                </p>
              </div>
              <Link href="/settings" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                Settings & Recovery <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
