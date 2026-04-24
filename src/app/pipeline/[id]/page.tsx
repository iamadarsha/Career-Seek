'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, MapPin, ExternalLink, Clock, Bell,
  Plus, ChevronDown, Star, Send, MessageSquare, FileText,
  CalendarDays, CheckCircle2, Trash2, Pin, Edit3, X,
  AlertCircle, Archive, TrendingUp, Eye, Briefcase, Mail, CalendarPlus, Users, Download,
} from 'lucide-react';
import {
  actionGetApplication, actionChangeStatus, actionGetTimeline,
  actionGetNotes, actionCreateNote, actionUpdateNote, actionDeleteNote, actionTogglePin,
  actionGetReminders, actionCreateReminder, actionCompleteReminder, actionDeleteReminder,
  actionGetLinkedDocuments, actionAutoLinkDocuments, actionDeleteApplication,
  actionExportApplicationPacket, actionExportApplicationCalendar, actionExportReminderCalendar,
  actionGetApplicationContacts, actionListContacts, actionCreateContact, actionLinkContactToApplication,
  actionGenerateEmailDraft, actionListEmailDrafts, actionExportEmailDraft,
} from '../pipeline-actions';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  saved: { label: 'Saved', color: '#86868B', bg: 'rgba(134,134,139,0.1)' },
  preparing: { label: 'Preparing', color: '#FF9500', bg: 'rgba(255,149,0,0.1)' },
  applied: { label: 'Applied', color: '#007AFF', bg: 'rgba(0,122,255,0.1)' },
  follow_up_due: { label: 'Follow-up Due', color: '#FF3B30', bg: 'rgba(255,59,48,0.1)' },
  recruiter_replied: { label: 'Recruiter Replied', color: '#34C759', bg: 'rgba(52,199,89,0.1)' },
  interview_scheduled: { label: 'Interview Scheduled', color: '#AF52DE', bg: 'rgba(175,82,222,0.1)' },
  interviewed: { label: 'Interviewed', color: '#5856D6', bg: 'rgba(88,86,214,0.1)' },
  assessment: { label: 'Assessment', color: '#FF9500', bg: 'rgba(255,149,0,0.1)' },
  offer: { label: 'Offer', color: '#34C759', bg: 'rgba(52,199,89,0.1)' },
  rejected: { label: 'Rejected', color: '#FF3B30', bg: 'rgba(255,59,48,0.1)' },
  archived: { label: 'Archived', color: '#8E8E93', bg: 'rgba(142,142,147,0.1)' },
};

