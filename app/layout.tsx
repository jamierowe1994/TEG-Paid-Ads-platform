import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import FeedbackWidget from "@/components/FeedbackWidget";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Experts Group — Paid Ads Portal",
  description:
    "Paid advertising portal for The Experts Group agents — Property, Lettings, Mortgage, Recruitment and Commercial.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
