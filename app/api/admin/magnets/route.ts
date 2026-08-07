import { NextRequest, NextResponse } from "next/server";
import { adminScope } from "@/lib/admin-auth";
import { brandById } from "@/lib/brands";
import { saveMagnet, listMagnets, deleteMagnet, renameMagnet } from "@/lib/lead-magnets";

export const dynamic = "force-dynamic";

// Lead-magnet management. Super sees and manages every brand; marketing and
// MDs are confined to their own. This exists so the person who MAKES the
// guides (Francesca for TLE) uploads them herself rather than routing every
// PDF through James.

// 50MB per file — design-heavy guide PDFs run big. (The first cap was 15MB
// and real guides bounced off it with a misleading parse error.)
const MAX_BYTES = 50 * 1024 * 1024;
const OK_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const brand =
    scope.role === "super"
      ? req.nextUrl.searchParams.get("brand") ?? undefined
      : scope.brandId;
  return NextResponse.json({ magnets: await listMagnets(brand) });
}

/** "Landlord-Guide_2026-FINAL-v3.pdf" -> "Landlord Guide 2026" — the title a
 *  filename was trying to be. Bulk uploads take their titles from this;
 *  titles stay editable after (PATCH), since the title drives lead matching. */
function titleFromFilename(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\(\d+\)/g, " ")
    .replace(/\b(final|draft|copy|v\d+)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Refuse an oversized request BEFORE parsing it: letting a 200MB body
  // stream in just to reject it is where "uploading takes forever then
  // fails with a weird message" comes from.
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { error: `That upload is ${(len / 1048576).toFixed(0)} MB — the limit is 50 MB per file.` },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    // The old handler swallowed this and said "Send multipart form data",
    // which told James nothing when a real upload died mid-stream.
    console.error("[magnets] form parse failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "The upload didn't arrive intact — usually a connection drop mid-file. Try that file again." },
      { status: 400 }
    );
  }

  // One request, one file — the CLIENT loops for bulk, so one bad file or
  // one dropped connection costs that file alone, not the batch.
  const file = form.get("file");
  const brandId =
    scope.role === "super" ? String(form.get("brandId") ?? "").trim() : scope.brandId;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  const title =
    String(form.get("title") ?? "").trim() || titleFromFilename(file.name || "");
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  if (!brandId || !brandById(brandId)) {
    return NextResponse.json({ error: "A valid brand is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `"${file.name}" is ${(file.size / 1048576).toFixed(0)} MB — the limit is 50 MB.` },
      { status: 400 }
    );
  }
  const mime = file.type || "application/pdf";
  if (!OK_MIME.has(mime)) {
    return NextResponse.json({ error: "PDFs and images only." }, { status: 400 });
  }

  const meta = await saveMagnet({
    brandId,
    title,
    filename: file.name || `${title}.pdf`,
    mime,
    bytes: Buffer.from(await file.arrayBuffer()),
    uploadedBy: scope.role === "super" ? "super admin" : scope.email,
  });
  return NextResponse.json({ ok: true, magnet: meta });
}

/** Rename — the title drives lead matching, so a bulk-derived title that
 *  doesn't match how the ads name the guide needs fixing without a
 *  delete-and-reupload. Body: { id, title } */
export async function PATCH(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const title = String(body?.title ?? "").trim();
  if (!id || !title) {
    return NextResponse.json({ error: "id and title required" }, { status: 400 });
  }
  if (scope.role !== "super") {
    const own = await listMagnets(scope.brandId);
    if (!own.some((m) => m.id === id)) {
      return NextResponse.json({ error: "Not your brand's magnet." }, { status: 403 });
    }
  }
  const ok = await renameMagnet(id, title);
  return NextResponse.json({ ok });
}

export async function DELETE(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Scoped tiers can only delete within their brand.
  if (scope.role !== "super") {
    const own = await listMagnets(scope.brandId);
    if (!own.some((m) => m.id === id)) {
      return NextResponse.json({ error: "Not your brand's magnet." }, { status: 403 });
    }
  }
  const gone = await deleteMagnet(id);
  return NextResponse.json({ ok: gone });
}
