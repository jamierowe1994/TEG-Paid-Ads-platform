"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The public marketing site should never appear inside the installed PWA.
// If this page is opened in standalone mode (launched from the home screen),
// send the user straight into the app — /dashboard, which itself redirects to
// /login when there's no valid session. In a normal browser this does nothing,
// so the marketing site renders as usual.
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function StandaloneGuard() {
  const router = useRouter();
  useEffect(() => {
    if (isStandalone()) router.replace("/dashboard");
  }, [router]);
  return null;
}
