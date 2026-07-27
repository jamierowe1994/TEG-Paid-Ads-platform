# System logos (integrations diagram)

Drop logos in here and the "Everything plugs into one place" section on the
landing page swaps its text lettermark for the real mark.

## Filenames

| File        | System |
| ----------- | ------ |
| `rex.png`   | REX    |
| `atlas.png` | Atlas  |

`.svg` also works — the diagram tries `.svg` first, then `.png`.

## What works best

- **Transparent background**, and crop the padding tight to the mark — the
  image is scaled to ~44px tall, so empty canvas around the logo makes it
  render smaller than it needs to.
- **~200px** on the long edge is plenty.
- **Colour doesn't matter.** The diagram flattens each logo to white so both
  sides match the platform icons opposite. A one-colour mark works best.

## Note

Which file exists is resolved on the server when the page is built, not in the
browser — so a logo dropped in here appears after the next build. Pushing
triggers one, and adding a logo is a commit anyway.

## No logo yet?

Nothing breaks — a system with no file keeps its text lettermark (REX / ATLAS),
exactly as it looks today.
