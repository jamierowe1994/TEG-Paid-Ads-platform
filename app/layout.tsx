import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import FeedbackWidget from "@/components/FeedbackWidget";

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
      </body>
    </html>
  );
}
