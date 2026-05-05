"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Plus, Trash2, User } from "lucide-react";
import {
  createProfile,
  deleteProfile,
  getProfiles,
  switchProfile,
} from "@/app/actions";
import { useRouter } from "next/navigation";

type Profile = { id: number; name: string; isDefault: boolean | null };

export function ProfileSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function load() {
    getProfiles().then((res) => {
      if (res.success) {
        setProfiles(res.profiles as Profile[]);
        setActiveId(res.activeProfileId);
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Focus new-name input when creating
  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const active = profiles.find((p) => p.id === activeId);

  function handleSwitch(id: number) {
    if (id === activeId) { setOpen(false); return; }
    startTransition(async () => {
      await switchProfile(id);
      setActiveId(id);
      setOpen(false);
      router.refresh();
    });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const res = await createProfile(newName.trim());
      if (res.success && res.profile) {
        setProfiles((prev) => [...prev, res.profile as Profile]);
        setNewName("");
        setCreating(false);
      }
    });
  }

  function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await deleteProfile(id);
      load();
    });
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-11 items-center gap-3 rounded-apple px-3 py-2.5 text-sm text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground transition-all"
      >
        <User className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">
          <span className="block text-[0.7rem] font-semibold uppercase tracking-wider opacity-60">Profile</span>
          <span className="block truncate font-semibold leading-none">{active?.name ?? "…"}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-apple border border-sidebar-border bg-sidebar shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSwitch(p.id)}
                disabled={pending}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                <span className="flex-1 truncate text-left text-sidebar-foreground">{p.name}</span>
                {p.id === activeId && <Check className="h-3.5 w-3.5 shrink-0 text-sunshine-300" />}
                {!p.isDefault && p.id !== activeId && (
                  <Trash2
                    className="h-3.5 w-3.5 shrink-0 text-sidebar-muted hover:text-red-400 transition-colors"
                    onClick={(e) => handleDelete(p.id, e)}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-sidebar-border p-2">
            {creating ? (
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="Profile name"
                  className="flex-1 rounded-md border border-sidebar-border bg-transparent px-2 py-1.5 text-xs text-sidebar-foreground placeholder:text-sidebar-muted outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || pending}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-sidebar-muted hover:text-sidebar-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
