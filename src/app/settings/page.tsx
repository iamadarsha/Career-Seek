"use client";

import { useEffect, useState } from "react";
import { checkApiKey } from "@/app/actions";
import {
  actionExportCrm,
  actionExportWorkspaceBackup,
  actionGetIntegrationSettings,
  actionImportContactsCsv,
  actionImportWorkspaceBackup,
  actionUpdateIntegrationSettings,
} from "@/app/pipeline/pipeline-actions";
import { Download, Check, Database, Settings2, Zap, Play } from "lucide-react";
import { actionRunSchedulerNow } from "../automation-actions";

export default function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{path:string; count:number}|null>(null);
  const [backuping, setBackuping] = useState(false);
  const [backupResult, setBackupResult] = useState<{ path: string; count: number } | null>(null);
  const [importPath, setImportPath] = useState("");
  const [contactsCsvPath, setContactsCsvPath] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [integrationSettings, setIntegrationSettings] = useState<any>({
    defaultExportFolder: "",
    backupDestination: "",
    calendar: { defaultDurationMinutes: 30, defaultLeadMinutes: 10, autoOpenInCalendar: false },
    email: { defaultTone: "professional", signature: "Best regards," },
    toggles: {
      calendar: true,
      emailDrafts: true,
      contacts: true,
      applicationPacketExport: true,
      backupRestore: true,
      useAiForEmails: true,
    },
  });
  const [runningChecks, setRunningChecks] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await actionGetIntegrationSettings();
      if (res.success) {
        setIntegrationSettings(res.settings);
      }
    })();
  }, []);

  const handleSaveApiKey = async () => {
    setSaving(true);
    await checkApiKey(apiKey);
    setSaving(false);
    alert("API Key saved and validated!");
  };

  const handleExport = async () => {
    setExporting(true);
    const res = await actionExportCrm();
    if (res.success) setExportResult({ path: (res as any).filePath, count: (res as any).recordCount });
    setExporting(false);
  };

  const handleSaveIntegrationSettings = async () => {
    setSettingsSaving(true);
    const res = await actionUpdateIntegrationSettings({
      ...integrationSettings,
      defaultExportFolder: integrationSettings.defaultExportFolder || null,
      backupDestination: integrationSettings.backupDestination || null,
    });
    setSettingsSaving(false);
    if (res.success) {
      setIntegrationSettings(res.settings);
      alert("Integration settings saved.");
    } else {
      alert("Failed to save integration settings.");
    }
  };

  const handleExportBackup = async () => {
    setBackuping(true);
    const res = await actionExportWorkspaceBackup();
    setBackuping(false);
    if ((res as any).success) {
      setBackupResult({ path: (res as any).backupPath, count: (res as any).totalRecords || 0 });
    } else {
      alert((res as any).error || "Failed to export workspace backup.");
    }
  };

  const handleImportBackup = async () => {
    if (!importPath.trim()) return;
    const res = await actionImportWorkspaceBackup(importPath.trim());
    if ((res as any).success) {
      alert(`Backup import complete. Imported ${(res as any).inserted || 0} records.`);
      setImportPath("");
    } else {
      alert((res as any).error || "Backup import failed.");
    }
  };

  const handleRunChecks = async () => {
    setRunningChecks(true);
    await actionRunSchedulerNow();
    setRunningChecks(false);
    alert("System checks completed.");
  };

  const handleImportContactsCsv = async () => {
    if (!contactsCsvPath.trim()) return;
    const res = await actionImportContactsCsv(contactsCsvPath.trim());
    if ((res as any).success) {
      alert(`Contacts import complete. Imported ${(res as any).imported || 0} contacts.`);
      setContactsCsvPath("");
    } else {
      alert((res as any).error || "Contacts import failed.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-semibold">Settings</h2>
      
      {/* AI Configuration */}
      <section className="bg-card border border-card-border rounded-apple shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-medium">AI Configuration</h3>
        <p className="text-sm text-muted-foreground">Manage your Gemini API Key.</p>
        <div className="flex gap-4 max-w-md">
          <input 
            type="password" 
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 px-3 py-2 border border-card-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button 
            onClick={handleSaveApiKey}
            disabled={saving || !apiKey}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            {saving ? "Validating..." : "Save"}
          </button>
        </div>
      </section>

      {/* Integrations & AI Email */}
      <section className="bg-card border border-card-border rounded-apple shadow-sm p-6 space-y-6">
        <div className="space-y-1">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" /> 
            Integrations & Orchestration
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure local-first export paths, calendar defaults, and AI email behavior.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Default Export Folder</label>
              <input
                value={integrationSettings.defaultExportFolder || ""}
                onChange={(e) => setIntegrationSettings({ ...integrationSettings, defaultExportFolder: e.target.value })}
                placeholder="Optional absolute path"
                className="mt-1 w-full px-3 py-2 border border-card-border rounded-apple bg-background text-sm focus:ring-2 focus:ring-primary/20 transition-shadow"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Backup Destination</label>
              <input
                value={integrationSettings.backupDestination || ""}
                onChange={(e) => setIntegrationSettings({ ...integrationSettings, backupDestination: e.target.value })}
                placeholder="Optional absolute path"
                className="mt-1 w-full px-3 py-2 border border-card-border rounded-apple bg-background text-sm focus:ring-2 focus:ring-primary/20 transition-shadow"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Calendar Duration (minutes)</label>
              <input
                type="number"
                value={integrationSettings.calendar.defaultDurationMinutes}
                onChange={(e) => setIntegrationSettings({
                  ...integrationSettings,
                  calendar: { ...integrationSettings.calendar, defaultDurationMinutes: Number(e.target.value || 30) },
                })}
                className="mt-1 w-full px-3 py-2 border border-card-border rounded-apple bg-background text-sm focus:ring-2 focus:ring-primary/20 transition-shadow"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email Draft Tone</label>
              <select
                value={integrationSettings.email.defaultTone}
                onChange={(e) => setIntegrationSettings({
                  ...integrationSettings,
                  email: { ...integrationSettings.email, defaultTone: e.target.value },
                })}
                className="mt-1 w-full px-3 py-2 border border-card-border rounded-apple bg-background text-sm focus:ring-2 focus:ring-primary/20 transition-shadow"
              >
                <option value="professional">Professional</option>
                <option value="warm">Warm</option>
                <option value="concise">Concise</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted/30 rounded-apple-lg space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Features & AI</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-background border border-card-border rounded-apple shadow-sm">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">AI Email Generation</p>
                <p className="text-xs text-muted-foreground">Grounded RAG drafting.</p>
              </div>
              <input 
                type="checkbox"
                checked={integrationSettings.toggles.useAiForEmails}
                onChange={(e) => setIntegrationSettings({
                  ...integrationSettings,
                  toggles: { ...integrationSettings.toggles, useAiForEmails: e.target.checked }
                })}
                className="w-4 h-4 text-primary rounded border-card-border"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-background border border-card-border rounded-apple shadow-sm">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Calendar Integration</p>
                <p className="text-xs text-muted-foreground">Export events locally.</p>
              </div>
              <input 
                type="checkbox"
                checked={integrationSettings.toggles.calendar}
                onChange={(e) => setIntegrationSettings({
                  ...integrationSettings,
                  toggles: { ...integrationSettings.toggles, calendar: e.target.checked }
                })}
                className="w-4 h-4 text-primary rounded border-card-border"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveIntegrationSettings}
          disabled={settingsSaving}
          className="w-full py-3 bg-primary text-primary-foreground rounded-apple font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-primary/20"
        >
          {settingsSaving ? "Saving..." : "Save Orchestration Settings"}
        </button>
      </section>

      {/* System Operations */}
      <section className="bg-card border border-card-border rounded-apple shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-medium">System Operations</h3>
        </div>
        <p className="text-sm text-muted-foreground">Manually trigger background processes, job scans, and system health checks.</p>
        
        <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-apple flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Daily Automation & Scanner</p>
            <p className="text-xs text-muted-foreground">Forces a refresh of all background tasks.</p>
          </div>
          <button 
            onClick={handleRunChecks}
            disabled={runningChecks}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-apple font-medium text-sm hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {runningChecks ? <Zap className="w-4 h-4 animate-pulse" /> : <Play className="w-4 h-4" />}
            {runningChecks ? "Running..." : "Run System Check"}
          </button>
        </div>
      </section>

      {/* Backup & Data */}
      <section className="bg-card border border-card-border rounded-apple shadow-sm p-6 space-y-6">
        <div className="space-y-1">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            Hardened Backup & Restore
          </h3>
          <p className="text-sm text-muted-foreground">Manage your local data portability and workspace snapshots.</p>
        </div>

        <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-apple">
          <p className="text-xs text-blue-700 font-medium uppercase tracking-wider mb-1">Architecture Status</p>
          <p className="text-xs text-blue-600">Backups capture the physical SQLite database and all file assets for 100% fidelity.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4 p-4 bg-muted/20 rounded-apple border border-card-border">
            <p className="text-sm font-semibold">Export & Backup</p>
            <div className="space-y-3">
              <button 
                onClick={handleExport}
                disabled={exporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-background border border-card-border rounded-apple text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <Download className="w-4 h-4" />
                {exporting ? "Exporting CRM..." : "Export CRM JSON"}
              </button>
              <button
                onClick={handleExportBackup}
                disabled={backuping}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-apple text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Database className="w-4 h-4" />
                {backuping ? "Creating Snapshot..." : "Create Full Backup"}
              </button>
              {(exportResult || backupResult) && (
                <p className="text-[10px] text-muted-foreground break-all bg-background p-2 rounded border border-card-border/50">
                  Last Saved: {exportResult?.path || backupResult?.path}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4 bg-muted/20 rounded-apple border border-card-border">
            <p className="text-sm font-semibold">Restore & Import</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Full Backup JSON</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                    placeholder="Path to .json"
                    className="flex-1 px-2 py-1.5 text-xs border border-card-border rounded bg-background"
                  />
                  <button 
                    onClick={handleImportBackup} 
                    disabled={!importPath.trim()} 
                    className="px-2 py-1.5 text-xs bg-muted border border-card-border rounded hover:bg-muted/80 disabled:opacity-50"
                  >
                    Restore
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Contacts CSV</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={contactsCsvPath}
                    onChange={(e) => setContactsCsvPath(e.target.value)}
                    placeholder="Path to .csv"
                    className="flex-1 px-2 py-1.5 text-xs border border-card-border rounded bg-background"
                  />
                  <button 
                    onClick={handleImportContactsCsv} 
                    disabled={!contactsCsvPath.trim()} 
                    className="px-2 py-1.5 text-xs bg-muted border border-card-border rounded hover:bg-muted/80 disabled:opacity-50"
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Preferences & Profile */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-apple shadow-sm p-6 space-y-4">
          <h3 className="text-lg font-medium">Master Profile</h3>
          <p className="text-sm text-muted-foreground">Your extracted professional fingerprint.</p>
          <a href="/profile" className="inline-block px-4 py-2 border border-card-border rounded-apple text-sm font-medium hover:bg-muted transition-colors">
            View Profile
          </a>
        </div>
        <div className="bg-card border border-card-border rounded-apple shadow-sm p-6 space-y-4">
          <h3 className="text-lg font-medium">Search Preferences</h3>
          <p className="text-sm text-muted-foreground">Target roles, locations, and expectations.</p>
          <a href="/preferences" className="inline-block px-4 py-2 border border-card-border rounded-apple text-sm font-medium hover:bg-muted transition-colors">
            Edit Preferences
          </a>
        </div>
      </section>

      {/* Automation Links */}
      <section className="bg-card border border-card-border rounded-apple shadow-sm p-6 space-y-4 text-center md:text-left">
        <h3 className="text-lg font-medium">Advanced Automation</h3>
        <p className="text-sm text-muted-foreground">Configure detailed scheduling, quiet hours, and notification channels.</p>
        <a href="/settings/automation" className="inline-block px-6 py-2.5 bg-background border border-card-border rounded-apple text-sm font-medium hover:bg-muted transition-colors">
          Manage Automation Pipelines
        </a>
      </section>

      {/* Local Storage Info */}
      <div className="pt-4 text-center">
        <p className="text-xs text-muted-foreground">
          Career Ops India is local-first. All data stored in: <code className="bg-muted px-1.5 py-0.5 rounded">~/.jobhunt-india</code>
        </p>
      </div>
    </div>
  );
}
