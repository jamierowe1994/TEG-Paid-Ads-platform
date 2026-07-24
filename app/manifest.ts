import type { MetadataRoute } from "next";

// PWA manifest — makes the portal installable to the home screen and, with
// display:"standalone", launch full-screen with no browser chrome (this is the
// same on-screen result a Capacitor native wrapper gives).
//
// start_url is the APP, not the marketing site: the installed app opens
// straight into /dashboard — if the session is still valid you land on the
// overview, otherwise the dashboard bounces you to /login. Either way the
// public website is never shown inside the installed app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Launch Pad — The Experts Group",
    short_name: "Launch Pad",
    description: "Paid advertising portal for The Experts Group agents.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e31f36",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
