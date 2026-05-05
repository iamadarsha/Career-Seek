"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Briefcase,
  Compass,
  FileText,
  Home,
  Settings,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { BrandMark } from "@/components/BrandMark";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const appNavItems = [
  { name: "Home", href: "/", icon: Home, hint: "Your next best step" },
  { name: "Jobs", href: "/discover", icon: Compass, hint: "Matches from every source" },
  { name: "Applications", href: "/pipeline", icon: Briefcase, hint: "Saved, applied, follow-ups" },
  { name: "Resume Kit", href: "/documents", icon: FileText, hint: "Resumes, ATS, letters" },
  { name: "Coach", href: "/coach", icon: Bot, hint: "Ask anything" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/today";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-ink lg:flex lg:flex-col">
      <div className="px-5 py-6">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark className="h-11 w-11 shadow-golden-sm" />
          <div>
            <p className="font-display text-base font-semibold leading-none">Career Seek</p>
            <p className="mt-1 text-xs text-sidebar-muted">India job search</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {appNavItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex min-h-12 items-center gap-3 rounded-apple px-3 py-3 text-sm transition-all",
                active
                  ? "bg-primary text-white shadow-golden-sm"
                  : "text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", active ? "text-sunshine-300" : "text-sidebar-muted group-hover:text-sunshine-300")} />
              <span className="min-w-0">
                <span className="block font-semibold leading-none">{item.name}</span>
                <span className={cn("mt-1 block truncate text-[0.68rem]", active ? "text-white/75" : "text-sidebar-muted")}>
                  {item.hint}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 pt-3 pb-1">
        <ProfileSwitcher />
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/settings"
          className={cn(
            "flex min-h-12 items-center gap-3 rounded-apple px-3 py-3 text-sm transition-all",
            isActive(pathname, "/settings")
              ? "bg-primary text-white shadow-golden-sm"
              : "text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground"
          )}
        >
          <Settings className={cn("h-5 w-5", isActive(pathname, "/settings") ? "text-sunshine-300" : "text-sidebar-muted")} />
          <span>
            <span className="block font-semibold leading-none">Settings</span>
            <span className="mt-1 block text-[0.68rem] opacity-75">Profile, AI, advanced</span>
          </span>
        </Link>
      </div>
    </aside>

  );
}
