import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import FeedbackWidget from "@/components/FeedbackWidget";
import InstallGate from "@/components/InstallGate";

// Body font: Montserrat (Experts Group brand typeface).
// Heading font: "Uni Text" — a custom font supplied by the client. Until the
// font files are added (see app/fonts/README.md), headings fall back to
// Montserrat automatically. The @font-face + swap is wired in globals.css.
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Experts Group — Paid Ads Portal",
  description:
    "Paid advertising portal for The Experts Group agents — Property, Lettings, Mortgage, Recruitment, Commercial, Fine & Country and The Auction Company.",
  // Standalone PWA config. appleWebApp.capable is what makes iOS Safari launch
  // the home-screen icon full-screen with no browser chrome — the same
  // on-screen result as a Capacitor native wrapper. The home-screen label is
  // "Launch Pad".
  applicationName: "Launch Pad",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Launch Pad",
    statusBarStyle: "black-translucent",
  },
  // Explicit legacy Apple tag for older iOS versions (iOS <18 needs the
  // apple-prefixed name; iOS 18+ reads the standard mobile-web-app-capable).
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

// viewport-fit=cover lets the mobile bottom nav honour the safe-area inset and
// sit correctly against the browser chrome. No effect on desktop.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e31f36",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>
        {children}
        <FeedbackWidget />
        <InstallGate />
      </body>
    </html>
  );
}
