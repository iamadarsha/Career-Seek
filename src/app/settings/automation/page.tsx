"use client";

import { useState, useEffect, useTransition } from "react";
import { actionGetPreferences, actionUpdatePreference, actionGetRecentLogs } from "../../automation-actions";
import { Settings, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export default function AutomationSettingsPage() {
  const [prefs, setPrefs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const [pRes, lRes] = await Promise.all([
        actionGetPreferences(),
        actionGetRecentLogs()
      ]);
      if (pRes.success) setPrefs(pRes.preferences);
      if (lRes.success) setLogs(lRes.logs);
    });
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (id: number, field: string, value: boolean) => {
    await actionUpdatePreference(id, { [field]: value });
    load();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Automation & Notifications</h1>
        <p className="text-muted-foreground">Configure scheduled tasks and notification preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Col: Preferences */}
        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2 border-b border-card-border pb-2">
              <Settings className="w-5 h-5" />
              Notification Preferences
            </h2>
            
            <div className="space-y-4">
              {prefs.map(p => (
                <div key={p.id} className="bg-card border border-card-border rounded-apple p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium capitalize">{p.category} Alerts</p>
                    <p className="text-sm text-muted-foreground">In-app notifications for {p.category}.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={p.inAppEnabled}
                      onChange={(e) => handleToggle(p.id, 'inAppEnabled', e.target.checked)}
                    />
                    <div className="peer h-6 w-11 rounded-apple bg-muted peer-focus:outline-none peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-sharp after:border after:border-card-border after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2 border-b border-card-border pb-2">
              <Clock className="w-5 h-5" />
              Quiet Hours
            </h2>
            <div className="bg-card border border-card-border rounded-apple p-4 space-y-4">
              <p className="text-sm text-muted-foreground">Mute notifications during these hours.</p>
              {prefs.length > 0 && (
                <div className="flex items-center gap-4">
                  <input
                    type="time"
                    aria-label="Quiet hours start time"
                    value={prefs[0].quietHoursStart}
                    className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    readOnly
                  />
                  <span>to</span>
                  <input
                    type="time"
                    aria-label="Quiet hours end time"
                    value={prefs[0].quietHoursEnd}
                    className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    readOnly
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Col: Logs */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium flex items-center gap-2 border-b border-card-border pb-2">
            <AlertTriangle className="w-5 h-5" />
            Automation Logs
          </h2>
          
          <div className="bg-card border border-card-border rounded-apple overflow-hidden">
            {logs.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No automation runs recorded yet.</p>
            ) : (
              <div className="max-h-[500px] overflow-y-auto divide-y divide-card-border">
                {logs.map(log => (
                  <div key={log.id} className="p-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        {log.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-danger" />}
                        {log.taskType.replace('_', ' ')}
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(log.startedAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {log.resultSummary && <p className="text-xs text-muted-foreground">{log.resultSummary}</p>}
                    {log.errorDetail && <p className="text-xs text-danger mt-1">{log.errorDetail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
