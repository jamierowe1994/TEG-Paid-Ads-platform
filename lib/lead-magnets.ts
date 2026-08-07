import "server-only";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { hasDb, q } from "./db";
import { DATA_DIR } from "./data-dir";

/* Lead magnets — the guides people fill a form to get.
 *
 * Agents kept asking "what did this lead actually apply for?" — the answer is
 * one of these PDFs, and until now nobody in the portal could see it. Files
 * live in Postgres (bytea) so they survive deploys like everything else; the
 * file-mode fallback mirrors the other stores for local dev. A magnet is a
 * few MB of PDF and there are tens of them, not thousands — bytea is fine and
 * saves a whole object-store integration.
 *
 * MATCHING is fuzzy on purpose. The ad's name ("Landlord Guide 2026 - Leeds")
 * and the magnet's title ("The 2026 Landlord Guide") never match exactly —
 * they're written by different people at different times. Token overlap
 * against normalised words, scored, best match above a floor wins. Wrong
 * match beats no match here: the button says which guide it is, so an agent
 * can tell at a glance if the match is off.
 */

export interface MagnetMeta {
  id: string;
  brandId: string;
  title: string;
  filename: string;
  mime: string;
  uploadedBy: string | null;
  createdAt: string;
  size: number;
}

const META_FILE = path.join(DATA_DIR, "lead-magnets.json");
const BLOB_DIR = path.join(DATA_DIR, "lead-magnets");

interface FileMeta extends MagnetMeta {
  blobFile: string;
}