const NOTE_CATEGORIES = ['general','recruiter','interview','salary','referral','follow_up'];
const REMINDER_CATEGORIES = ['follow_up','interview_prep','deadline','custom'];

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [app, setApp] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [appContacts, setAppContacts] = useState<any[]>([]);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [tab, setTab] = useState<'timeline'|'notes'|'reminders'|'documents'|'contacts'|'drafts'>('timeline');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const [aRes, tRes, nRes, rRes, dRes, cRes, allCRes, draftRes] = await Promise.all([
        actionGetApplication(id), actionGetTimeline(id), actionGetNotes(id),
        actionGetReminders(id), actionGetLinkedDocuments(id),
        actionGetApplicationContacts(id), actionListContacts(), actionListEmailDrafts(id),
      ]);
      if (aRes.success) setApp(aRes.application);
      if (tRes.success) setTimeline(tRes.events);
      if (nRes.success) setNotes(nRes.notes);
      if (rRes.success) setReminders(rRes.reminders);
      if (dRes.success) setDocs(dRes.documents);
      if (cRes.success) setAppContacts(cRes.contacts ?? []);
      if (allCRes.success) setAllContacts(allCRes.contacts ?? []);
      if (draftRes.success) setDrafts(draftRes.drafts);
    });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!app) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.saved;
  const overdueReminders = reminders.filter(r => !r.isCompleted && new Date(r.dueAt) < new Date());

  const handleStatusChange = async (s: string) => {
    await actionChangeStatus(id, s as any);
    setShowStatusMenu(false);
    load();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this application and all history?')) return;
    await actionDeleteApplication(id);
    router.push('/pipeline');
  };

  const handleAutoLink = async () => {
    if (app.scoredJobId) {
      await actionAutoLinkDocuments(id, app.scoredJobId);
      load();
    }
  };

  const handleExportPacket = async () => {
    setBusyAction('packet');
    const res = await actionExportApplicationPacket(id);
    setBusyAction(null);
    if ((res as any).success) {
      alert(`Application packet exported.\nJSON: ${(res as any).jsonPath}\nMarkdown: ${(res as any).markdownPath}`);
    } else {
      alert((res as any).error || 'Failed to export application packet');
    }
  };

  const handleExportFollowUpCalendar = async () => {
    setBusyAction('followup-calendar');
    const res = await actionExportApplicationCalendar({
      applicationId: id,
      eventType: 'follow_up',
    });
    setBusyAction(null);
    if ((res as any).success) {
      alert(`Calendar file created: ${(res as any).filePath}`);
    } else {
      alert((res as any).error || 'Failed to export calendar event');
    }
  };

  const handleExportInterviewCalendar = async () => {
    setBusyAction('interview-calendar');
    const res = await actionExportApplicationCalendar({
      applicationId: id,
      eventType: 'interview',
    });
    setBusyAction(null);
    if ((res as any).success) {
      alert(`Interview event exported: ${(res as any).filePath}`);
    } else {
      alert((res as any).error || 'Failed to export interview event');
    }
  };

  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—';
  const fmtTime = (d: any) => d ? new Date(d).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/pipeline" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Pipeline
        </Link>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handleExportPacket}
            disabled={busyAction === 'packet'}
            className="px-3 py-1.5 text-xs border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Export Packet</span>
          </button>
          <button
            onClick={handleExportFollowUpCalendar}
            disabled={busyAction === 'followup-calendar'}
            className="px-3 py-1.5 text-xs border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="inline-flex items-center gap-1"><CalendarPlus className="w-3.5 h-3.5" /> Follow-up .ics</span>
          </button>
          {(app.status === 'interview_scheduled' || app.status === 'interviewed') && (
            <button
              onClick={handleExportInterviewCalendar}
              disabled={busyAction === 'interview-calendar'}
              className="px-3 py-1.5 text-xs border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="inline-flex items-center gap-1"><CalendarPlus className="w-3.5 h-3.5" /> Interview .ics</span>
            </button>
          )}
          {app.url && (
            <a href={app.url} target="_blank" rel="noopener" className="p-2 text-muted-foreground hover:text-primary rounded-apple transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button onClick={handleDelete} className="p-2 text-muted-foreground hover:text-red-500 rounded-apple transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-card border border-card-border rounded-apple-lg p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{app.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{app.company}</span>
              {app.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{app.location}</span>}
              {app.portal && <span>{app.portal}</span>}
            </div>
          </div>
          {app.scoreSnapshot && (
            <div className="text-right">
              <span className="text-3xl font-bold" style={{ color: app.scoreSnapshot >= 75 ? '#34C759' : app.scoreSnapshot >= 50 ? '#FF9500' : '#86868B' }}>
                {app.scoreSnapshot}%
              </span>
              {app.tierSnapshot && <p className="text-xs text-muted-foreground mt-0.5">Tier {app.tierSnapshot}</p>}
            </div>
          )}
        </div>

        {/* Status + Key dates */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <button onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}>
              {cfg.label} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showStatusMenu && (
              <div className="absolute left-0 top-10 z-50 bg-card border border-card-border rounded-apple shadow-lg py-1 w-48">
                {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                  <button key={k} onClick={() => handleStatusChange(k)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 ${k === app.status ? 'font-medium' : ''}`}>
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: c.color }} />
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground">Saved {fmtDate(app.savedAt)}</span>
          {app.appliedAt && <span className="text-xs text-muted-foreground">Applied {fmtDate(app.appliedAt)}</span>}
          {overdueReminders.length > 0 && (
            <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{overdueReminders.length} overdue</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-card-border">
        {(['timeline','notes','reminders','documents','contacts','drafts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t}
            {t === 'reminders' && overdueReminders.length > 0 ? ` (${overdueReminders.length})` : ''}
            {t === 'contacts' ? ` (${appContacts.length})` : ''}
            {t === 'drafts' ? ` (${drafts.length})` : ''}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-card border border-card-border rounded-apple-lg shadow-sm overflow-hidden">
        {tab === 'timeline' && <TimelineTab events={timeline} />}
        {tab === 'notes' && <NotesTab notes={notes} appId={id} onRefresh={load} showAdd={showAddNote} setShowAdd={setShowAddNote} />}
        {tab === 'reminders' && <RemindersTab reminders={reminders} appId={id} onRefresh={load} showAdd={showAddReminder} setShowAdd={setShowAddReminder} />}
        {tab === 'documents' && <DocumentsTab docs={docs} onAutoLink={handleAutoLink} hasScored={!!app.scoredJobId} />}
        {tab === 'contacts' && <ContactsTab applicationId={id} linkedContacts={appContacts} allContacts={allContacts} onRefresh={load} />}
        {tab === 'drafts' && <DraftsTab applicationId={id} drafts={drafts} linkedContacts={appContacts} onRefresh={load} />}
      </div>
    </div>
  );
}

function TimelineTab({ events }: { events: any[] }) {
  if (events.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">No activity yet.</div>;
  return (
    <div className="p-4">
      <div className="relative pl-6 border-l-2 border-card-border space-y-4">
        {events.map(e => (
          <div key={e.id} className="relative">
            <div className="absolute -left-[calc(1.5rem+5px)] w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />
            <div>
              <p className="text-sm font-medium">{e.title}</p>
              {e.description && <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>}
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(e.createdAt).toLocaleString('en-IN')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesTab({ notes, appId, onRefresh, showAdd, setShowAdd }: any) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [editId, setEditId] = useState<number|null>(null);
  const [editContent, setEditContent] = useState('');

  const handleAdd = async () => {
    if (!content.trim()) return;
    await actionCreateNote(appId, content.trim(), category);
    setContent(''); setShowAdd(false); onRefresh();
  };
  const handleUpdate = async () => {
    if (!editContent.trim() || !editId) return;
    await actionUpdateNote(editId, editContent.trim());
    setEditId(null); onRefresh();
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Plus className="w-4 h-4" /> Add Note
        </button>
      </div>
      {showAdd && (
        <div className="border border-card-border rounded-apple p-3 space-y-2 animate-in fade-in duration-200">
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder="Write a note..."
            className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
          <div className="flex items-center justify-between">
            <select value={category} onChange={e => setCategory(e.target.value)} className="text-xs px-2 py-1 bg-background border border-card-border rounded">
              {NOTE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="text-xs text-muted-foreground">Cancel</button>
              <button onClick={handleAdd} disabled={!content.trim()} className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
      {notes.length === 0 && !showAdd && <p className="text-center text-sm text-muted-foreground py-6">No notes yet.</p>}
      {notes.map((n: any) => (
        <div key={n.id} className="border border-card-border rounded-apple p-3 group">
          {editId === n.id ? (
            <div className="space-y-2">
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3}
                className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditId(null)} className="text-xs text-muted-foreground">Cancel</button>
                <button onClick={handleUpdate} className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded">Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={async () => { await actionTogglePin(n.id); onRefresh(); }} className="p-1 text-muted-foreground hover:text-primary">
                    <Pin className={`w-3.5 h-3.5 ${n.isPinned ? 'fill-primary text-primary' : ''}`} />
                  </button>
                  <button onClick={() => { setEditId(n.id); setEditContent(n.content); }} className="p-1 text-muted-foreground hover:text-primary">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={async () => { await actionDeleteNote(n.id); onRefresh(); }} className="p-1 text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">{n.category}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(n.updatedAt).toLocaleDateString('en-IN')}</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function RemindersTab({ reminders, appId, onRefresh, showAdd, setShowAdd }: any) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [cat, setCat] = useState('follow_up');

  const handleAdd = async () => {
    if (!title.trim() || !dueAt) return;
    await actionCreateReminder({ applicationId: appId, title: title.trim(), dueAt, category: cat });
    setTitle(''); setDueAt(''); setShowAdd(false); onRefresh();
  };

  const now = new Date();

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Plus className="w-4 h-4" /> Add Reminder
        </button>
      </div>
      {showAdd && (
        <div className="border border-card-border rounded-apple p-3 space-y-3 animate-in fade-in duration-200">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Follow up with recruiter"
            className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
          <div className="flex gap-3">
            <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)}
              className="flex-1 px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <select value={cat} onChange={e => setCat(e.target.value)} className="px-2 py-2 bg-background border border-card-border rounded-apple text-sm">
              {REMINDER_CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_',' ')}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="text-xs text-muted-foreground">Cancel</button>
            <button onClick={handleAdd} disabled={!title.trim() || !dueAt} className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-50">Save</button>
          </div>
        </div>
      )}
      {reminders.length === 0 && !showAdd && <p className="text-center text-sm text-muted-foreground py-6">No reminders.</p>}
      {reminders.map((r: any) => {
        const overdue = !r.isCompleted && new Date(r.dueAt) < now;
        return (
          <div key={r.id} className={`flex items-center gap-3 border rounded-apple p-3 ${overdue ? 'border-red-300 bg-red-50/50 dark:bg-red-900/10 dark:border-red-800' : 'border-card-border'} ${r.isCompleted ? 'opacity-50' : ''}`}>
            <button onClick={async () => { if (!r.isCompleted) { await actionCompleteReminder(r.id); onRefresh(); } }}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${r.isCompleted ? 'border-green-500 bg-green-500' : overdue ? 'border-red-400' : 'border-card-border hover:border-primary'}`}>
              {r.isCompleted && <CheckCircle2 className="w-3 h-3 text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${r.isCompleted ? 'line-through' : ''}`}>{r.title}</p>
              <p className={`text-[10px] mt-0.5 ${overdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                {overdue ? 'Overdue — ' : ''}{new Date(r.dueAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
              </p>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">{r.category?.replace('_',' ')}</span>
            <button
              onClick={async () => {
                const res = await actionExportReminderCalendar(r.id);
                if ((res as any).success) {
                  alert(`Reminder exported: ${(res as any).filePath}`);
                } else {
                  alert((res as any).error || 'Failed to export reminder');
                }
              }}
              className="text-muted-foreground hover:text-primary p-1"
              title="Export .ics"
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
            <button onClick={async () => { await actionDeleteReminder(r.id); onRefresh(); }} className="text-muted-foreground hover:text-red-500 p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DocumentsTab({ docs, onAutoLink, hasScored }: { docs: any[]; onAutoLink: () => void; hasScored: boolean }) {
  const typeLabel: Record<string, string> = { resume: 'Resume', cover_letter: 'Cover Letter', outreach_note: 'Outreach Note', ats_report: 'ATS Report' };
  return (
    <div className="p-4 space-y-3">
      {hasScored && (
        <div className="flex justify-end">
          <button onClick={onAutoLink} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            <Plus className="w-4 h-4" /> Auto-link Documents
          </button>
        </div>
      )}
      {docs.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No documents linked. {hasScored ? 'Click auto-link to attach generated materials.' : 'Generate materials from the Documents section first.'}</p>
      ) : (
        docs.map((d: any) => (
          <div key={d.id} className="flex items-center gap-3 border border-card-border rounded-apple p-3">
            <div className="p-2 bg-primary/10 rounded-apple"><FileText className="w-4 h-4 text-primary" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{typeLabel[d.documentType] || d.documentType}</p>
              <p className="text-[10px] text-muted-foreground">v{d.version} — {new Date(d.linkedAt).toLocaleDateString('en-IN')}</p>
            </div>
            {d.atsScore && <span className="text-sm font-medium" style={{ color: d.atsScore >= 80 ? '#34C759' : '#FF9500' }}>ATS {d.atsScore}%</span>}
          </div>
        ))
      )}
    </div>
  );
}

function ContactsTab({ applicationId, linkedContacts, allContacts, onRefresh }: {
  applicationId: number;
  linkedContacts: any[];
  allContacts: any[];
  onRefresh: () => void;
}) {
  const [selectedContactId, setSelectedContactId] = useState('');
  const [newContact, setNewContact] = useState({
    fullName: '',
    role: '',
    company: '',
    source: '',
    linkedinUrl: '',
    email: '',
    notes: '',
  });

  const handleCreateAndLink = async () => {
    if (!newContact.fullName.trim()) return;
    const created = await actionCreateContact({
      fullName: newContact.fullName.trim(),
      role: newContact.role || undefined,
      company: newContact.company || undefined,
      source: newContact.source || undefined,
      linkedinUrl: newContact.linkedinUrl || undefined,
      email: newContact.email || undefined,
      notes: newContact.notes || undefined,
    });
    if (created.success && created.contact) {
      await actionLinkContactToApplication({
        contactId: created.contact.id,
        applicationId,
        relationship: 'recruiter',
      });
      setNewContact({ fullName: '', role: '', company: '', source: '', linkedinUrl: '', email: '', notes: '' });
      onRefresh();
    } else {
      alert(created.error || 'Failed to create contact');
    }
  };

  const handleLinkExisting = async () => {
    if (!selectedContactId) return;
    const res = await actionLinkContactToApplication({
      contactId: Number(selectedContactId),
      applicationId,
      relationship: 'recruiter',
    });
    if (!res.success) {
      alert(res.error || 'Failed to link contact');
      return;
    }
    setSelectedContactId('');
    onRefresh();
  };

  const linkedIds = new Set(linkedContacts.map((item: any) => item?.contact?.id).filter(Boolean));
  const available = allContacts.filter((c: any) => !linkedIds.has(c.id));

  return (
    <div className="p-4 space-y-5">
      <div className="space-y-2">
        <h3 className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Linked Contacts</h3>
        {linkedContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts linked to this application yet.</p>
        ) : (
          linkedContacts.map((row: any) => (
            <div key={row.link.id} className="border border-card-border rounded-apple p-3">
              <p className="text-sm font-medium">{row.contact?.fullName || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">
                {row.contact?.role || 'Role not set'} {row.contact?.company ? `• ${row.contact.company}` : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {row.contact?.email || 'No email'} {row.contact?.linkedinUrl ? `• ${row.contact.linkedinUrl}` : ''}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 border border-card-border rounded-apple p-3">
        <h4 className="text-sm font-medium">Link Existing Contact</h4>
        <div className="flex gap-2">
          <select
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="flex-1 px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          >
            <option value="">Select a contact</option>
            {available.map((c: any) => (
              <option key={c.id} value={c.id}>{c.fullName} {c.company ? `(${c.company})` : ''}</option>
            ))}
          </select>
          <button
            onClick={handleLinkExisting}
            disabled={!selectedContactId}
            className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-apple disabled:opacity-50"
          >
            Link
          </button>
        </div>
      </div>

      <div className="space-y-2 border border-card-border rounded-apple p-3">
        <h4 className="text-sm font-medium">Create Contact</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            value={newContact.fullName}
            onChange={(e) => setNewContact({ ...newContact, fullName: e.target.value })}
            placeholder="Full name"
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          />
          <input
            value={newContact.role}
            onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
            placeholder="Role"
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          />
          <input
            value={newContact.company}
            onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
            placeholder="Company"
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          />
          <input
            value={newContact.source}
            onChange={(e) => setNewContact({ ...newContact, source: e.target.value })}
            placeholder="Source (LinkedIn, referral, etc.)"
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          />
          <input
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
            placeholder="Email"
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          />
          <input
            value={newContact.linkedinUrl}
            onChange={(e) => setNewContact({ ...newContact, linkedinUrl: e.target.value })}
            placeholder="LinkedIn URL"
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          />
        </div>
        <textarea
          value={newContact.notes}
          onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })}
          placeholder="Notes"
          rows={2}
          className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleCreateAndLink}
            disabled={!newContact.fullName.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-apple disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Create and Link
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftsTab({ applicationId, drafts, linkedContacts, onRefresh }: {
  applicationId: number;
  drafts: any[];
  linkedContacts: any[];
  onRefresh: () => void;
}) {
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [working, setWorking] = useState(false);

  const handleGenerate = async (draftType: 'follow_up' | 'thank_you' | 'recruiter_reply' | 'outreach') => {
    setWorking(true);
    const res = await actionGenerateEmailDraft({
      applicationId,
      draftType,
      contactId: selectedContactId ? Number(selectedContactId) : undefined,
    });
    setWorking(false);
    if (!res.success) {
      alert(res.error || 'Failed to generate draft');
      return;
    }
    onRefresh();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="border border-card-border rounded-apple p-3 space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2"><Mail className="w-4 h-4" /> Generate Draft</h4>
        <div className="flex gap-2 flex-wrap">
          <select
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          >
            <option value="">No contact context</option>
            {linkedContacts.map((row: any) => (
              <option key={row.link.id} value={row.contact?.id}>{row.contact?.fullName || 'Unknown'}</option>
            ))}
          </select>
          <button onClick={() => handleGenerate('follow_up')} disabled={working} className="px-3 py-2 text-sm border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">Follow-up</button>
          <button onClick={() => handleGenerate('thank_you')} disabled={working} className="px-3 py-2 text-sm border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">Thank-you</button>
          <button onClick={() => handleGenerate('recruiter_reply')} disabled={working} className="px-3 py-2 text-sm border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">Recruiter Reply</button>
          <button onClick={() => handleGenerate('outreach')} disabled={working} className="px-3 py-2 text-sm border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">Outreach</button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No drafts generated yet.</p>
      ) : (
        drafts.map((draft: any) => (
          <div key={draft.id} className="border border-card-border rounded-apple p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{draft.subject || '(No subject)'}</p>
                <p className="text-[10px] text-muted-foreground">
                  {draft.draftType} • v{draft.version} • {new Date(draft.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(draft.contentText)}
                  className="px-2 py-1 text-xs border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Copy
                </button>
                <button
                  onClick={async () => {
                    const res = await actionExportEmailDraft(draft.id, 'text');
                    if (res.success) alert(`Draft exported: ${(res as any).filePath}`);
                    else alert((res as any).error || 'Failed to export draft');
                  }}
                  className="px-2 py-1 text-xs border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Export .txt
                </button>
                <button
                  onClick={async () => {
                    const res = await actionExportEmailDraft(draft.id, 'markdown');
                    if (res.success) alert(`Draft exported: ${(res as any).filePath}`);
                    else alert((res as any).error || 'Failed to export draft');
                  }}
                  className="px-2 py-1 text-xs border border-card-border rounded-apple hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Export .md
                </button>
              </div>
            </div>
            <pre className="text-xs whitespace-pre-wrap bg-muted/30 border border-card-border rounded-apple p-3">{draft.contentText}</pre>
          </div>
        ))
      )}
    </div>
  );
}
