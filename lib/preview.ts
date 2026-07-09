// Temporary client-side brand/colour preview override. Lets the team preview
// how the portal looks in each brand's colours (and tweak an accent) without
// changing any real data — stored in localStorage, applied on reload.

export function getPreviewBrandId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("teg_preview_brand");
  } catch {
    return null;
  }
}

export function getPreviewAccent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("teg_preview_accent");
  } catch {
    return null;
  }
}

export function setPreview(brandId: string | null, accent: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (brandId) window.localStorage.setItem("teg_preview_brand", brandId);
    else window.localStorage.removeItem("teg_preview_brand");
    if (accent) window.localStorage.setItem("teg_preview_accent", accent);
    else window.localStorage.removeItem("teg_preview_accent");
  } catch {
    /* ignore */
  }
}
