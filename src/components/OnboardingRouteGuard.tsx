"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getOnboardingState } from "@/app/actions";

const PUBLIC_PATHS = ["/onboarding"];

export function OnboardingRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [checkedPath, setCheckedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
        setCheckedPath(pathname);
        return;
      }

      const state = await getOnboardingState();
      if (cancelled) return;

      if (!state.onboardingGate?.isComplete) {
        if (typeof window !== "undefined" && pathname !== "/onboarding") {
          window.location.replace("/onboarding");
        } else {
          router.replace("/onboarding");
        }
        return;
      }
      setCheckedPath(pathname);
    }

    check().catch(() => {
      if (!cancelled) router.replace("/onboarding");
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (checkedPath === pathname) return null;
  return null;
}
