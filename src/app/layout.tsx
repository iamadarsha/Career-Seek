import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { JobMonitor } from "@/components/jobs/JobMonitor";

export const metadata: Metadata = {
  title: "JobHunt India",
  description: "Local-first AI-powered job search app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden antialiased">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="glass sticky top-0 z-10 border-b border-sidebar-border px-8 py-4">
            <header className="flex items-center justify-between">
              <h1 className="text-xl font-semibold tracking-tight">JobHunt India</h1>
              <div className="text-sm text-muted-foreground">Local First</div>
            </header>
          </div>
          <div className="p-8">
            {children}
          </div>
        </main>
        <JobMonitor profileId={1} />
      </body>
    </html>
  );
}