async function readMeta(): Promise<FileMeta[]> {
  try {
    return JSON.parse(await fs.readFile(META_FILE, "utf8"));
  } catch {
    return [];
  }
}
async function writeMeta(all: FileMeta[]): Promise<void> {
  await fs.mkdir(BLOB_DIR, { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function saveMagnet(opts: {
  brandId: string;
  title: string;
  filename: string;
  mime: string;
  bytes: Buffer;
  uploadedBy: string | null;
}): Promise<MagnetMeta> {
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = new Date().toISOString();
  const meta: MagnetMeta = {
    id,
    brandId: opts.brandId,
    title: opts.title,
    filename: opts.filename,
    mime: opts.mime,
    uploadedBy: opts.uploadedBy,
    createdAt,
    size: opts.bytes.length,
  };
  if (hasDb()) {
    await q(
      `INSERT INTO lead_magnets (id, brand_id, title, filename, mime, bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, opts.brandId, opts.title, opts.filename, opts.mime, opts.bytes, opts.uploadedBy]
    );
    return meta;
  }
  const blobFile = path.join(BLOB_DIR, id);
  await fs.mkdir(BLOB_DIR, { recursive: true });
  await fs.writeFile(blobFile, opts.bytes);
  const all = await readMeta();
  all.push({ ...meta, blobFile });
  await writeMeta(all);
  return meta;
}

/** Metadata only — no bytes — for lists and matching. */
export async function listMagnets(brandId?: string): Promise<MagnetMeta[]> {
  if (hasDb()) {
    const rows = await q<{
      id: string;
      brand_id: string;
      title: string;
      filename: string;
      mime: string;
      uploaded_by: string | null;
      created_at: string | Date;
      size: string;
    }>(
      `SELECT id, brand_id, title, filename, mime, uploaded_by, created_at,
              octet_length(bytes)::text AS size
         FROM lead_magnets
        ${brandId ? "WHERE brand_id = $1" : ""}
        ORDER BY created_at DESC`,
      brandId ? [brandId] : []
    );
    return rows.map((r) => ({
      id: r.id,
      brandId: r.brand_id,
      title: r.title,
      filename: r.filename,
      mime: r.mime,
      uploadedBy: r.uploaded_by,
      createdAt: new Date(r.created_at).toISOString(),
      size: Number(r.size),
    }));
  }
  const all = await readMeta();
  return all
    .filter((m) => !brandId || m.brandId === brandId)
    .map(({ blobFile: _b, ...meta }) => meta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMagnet(
  id: string
): Promise<{ meta: MagnetMeta; bytes: Buffer } | null> {
  if (hasDb()) {
    const rows = await q<{
      id: string;
      brand_id: string;
      title: string;
      filename: string;
      mime: string;
      uploaded_by: string | null;
      created_at: string | Date;
      bytes: Buffer;
    }>("SELECT * FROM lead_magnets WHERE id = $1", [id]);
    const r = rows[0];
    if (!r) return null;
    return {
      meta: {
        id: r.id,
        brandId: r.brand_id,
        title: r.title,
        filename: r.filename,
        mime: r.mime,
        uploadedBy: r.uploaded_by,
        createdAt: new Date(r.created_at).toISOString(),
        size: r.bytes.length,
      },
      bytes: r.bytes,
    };
  }
  const all = await readMeta();
  const m = all.find((x) => x.id === id);
  if (!m) return null;
  try {
    const bytes = await fs.readFile(m.blobFile);
    const { blobFile: _b, ...meta } = m;
    return { meta, bytes };
  } catch {
    return null;
  }
}

export async function renameMagnet(id: string, title: string): Promise<boolean> {
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      "UPDATE lead_magnets SET title = $2 WHERE id = $1 RETURNING id",
      [id, title]
    );
    return rows.length > 0;
  }
  const all = await readMeta();
  const idx = all.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], title };
  await writeMeta(all);
  return true;
}

export async function deleteMagnet(id: string): Promise<boolean> {
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      "DELETE FROM lead_magnets WHERE id = $1 RETURNING id",
      [id]
    );
    return rows.length > 0;
  }
  const all = await readMeta();
  const m = all.find((x) => x.id === id);
  if (!m) return false;
  await fs.unlink(m.blobFile).catch(() => {});
  await writeMeta(all.filter((x) => x.id !== id));
  return true;
}

/* ---------- pinned mappings ---------- */

/* Fuzzy matching has an honest limit: an ad named "X Renters FB FAQ" shares
 * not one word with "The 37-Step Guide to Staying Compliant" (Zill's leads,
 * 7 Aug). Pins bridge it: an admin says THIS ad offers THIS guide, once, and
 * the pin beats the fuzzy match forever after. Keyed on the normalised ad
 * name so casing/spacing wobbles don't fork the mapping. */

const MAP_FILE = path.join(DATA_DIR, "magnet-map.json");

export function adKey(adName: string): string {
  return adName.toLowerCase().replace(/\s+/g, " ").trim();
}

type MapFile = Record<string, string>; // `${brandId}\u0000${adKey}` -> magnetId

async function readMap(): Promise<MapFile> {
  try {
    return JSON.parse(await fs.readFile(MAP_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function pinMagnet(
  brandId: string,
  adName: string,
  magnetId: string | null
): Promise<void> {
  const key = adKey(adName);
  if (hasDb()) {
    if (magnetId === null) {
      await q("DELETE FROM magnet_map WHERE brand_id = $1 AND ad_key = $2", [brandId, key]);
    } else {
      await q(
        `INSERT INTO magnet_map (brand_id, ad_key, magnet_id) VALUES ($1,$2,$3)
           ON CONFLICT (brand_id, ad_key) DO UPDATE SET magnet_id = $3`,
        [brandId, key, magnetId]
      );
    }
    return;
  }
  const map = await readMap();
  const k = `${brandId}\u0000${key}`;
  if (magnetId === null) delete map[k];
  else map[k] = magnetId;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MAP_FILE, JSON.stringify(map, null, 2), "utf8");
}

export async function pinnedMagnetId(
  brandId: string,
  adName: string
): Promise<string | null> {
  const key = adKey(adName);
  if (hasDb()) {
    const rows = await q<{ magnet_id: string }>(
      "SELECT magnet_id FROM magnet_map WHERE brand_id = $1 AND ad_key = $2",
      [brandId, key]
    );
    return rows[0]?.magnet_id ?? null;
  }
  return (await readMap())[`${brandId}\u0000${key}`] ?? null;
}

export async function allPins(brandId: string): Promise<Record<string, string>> {
  if (hasDb()) {
    const rows = await q<{ ad_key: string; magnet_id: string }>(
      "SELECT ad_key, magnet_id FROM magnet_map WHERE brand_id = $1",
      [brandId]
    );
    return Object.fromEntries(rows.map((r) => [r.ad_key, r.magnet_id]));
  }
  const map = await readMap();
  const out: Record<string, string> = {};
  const prefix = `${brandId}\u0000`;
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}

/** The one resolution every consumer should use: pin first, fuzzy second. */
export async function resolveMagnet(
  brandId: string,
  adName: string | null | undefined,
  fallbackText: string,
  magnets: MagnetMeta[]
): Promise<{ magnet: MagnetMeta | null; pinned: boolean }> {
  if (adName) {
    const id = await pinnedMagnetId(brandId, adName);
    if (id) {
      const m = magnets.find((x) => x.id === id);
      if (m) return { magnet: m, pinned: true };
      // Pin points at a deleted magnet — fall through to fuzzy rather than
      // showing nothing.
    }
  }
  return { magnet: matchMagnet(fallbackText || adName || "", magnets), pinned: false };
}

/* ---------- matching ---------- */

/* Stop words are ONLY glue words. "Guide" and years stay in: with a library
   of guides, "guide" costs nothing, and the year is what tells the 2025
   edition from the 2026 one. (First cut stop-listed both and stemmed
   nothing, and "Landlords Guide 2026" failed to match "The Landlord Guide
   2026" — caught in verification, 7 Aug.) */
const STOP = new Set(["the", "a", "an", "of", "for", "to", "and", "your", "our"]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/\.(pdf|png|jpe?g)$/i, "") // file extension is noise
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      // Light stemming: landlords/landlord, guides/guide match each other.
      .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
  );
}

/** Best-scoring magnet for an ad/form name, or null when nothing plausibly
 *  matches. Exported for the API route; kept here so the scoring lives next
 *  to the data it scores. */
export function matchMagnet(
  leadText: string,
  magnets: MagnetMeta[]
): MagnetMeta | null {
  const lead = tokens(leadText);
  if (lead.size === 0) return null;
  let best: MagnetMeta | null = null;
  let bestScore = 0;
  for (const m of magnets) {
    const mt = tokens(`${m.title} ${m.filename}`);
    if (mt.size === 0) continue;
    let hits = 0;
    for (const w of lead) if (mt.has(w)) hits++;
    // Overlap relative to the SMALLER set: a short title fully contained in a
    // long ad name is a strong match even though the ad has extra words.
    const score = hits / Math.min(lead.size, mt.size);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return bestScore >= 0.5 ? best : null;
}
