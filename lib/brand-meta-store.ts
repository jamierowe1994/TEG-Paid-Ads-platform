import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// Per-brand ad-platform config (Meta ad account/page + LinkedIn ad account)
// that the admin sets from the Connections tab — so brands are added without
// touching env vars or redeploying. Secrets (tokens) live elsewhere; only the
// non-secret account IDs live here. Env vars still work as a Meta fallback.

export interface BrandMeta {
  adAccountId: string | null; // Meta ad account
  pageId: string | null; // Meta page
  linkedinAdAccount: string | null; // LinkedIn sponsored account id
}

const FILE = path.join(DATA_DIR, "brand-meta.json");

// Older file records may lack newer fields, so read as Partial.
async function readFile(): Promise<Record<string, Partial<BrandMeta>>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Record<
      string,
      Partial<BrandMeta>
    >;
  } catch {
    return {};
  }
}

export async function getBrandMetaMap(): Promise<Record<string, BrandMeta>> {
  if (hasDb()) {
    const rows = await q<{
      brand_id: string;
      ad_account_id: string | null;
      page_id: string | null;
      linkedin_ad_account: string | null;
    }>(
      "SELECT brand_id, ad_account_id, page_id, linkedin_ad_account FROM brand_meta"
    );
    const map: Record<string, BrandMeta> = {};
    for (const r of rows) {
      map[r.brand_id] = {
        adAccountId: r.ad_account_id,
        pageId: r.page_id,
        linkedinAdAccount: r.linkedin_ad_account,
      };
    }
    return map;
  }
  const raw = await readFile();
  const map: Record<string, BrandMeta> = {};
  for (const k of Object.keys(raw)) {
    map[k] = {
      adAccountId: raw[k].adAccountId ?? null,
      pageId: raw[k].pageId ?? null,
      linkedinAdAccount: raw[k].linkedinAdAccount ?? null,
    };
  }
  return map;
}

const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);

export async function setBrandMeta(
  brandId: string,
  adAccountId: string | null,
  pageId: string | null
): Promise<void> {
  const acc = clean(adAccountId);
  const page = clean(pageId);
  if (hasDb()) {
    await q(
      `INSERT INTO brand_meta (brand_id, ad_account_id, page_id, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (brand_id)
       DO UPDATE SET ad_account_id = $2, page_id = $3, updated_at = NOW()`,
      [brandId, acc, page]
    );
    return;
  }
  const map = await readFile();
  map[brandId] = {
    adAccountId: acc,
    pageId: page,
    linkedinAdAccount: map[brandId]?.linkedinAdAccount ?? null,
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
}

export async function setBrandLinkedIn(
  brandId: string,
  linkedinAdAccount: string | null
): Promise<void> {
  const acc = clean(linkedinAdAccount);
  if (hasDb()) {
    await q(
      `INSERT INTO brand_meta (brand_id, linkedin_ad_account, updated_at)
       VALUES ($1,$2,NOW())
       ON CONFLICT (brand_id)
       DO UPDATE SET linkedin_ad_account = $2, updated_at = NOW()`,
      [brandId, acc]
    );
    return;
  }
  const map = await readFile();
  map[brandId] = {
    adAccountId: map[brandId]?.adAccountId ?? null,
    pageId: map[brandId]?.pageId ?? null,
    linkedinAdAccount: acc,
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
}
