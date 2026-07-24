import type { MetadataRoute } from "next";

// PWA manifest — makes the portal installable to the home screen and, with
// display:"standalone", launch full-screen with no browser chrome (this is the
// same on-screen result a Capacitor native wrapper gives). Prototype only:
// lives on the `capacitor-prototype` branch while we evaluate the app route.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LaunchPad — The Experts Group",
    short_name: "LP",
    description: "Paid advertising portal for The Experts Group agents.",
    start_url: "/",
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
