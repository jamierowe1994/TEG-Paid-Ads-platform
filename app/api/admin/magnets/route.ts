import { NextRequest, NextResponse } from "next/server";
import { adminScope } from "@/lib/admin-auth";
import { brandById } from "@/lib/brands";
import { saveMagnet, listMagnets, deleteMagnet } from "@/lib/lead-magnets";

export const dynamic = "force-dynamic";

// Lead-magnet management. Super sees and manages every brand; marketing and
// MDs are confined to their own. This exists so the person who MAKES the
// guides (Francesca for TLE) uploads them herself rather than routing every
// PDF through James.

const MAX_BYTES = 15 * 1024 * 1024; // a guide, not a video
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

export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Send multipart form data." }, { status: 400 });
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  // Super picks the brand; scoped tiers ALWAYS upload to their own, whatever
  // the form claims.
  const brandId =
    scope.role === "super" ? String(form.get("brandId") ?? "").trim() : scope.brandId;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  if (!brandId || !brandById(brandId)) {
    return NextResponse.json({ error: "A valid brand is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Max 15 MB — that's a guide, not a video." }, { status: 400 });
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
