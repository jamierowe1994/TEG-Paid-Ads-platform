import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { hasDb, q } from "./db";
import { DATA_DIR } from "./data-dir";

/* People added to a launch roster AFTER the hardcoded list was written.
 *
 * TLE_LAUNCH_LIST is a fixed file — correct for the original thirteen, but it
 * means a latecomer (Rhiannon Dodge, 26 Aug) can only be added by editing
 * code and deploying. That's the wrong shape for something James does as
 * people join: adding a person is an operational act, not a release.
 *
 * So these live in the database beside the list and are merged into the
 * roster at read time. They behave identically once there — connect their
 * ads, then send the same magic-link invite everyone else got.
 *
 * BRAND-LOCKED at the API, not here: the tab is TLE's, and a mistyped brand
 * shouldn't be able to slip someone into a different business's roster.
 */

export interface LaunchExtra {
  email: string;
  name: string;
  brandId: string;
  addedBy: string | null;
  createdAt: string;
}

const FILE = path.join(DATA_DIR, "launch-list-extra.json");

async function readFile(): Promise<LaunchExtra[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return [];
  }
}
async function writeFile(all: LaunchExtra[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function listLaunchExtras(brandId: string): Promise<LaunchExtra[]> {
  if (hasDb()) {
    const rows = await q<{
      email: string;
      name: string;
      brand_id: string;
      added_by: string | null;
      created_at: string | Date;
    }>(
      "SELECT * FROM launch_list_extra WHERE brand_id = $1 ORDER BY created_at",
      [brandId]
    );
    return rows.map((r) => ({
      email: r.email,
      name: r.name,
      brandId: r.brand_id,
      addedBy: r.added_by,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }
  return (await readFile()).filter((e) => e.brandId === brandId);
}

export async function addLaunchExtra(opts: {
  email: string;
  name: string;
  brandId: string;
  addedBy: string | null;
}): Promise<LaunchExtra> {
  const email = opts.email.trim().toLowerCase();
  const entry: LaunchExtra = {
    email,
    name: opts.name.trim(),
    brandId: opts.brandId,
    addedBy: opts.addedBy,
    createdAt: new Date().toISOString(),
  };
  if (hasDb()) {
    // Re-adding someone updates their name rather than erroring — the likely
    // reason to re-add is a typo in the name the first time.
    await q(
      `INSERT INTO launch_list_extra (email, name, brand_id, added_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET name = $2, brand_id = $3`,
      [email, entry.name, entry.brandId, entry.addedBy]
    );
    return entry;
  }
  const all = (await readFile()).filter((e) => e.email !== email);
  all.push(entry);
  await writeFile(all);
  return entry;
}

export async function removeLaunchExtra(email: string): Promise<boolean> {
  const needle = email.trim().toLowerCase();
  if (hasDb()) {
    const rows = await q<{ email: string }>(
      "DELETE FROM launch_list_extra WHERE email = $1 RETURNING email",
      [needle]
    );
    return rows.length > 0;
  }
  const all = await readFile();
  const kept = all.filter((e) => e.email !== needle);
  if (kept.length === all.length) return false;
  await writeFile(kept);
  return true;
}
