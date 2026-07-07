# Fonts — Uni Text (headings)

The Experts Group uses **Uni Text** for headings and **Montserrat** for body
text. Montserrat is already loaded (via Google Fonts). Uni Text is a custom
font, so its files need to live here.

## To enable Uni Text

1. Drop the font files in this folder, ideally as `.woff2` (best for web).
   Typical names:
   - `UniText-Regular.woff2`
   - `UniText-Bold.woff2`
   (If you only have `.ttf`/`.otf`, that's fine — send them over and I'll
   convert to woff2, or the @font-face `src` can point at them directly.)

2. In `app/globals.css`, uncomment the `@font-face` block at the top and set:
   ```css
   --font-heading: "Uni Text", var(--font-montserrat), system-ui, sans-serif;
   ```

That's it — every heading switches to Uni Text. Until then headings render in
Montserrat automatically, so nothing looks broken in the meantime.
