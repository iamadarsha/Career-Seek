"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  Compass, 
  Bookmark, 
  Send, 
  FileText, 
  Bot, 
  BarChart2, 
  Settings,
  Briefcase,
  Bell,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: "Today", href: "/today", icon: Home },
  { name: "Discover", href: "/discover", icon: Compass },
  { name: "Pipeline", href: "/pipeline", icon: Briefcase },
  { name: "Saved", href: "/saved", icon: Bookmark },
  { name: "Applied", href: "/applied", icon: Send },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "AI Coach", href: "/coach", icon: Bot },
  { name: "Analytics", href: "/analytics", icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col glass z-20">
      <div className="p-6">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
          <Bot className="text-white w-5 h-5" />
        </div>
      </div>
      
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2 text-sm font-medium rounded-apple transition-colors",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <Link
          href="/settings"
          className={cn(
            "flex items-center px-3 py-2 text-sm font-medium rounded-apple transition-colors",
            pathname === "/settings"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
          )}
        >
          <Settings className={cn("w-5 h-5 mr-3", pathname === "/settings" ? "text-primary" : "text-muted-foreground")} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
