import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";
import { getBaseAppDir } from "@/lib/local-paths";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Inter({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Career Seek",
  description: "A local-first job search workspace for discovering, evaluating, and tracking roles.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const baseAppDir = getBaseAppDir();
  const homeDir = process.env.HOME;
  const dataDirLabel = homeDir && baseAppDir.startsWith(homeDir)
    ? baseAppDir.replace(homeDir, "~")
    : baseAppDir;

  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased bg-background text-foreground font-sans">
        <AppChrome dataDirLabel={dataDirLabel}>{children}</AppChrome>
      </body>
    </html>
  );
}
