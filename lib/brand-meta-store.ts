import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// Per-brand Meta config (ad account + page) that the admin sets from the
// Connections tab — so brands are added without touching env vars or
// redeploying. The System User token stays in env (it's the secret); only
// the non-secret account/page IDs live here. Env vars still work as a
// fallback for anything not set in the DB (keeps TRE working).

export interface BrandMeta {
  adAccountId: string | null;
  pageId: string | null;
}

const FILE = path.join(DATA_DIR, "brand-meta.json");

async function readFile(): Promise<Record<string, BrandMeta>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Record<
      string,
      BrandMeta
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
    }>("SELECT brand_id, ad_account_id, page_id FROM brand_meta");
    const map: Record<string, BrandMeta> = {};
    for (const r of rows) {
      map[r.brand_id] = { adAccountId: r.ad_account_id, pageId: r.page_id };
    }
    return map;
  }
  return readFile();
}

export async function setBrandMeta(
  brandId: string,
  adAccountId: string | null,
  pageId: string | null
): Promise<void> {
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
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
  map[brandId] = { adAccountId: acc, pageId: page };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
}
