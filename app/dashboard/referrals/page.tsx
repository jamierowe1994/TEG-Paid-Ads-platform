"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  getUser,
  fetchReferrals,
  fetchReferralAgents,
  sendReferral,
  actOnReferral,
} from "@/lib/session";
import { BRANDS, brandById, type Brand, type BrandId } from "@/lib/brands";
import LocationPicker from "@/components/LocationPicker";
import { distanceKm, geocodeAddress } from "@/lib/google-maps";
import { geocodeUk } from "@/lib/geo-uk";
import type { Referral, LeadStage } from "@/lib/types";

// Referrals portal. The main area "advertises" every Experts Group business
// and the fee you earn for sending a lead its way — tap a business to learn
// more, then refer. Everything you've sent (and everything referred to you)
// lives in the rail on the right, where you can watch each one move down the
// pipeline: referred → accepted → converted → fee paid.

const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  attempt1: "Contact attempt 1",
  attempt2: "Contact attempt 2",
  attempt3: "Contact attempt 3",
  nurture: "Marketing funnel",
  converted: "Converted",
  pushed: "In CRM",
  lost: "Lost",
};

const STATUS_STYLE: Record<Referral["status"], string> = {
  pending: "bg-amber-50 text-amber-600",
  accepted: "bg-blue-50 text-blue-600",
  converted: "bg-green-50 text-green-600",
  paid: "bg-gray-900 text-white",
  declined: "bg-gray-100 text-gray-500",
  lost: "bg-gray-100 text-gray-500",
};

function money(n: number) {
  return `£${n.toLocaleString("en-GB")}`;
}

// ── Agent directory ──────────────────────────────────────────────────────────
// Agents you can refer to at a brand. Real agents come from the users table
// (via /api/referrals/agents) so you see their actual photo + how long they've
// been with the business. Brands with no agents in the system yet fall back to
// the demo directory below — a stand-in for the coverage database that's
// coming, at which point bios/availability/distance all come from there too.
interface RefAgent {
  id: string;
  name: string;
  photo: string | null; // real headshot, or null → initials avatar
  area: string; // where they cover
  since: string; // ISO — how long with the business
  bio: string;
  lat?: number; // patch centre — lets us rank by real distance to the pin
  lng?: number;
}

// Per-brand demo agents (used only when a brand has no real agents yet).
const DEMO_AGENTS: Partial<Record<BrandId, RefAgent[]>> = {
  property: [
    {
      id: "demo-kayleigh-p",
      name: "Kayleigh Wright",
      photo: null,
      area: "Liverpool & Merseyside",
      since: "2024-02-01",
      bio: "Kayleigh looks after residential sales across Liverpool and the Wirral — quick to call new valuations and great with first-time sellers.",
      lat: 53.4084,
      lng: -2.9916,
    },
    {
      id: "demo-marcus-p",
      name: "Marcus Bell",
      photo: null,
      area: "St Helens & Warrington",
      since: "2023-06-01",
      bio: "Marcus covers the St Helens and Warrington patch, with a strong track record on family homes.",
      lat: 53.4534,
      lng: -2.7376,
    },
  ],
  lettings: [
    {
      id: "demo-kayleigh-l",
      name: "Kayleigh Wright",
      photo: null,
      area: "Liverpool & Merseyside",
      since: "2024-02-01",
      bio: "Kayleigh helps landlords let faster across Liverpool — fast turnarounds and a full book of tenants ready to move.",
      lat: 53.4084,
      lng: -2.9916,
    },
  ],
  mortgage: [
    {
      id: "demo-tom-m",
      name: "Tom Barker",
      photo: null,
      area: "Leeds & West Yorkshire",
      since: "2022-09-01",
      bio: "Tom is a whole-of-market adviser covering Leeds and West Yorkshire, brilliant with tricky cases and self-employed clients.",
      lat: 53.8008,
      lng: -1.5491,
    },
  ],
  commercial: [
    {
      id: "demo-aisha-c",
      name: "Aisha Khan",
      photo: null,
      area: "Birmingham & the Midlands",
      since: "2023-01-01",
      bio: "Aisha handles commercial units across Birmingham and the wider Midlands — offices, retail and industrial.",
      lat: 52.4862,
      lng: -1.8904,
    },
  ],
  fineandcountry: [
    {
      id: "demo-oliver-f",
      name: "Oliver Grant",
      photo: null,
      area: "Cheshire",
      since: "2021-11-01",
      bio: "Oliver specialises in premium and country homes across Cheshire.",
      lat: 53.1934,
      lng: -2.8931,
    },
  ],
  auction: [
    {
      id: "demo-dan-a",
      name: "Dan Foster",
      photo: null,
      area: "North West",
      since: "2023-03-01",
      bio: "Dan runs residential and investment lots across the North West auction calendar.",
      lat: 53.4808,
      lng: -2.2426,
    },
  ],
};

// "since Jul 2024" / "3 years" style tenure from a start date.
function tenure(since: string): string {
  const start = new Date(since);
  if (!since || Number.isNaN(start.getTime())) return "On the team";
  const months =
    (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 12) {
    const m = Math.max(1, Math.round(months));
    return `${m} month${m === 1 ? "" : "s"} with the team`;
  }
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} with the team`;
}

// The furthest a partner can be from the referral and still be offered. Keeps
// the shortlist local — a 200-mile-away agent is no use to anyone.
const MAX_REFERRAL_MILES = 50;

// Rank agents by proximity to the referral. When we have a map pin, sort by
// real distance to each agent's patch centre (closest first). Otherwise fall
// back to a keyword match on the typed location — a hit floats to the top.
function rankByLocation(
  agents: RefAgent[],
  location: string,
  coords?: { lat: number; lng: number } | null
): RefAgent[] {
  if (coords && agents.some((a) => a.lat != null && a.lng != null)) {
    const far = Number.POSITIVE_INFINITY;
    return [...agents].sort((a, b) => {
      const da =
        a.lat != null && a.lng != null
          ? distanceKm(coords, { lat: a.lat, lng: a.lng })
          : far;
      const db =
        b.lat != null && b.lng != null
          ? distanceKm(coords, { lat: b.lat, lng: b.lng })
          : far;
      return da - db;
    });
  }
  const q = location.trim().toLowerCase();
  if (!q) return agents;
  return [...agents].sort((a, b) => {
    const am = a.area.toLowerCase().split(/[\s,&]+/).some((w) => w && q.includes(w));
    const bm = b.area.toLowerCase().split(/[\s,&]+/).some((w) => w && q.includes(w));
    return am === bm ? 0 : am ? -1 : 1;
  });
}

// Whole miles from the picked pin to an agent's patch — null unless we have
// both a pin and the agent's coordinates.
function distanceMiles(
  coords: { lat: number; lng: number } | null | undefined,
  a: RefAgent
): number | null {
  if (!coords || a.lat == null || a.lng == null) return null;
  return Math.round(distanceKm(coords, { lat: a.lat, lng: a.lng }) * 0.621371);
}

// ── Progress model ──────────────────────────────────────────────────────────
// The milestones we can honestly drive today from status + mirrored stage.
// Further granularity (on market / sold) will light up once the CRM feeds
// back — until then these four map exactly to what we track.
type Step = { label: string; done: boolean; current: boolean };

function journey(r: Referral, toBrand?: Brand): Step[] {
  if (r.status === "declined") {
    return [
      { label: "Referred", done: true, current: false },
      { label: "Declined", done: false, current: true },
    ];
  }
  // Accepted, then the lead didn't convert — a dead end, shown honestly.
  if (r.status === "lost") {
    return [
      { label: "Referred", done: true, current: false },
      { label: "Accepted", done: true, current: false },
      { label: "Didn't convert", done: false, current: true },
    ];
  }
  const accepted = r.status !== "pending";
  const converted =
    r.status === "converted" ||
    r.status === "paid" ||
    r.stage === "converted" ||
    r.stage === "pushed";
  const paid = r.status === "paid";
  const raw = [
    { label: "Referred", done: true },
    { label: "Accepted", done: accepted },
    { label: toBrand?.conversionLabel ?? "Converted", done: converted },
    { label: "Fee paid", done: paid },
  ];
  const firstOpen = raw.findIndex((s) => !s.done);
  return raw.map((s, i) => ({
    ...s,
    current: firstOpen === -1 ? i === raw.length - 1 : i === firstOpen,
  }));
}

export default function ReferralsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [tab, setTab] = useState<"send" | "received">("send");
  const [preview, setPreview] = useState<Brand | null>(null);
  // The brand we're referring INTO — opens the location → agent → details flow.
  const [wizardBrand, setWizardBrand] = useState<Brand | null>(null);
  const [open, setOpen] = useState<Referral | null>(null);
  const [toast, setToast] = useState("");

  async function reload() {
    setReferrals(await fetchReferrals());
  }

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    reload();
  }, []);

  const otherBrands = useMemo(
    () => BRANDS.filter((b) => b.id !== brand?.id),
    [brand]
  );
  const sent = referrals.filter((r) => r.direction === "sent");
  const received = referrals.filter((r) => r.direction === "received");

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function act(
    r: Referral,
    action: "accept" | "decline" | "markPaid",
    successMsg: string
  ) {
    const updated = await actOnReferral(r.id, action);
    if (updated) {
      await reload();
      setOpen((cur) => (cur && cur.id === r.id ? updated : cur));
      flash(successMsg);
    }
  }

  function openPreview(b: Brand) {
    setPreview(b);
  }
  function startRefer(b: Brand) {
    setPreview(null);
    setWizardBrand(b);
  }

  if (!brand) return null;

  const TABS: { id: "send" | "received"; label: string; count: number }[] = [
    { id: "send", label: "Send", count: sent.length },
    { id: "received", label: "Received", count: received.length },
  ];

  return (
    <div className="w-full">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Refer &amp; earn</h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          Every business in The Experts Group pays you for a lead that converts.
          Pick who you&apos;re sending someone to, see exactly what you&apos;ll
          earn, and track every referral all the way to your fee.
        </p>
      </div>

      {/* Two simple tabs */}
      <div className="mt-6 inline-flex rounded-xl border border-gray-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t.label}
            <span
              className={`ml-1.5 text-xs ${
                tab === t.id ? "text-white/60" : "text-gray-400"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* SEND — advertisement tiles, then the referrals you've sent */}
      {tab === "send" && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {otherBrands.map((b) => (
              <BrandTile key={b.id} brand={b} onOpen={() => openPreview(b)} />
            ))}
          </div>

          {sent.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Referrals you&apos;ve sent</h2>
              <div className="mt-4 space-y-3">
                {sent.map((r) => (
                  <ReferralRow
                    key={r.id}
                    referral={r}
                    viewerBrand={brand}
                    onClick={() => setOpen(r)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* RECEIVED — referrals sent to your business */}
      {tab === "received" && (
        <section className="mt-8 space-y-3">
          {received.map((r) => (
            <ReferralRow
              key={r.id}
              referral={r}
              viewerBrand={brand}
              onClick={() => setOpen(r)}
            />
          ))}
          {received.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
              No referrals have come in yet. When another business sends you one,
              it&apos;ll appear here to accept.
            </div>
          )}
        </section>
      )}

      {preview && (
        <BrandPreview
          brand={preview}
          onClose={() => setPreview(null)}
          onRefer={() => startRefer(preview)}
        />
      )}

      {wizardBrand && (
        <ReferWizard
          toBrand={wizardBrand}
          fromBrand={brand}
          onClose={() => setWizardBrand(null)}
          onSent={async (agentName) => {
            setWizardBrand(null);
            setTab("send");
            await reload();
            flash(`Referral sent to ${agentName} ✓`);
          }}
        />
      )}

      {open && (
        <ReferralDetail
          referral={open}
          viewerBrand={brand}
          onClose={() => setOpen(null)}
          onAct={act}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Advertisement tile ──────────────────────────────────────────────────────
function BrandTile({ brand: b, onOpen }: { brand: Brand; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <BrandBadge brand={b} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-tight">{b.name}</h3>
          <p className="text-xs text-gray-400">{b.audience}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-gray-500">
        {b.referralPitch}
      </p>

      <div className="mt-4 flex items-end justify-between border-t border-gray-100 pt-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            You earn up to
          </p>
          <p
            className="text-2xl font-semibold tracking-tight"
            style={{ color: b.accent }}
          >
            {money(b.referralFee)}
          </p>
        </div>
        <span
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition group-hover:opacity-90"
          style={{ backgroundColor: b.accent }}
        >
          Refer a lead →
        </span>
      </div>
    </button>
  );
}

// Brand logo in a soft tinted rounded square, falling back to a letter mark.
function BrandBadge({ brand: b, size = 44 }: { brand: Brand; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl"
      style={{ width: size, height: size, backgroundColor: b.accentSoft }}
    >
      <Image
        src={b.logo}
        alt={b.name}
        width={size - 12}
        height={size - 12}
        className="h-[70%] w-[70%] object-contain"
      />
    </div>
  );
}

// ── Preview modal ───────────────────────────────────────────────────────────
function BrandPreview({
  brand: b,
  onClose,
  onRefer,
}: {
  brand: Brand;
  onClose: () => void;
  onRefer: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band in the brand colour */}
        <div
          className="flex items-center gap-4 p-6"
          style={{ backgroundColor: b.accentSoft }}
        >
          <BrandBadge brand={b} size={60} />
          <div>
            <h2 className="text-xl font-semibold">{b.name}</h2>
            <p className="text-sm text-gray-500">{b.audience}</p>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm leading-relaxed text-gray-600">
            {b.referralAbout}
          </p>

          {/* Fee card */}
          <div
            className="mt-5 rounded-2xl p-5 text-white"
            style={{ backgroundColor: b.accent }}
          >
            <p className="text-sm text-white/70">Your referral fee</p>
            <p className="mt-1 text-3xl font-semibold">{money(b.referralFee)}</p>
            <p className="mt-1 text-sm text-white/80">{b.referralFeeNote}</p>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Paid to you once the deal completes. You&apos;ll see it move through
            every stage in your sent list until the fee lands.
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={onRefer}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: b.accent }}
            >
              Refer a lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Refer form ──────────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Refer-a-lead wizard: brand chosen → location → agent → lead details ──────
function AgentAvatar({
  name,
  photo,
  accent,
  size = 44,
}: {
  name: string;
  photo: string | null;
  accent: string;
  size?: number;
}) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: accent,
        fontSize: size * 0.4,
      }}
    >
      {name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}

function ReferWizard({
  toBrand,
  fromBrand,
  onClose,
  onSent,
}: {
  toBrand: Brand;
  fromBrand: Brand;
  onClose: () => void;
  onSent: (agentName: string) => void;
}) {
  const [step, setStep] = useState<
    "location" | "matching" | "agent" | "details" | "done"
  >("location");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pool, setPool] = useState<RefAgent[]>(DEMO_AGENTS[toBrand.id] ?? []);
  const [ranked, setRanked] = useState<RefAgent[]>([]);
  const [agent, setAgent] = useState<RefAgent | null>(null);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Real agents at this brand (their true photo + tenure); fall back to the
  // demo directory when the brand has nobody in the system yet.
  useEffect(() => {
    let cancelled = false;
    fetchReferralAgents(toBrand.id).then(async (real) => {
      if (real.length === 0) {
        if (!cancelled) setPool(DEMO_AGENTS[toBrand.id] ?? []);
        return;
      }
      const base: RefAgent[] = real.map((a) => ({
        id: a.id,
        name: a.name,
        photo: a.photo,
        area: a.location || "their patch",
        since: a.since,
        bio: `${a.name.split(" ")[0]} covers ${
          a.location || "the local area"
        } for ${toBrand.name}.`,
        // The Team Hub directory already geocodes each partner server-side.
        lat: a.lat,
        lng: a.lng,
      }));
      if (!cancelled) setPool(base);
      // Fill in coordinates only for agents the server couldn't geocode (e.g.
      // an area name with no postcode) — best-effort via Google, cached. No key
      // or no match just leaves them on the keyword path.
      const withCoords = await Promise.all(
        base.map(async (a) => {
          if (a.lat != null && a.lng != null) return a;
          if (!a.area || a.area === "their patch") return a;
          const c = await geocodeAddress(a.area);
          return c ? { ...a, lat: c.lat, lng: c.lng } : a;
        })
      );
      if (!cancelled) setPool(withCoords);
    });
    return () => {
      cancelled = true;
    };
  }, [toBrand.id, toBrand.name]);

  async function findAgent() {
    if (pool.length === 0) {
      setError("No agents listed for this business yet.");
      return;
    }
    setError("");
    setStep("matching");
    // Prefer the map-pin coords; otherwise geocode the typed location via
    // postcodes.io (works for a postcode/outcode with no Google key), so the
    // ranking is by real distance whenever we possibly can.
    let refCoords = coords;
    if (!refCoords && location.trim()) {
      refCoords = await geocodeUk(location);
      if (refCoords) setCoords(refCoords); // so the distance readout shows too
    }
    const order = rankByLocation(pool, location, refCoords);
    // Cap the shortlist to partners within 50 miles when we have a location
    // fix — nobody wants to be shown an agent 200 miles away. Partners we
    // couldn't place (no geo data yet — e.g. a brand still being set up) have
    // no distance, so they're kept rather than hidden, and referrals still work.
    let shortlist = order;
    if (refCoords) {
      const withinRange = order.filter((a) => {
        const d = distanceMiles(refCoords, a);
        return d == null || d <= MAX_REFERRAL_MILES;
      });
      if (withinRange.length === 0) {
        setError(
          `No ${toBrand.shortName} partner within ${MAX_REFERRAL_MILES} miles of that location yet.`
        );
        setStep("location");
        return;
      }
      shortlist = withinRange;
    }
    setRanked(shortlist);
    setAgent(shortlist[0]);
    setTimeout(() => setStep("agent"), 900);
  }

  async function submit() {
    if (!agent) return;
    if (!leadName.trim()) {
      setError("Enter the lead's name.");
      return;
    }
    setSending(true);
    setError("");
    const { error } = await sendReferral({
      toBrandId: toBrand.id,
      leadName: leadName.trim(),
      leadPhone: leadPhone.trim(),
      leadEmail: leadEmail.trim(),
      // Stamp who it's for so the recipient business knows the agent.
      note:
        `For ${agent.name} · ${agent.area}` +
        (note.trim() ? ` — ${note.trim()}` : ""),
      feeAmount: toBrand.referralFee,
      dueDate: null,
    });
    setSending(false);
    if (error) {
      setError(error);
      return;
    }
    setStep("done");
    setTimeout(() => onSent(agent.name.split(" ")[0]), 1400);
  }

  const firstName = agent?.name.split(" ")[0] ?? "them";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="modal-pop max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Location */}
        {step === "location" && (
          <div className="fade-up">
            <div className="flex items-center gap-3">
              <BrandBadge brand={toBrand} size={40} />
              <div>
                <h2 className="text-lg font-semibold leading-tight">
                  Refer to {toBrand.shortName}
                </h2>
                <p className="text-xs text-gray-400">
                  You earn {money(toBrand.referralFee)} when it converts
                </p>
              </div>
            </div>
            <h3 className="mt-6 text-lg font-semibold">
              Where&apos;s your referral based?
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              A town or postcode is enough — we&apos;ll match them to the closest
              {" "}
              {toBrand.shortName} agent.
            </p>
            <div className="mt-4">
              <LocationPicker
                accent={fromBrand.accent}
                value={location}
                onChange={({ label, lat, lng }) => {
                  setLocation(label);
                  if (lat != null && lng != null) setCoords({ lat, lng });
                  else setCoords(null);
                }}
                onEnter={findAgent}
              />
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={findAgent}
                className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: fromBrand.accent }}
              >
                Find an agent
              </button>
            </div>
          </div>
        )}

        {/* Matching animation */}
        {step === "matching" && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div
              className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200"
              style={{ borderTopColor: toBrand.accent }}
            />
            <p className="mt-5 font-medium text-gray-700">
              Finding the closest {toBrand.shortName} agent…
            </p>
            <p className="mt-1 text-sm text-gray-400">near {location}</p>
          </div>
        )}

        {/* Matched agent — split screen: close-by list left, featured right */}
        {step === "agent" && agent && (
          <div className="fade-up">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold leading-tight">
                  Closest {toBrand.shortName} agents
                </h2>
                <p className="text-xs text-gray-400">
                  {location ? `near ${location}` : "ranked by who's closest"}
                </p>
              </div>
              <button
                onClick={() => setStep("location")}
                className="shrink-0 text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                ← Change location
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,0.8fr)_1.2fr]">
              {/* LEFT — everyone close by, tap to feature. Distances shown when
                  we've got a pin to measure from. */}
              <div className="space-y-2 sm:order-1 sm:max-h-[52vh] sm:overflow-y-auto sm:pr-1">
                {ranked.map((o) => {
                  const active = o.id === agent.id;
                  const miles = distanceMiles(coords, o);
                  return (
                    <button
                      key={o.id}
                      onClick={() => setAgent(o)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <AgentAvatar
                        name={o.name}
                        photo={o.photo}
                        accent={toBrand.accent}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{o.name}</p>
                        <p className="truncate text-xs text-gray-400">
                          Covers {o.area}
                        </p>
                      </div>
                      {miles != null && (
                        <span
                          className="shrink-0 text-xs font-semibold"
                          style={{ color: toBrand.accent }}
                        >
                          {miles} mi
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* RIGHT — the featured agent, with the refer button at the base */}
              <div className="flex flex-col rounded-2xl border border-gray-200 p-4 sm:order-2">
                <div className="flex items-start gap-4">
                  <AgentAvatar
                    name={agent.name}
                    photo={agent.photo}
                    accent={toBrand.accent}
                    size={72}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold leading-tight">
                      {agent.name}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {toBrand.name} · Covers {agent.area}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {tenure(agent.since)}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-600">
                      ● Available now
                    </span>
                  </div>
                </div>

                {distanceMiles(coords, agent) != null && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-500">
                    <span>📍</span> About {distanceMiles(coords, agent)} miles
                    from {location || "your lead"}
                  </p>
                )}

                <p className="mt-3 border-t border-gray-100 pt-3 text-sm leading-relaxed text-gray-600">
                  {agent.bio}
                </p>

                <button
                  onClick={() => setStep("details")}
                  className="mt-4 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:mt-auto"
                  style={{ backgroundColor: toBrand.accent }}
                >
                  Refer to {firstName}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lead details */}
        {step === "details" && agent && (
          <div className="fade-up">
            <div className="flex items-center gap-3">
              <AgentAvatar
                name={agent.name}
                photo={agent.photo}
                accent={toBrand.accent}
                size={40}
              />
              <div>
                <h2 className="text-lg font-semibold leading-tight">
                  Refer to {agent.name}
                </h2>
                <p className="text-xs text-gray-400">
                  {toBrand.name} · {agent.area}
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <Field label="Lead name">
                <input
                  className={inputCls}
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact number">
                  <input
                    className={inputCls}
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="07700 900000"
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputCls}
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="name@email.com"
                  />
                </Field>
              </div>
              <Field label="Notes (optional)">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Any context that helps them close it"
                />
              </Field>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <div className="mt-6 flex justify-between gap-3">
              <button
                onClick={() => setStep("agent")}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                ← Back
              </button>
              <button
                onClick={submit}
                disabled={sending}
                className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: toBrand.accent }}
              >
                {sending ? "Sending…" : `Send referral to ${firstName}`}
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && agent && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 animate-[tick-pop_0.5s_cubic-bezier(0.22,1,0.36,1)] items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
              ✓
            </div>
            <p className="mt-4 font-semibold">
              Referral sent to {agent.name.split(" ")[0]}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              You&apos;ll see it move through to your fee in your Sent list.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Referral row (full width, under the tiles / on Received) ─────────────────
function ReferralRow({
  referral: r,
  viewerBrand,
  onClick,
}: {
  referral: Referral;
  viewerBrand: Brand;
  onClick: () => void;
}) {
  const other =
    r.direction === "received"
      ? brandById(r.fromBrandId)
      : brandById(r.toBrandId);
  const steps = journey(r, brandById(r.toBrandId));
  const accent = other?.accent ?? viewerBrand.accent;
  // The small caption under the fee: the furthest milestone reached — but for
  // a dead referral, name the dead end so it doesn't read as still-progressing.
  const lastDone =
    r.status === "lost"
      ? "Didn't convert"
      : r.status === "declined"
        ? "Declined"
        : ([...steps].reverse().find((s) => s.done)?.label ?? steps[0]?.label);

  return (
    <button
      onClick={onClick}
      className="block w-full rounded-2xl border border-gray-200 p-5 text-left transition hover:border-gray-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-4">
        {other && <BrandBadge brand={other} size={44} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{r.leadName}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[r.status]}`}
            >
              {r.status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-400">
            {r.direction === "received"
              ? `From ${other?.name}${r.fromName ? ` · ${r.fromName}` : ""}`
              : `To ${other?.name}`}
          </p>
          {/* Progress bar */}
          <div className="mt-3 flex max-w-xs items-center gap-1.5">
            {steps.map((s, i) => (
              <div
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{ backgroundColor: s.done ? accent : "#e5e7eb" }}
              />
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold text-gray-900">
            {money(r.feeAmount)}
          </p>
          <p className="text-xs text-gray-400">{lastDone}</p>
        </div>
      </div>
    </button>
  );
}

// ── Detail drawer ───────────────────────────────────────────────────────────
function ReferralProgress({
  referral: r,
  toBrand,
  accent,
}: {
  referral: Referral;
  toBrand?: Brand;
  accent: string;
}) {
  const steps = journey(r, toBrand);
  return (
    <ol className="mt-2 space-y-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const declined = s.label === "Declined";
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                style={{
                  backgroundColor: s.done
                    ? accent
                    : declined
                      ? "#9ca3af"
                      : "#e5e7eb",
                }}
              >
                {s.done ? (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: declined ? "white" : "#9ca3af" }}
                  />
                )}
              </span>
              {!last && (
                <span
                  className="my-0.5 w-0.5 flex-1"
                  style={{ backgroundColor: s.done ? accent : "#e5e7eb" }}
                />
              )}
            </div>
            <div className={`pb-4 ${last ? "" : ""}`}>
              <p
                className={`text-sm ${
                  s.current
                    ? "font-semibold text-gray-900"
                    : s.done
                      ? "font-medium text-gray-700"
                      : "text-gray-400"
                }`}
              >
                {s.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ReferralDetail({
  referral: r,
  viewerBrand,
  onClose,
  onAct,
}: {
  referral: Referral;
  viewerBrand: Brand;
  onClose: () => void;
  onAct: (
    r: Referral,
    action: "accept" | "decline" | "markPaid",
    msg: string
  ) => void;
}) {
  const from = brandById(r.fromBrandId);
  const to = brandById(r.toBrandId);
  const isRecipient = r.direction === "received";
  const other = isRecipient ? from : to;
  const accent = other?.accent ?? viewerBrand.accent;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-gray-900/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {other && <BrandBadge brand={other} size={40} />}
            <div>
              <h2 className="text-xl font-semibold leading-tight">
                {r.leadName}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {isRecipient
                  ? `Referred to you by ${r.fromName}`
                  : `You referred this to ${to?.name}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Fee banner */}
        <div
          className="mt-5 rounded-2xl p-5 text-white"
          style={{ backgroundColor: accent }}
        >
          <p className="text-sm text-white/70">
            {isRecipient
              ? "Referrer earns on conversion"
              : "You earn on conversion"}
          </p>
          <p className="mt-1 text-3xl font-semibold">{money(r.feeAmount)}</p>
          <p className="mt-1 text-sm text-white/80">
            {r.status === "paid"
              ? "Paid out ✓"
              : r.status === "converted"
                ? "Converted — fee now due"
                : r.status === "lost"
                  ? "Lead didn't convert — no fee due"
                  : r.status === "declined"
                    ? "Declined — no fee due"
                    : "Payable once the deal completes"}
          </p>
        </div>

        {/* Progress pipeline */}
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Progress
          </p>
          <ReferralProgress referral={r} toBrand={to} accent={accent} />
          <p className="-mt-1 text-xs text-gray-400">
            Updates flow both ways as {to?.shortName ?? "the team"} works the
            lead through their system.
          </p>
        </div>

        {/* Details */}
        <dl className="mt-6 space-y-3 text-sm">
          <Row label="Status">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}
            >
              {r.status}
            </span>
          </Row>
          {r.status !== "pending" && r.status !== "declined" && (
            <Row label="Stage">{STAGE_LABEL[r.stage]}</Row>
          )}
          <Row label="Phone">{r.leadPhone || "—"}</Row>
          <Row label="Email">{r.leadEmail || "—"}</Row>
          <Row label="Expected close">
            {r.dueDate
              ? new Date(r.dueDate).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "—"}
          </Row>
        </dl>

        {r.note && (
          <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            &ldquo;{r.note}&rdquo;
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          {isRecipient && r.status === "pending" && (
            <>
              <button
                onClick={() =>
                  onAct(r, "accept", `${r.leadName} added to your leads ✓`)
                }
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                style={{ backgroundColor: viewerBrand.accent }}
              >
                Accept → add to leads
              </button>
              <button
                onClick={() => onAct(r, "decline", "Referral declined")}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                Decline
              </button>
            </>
          )}
          {isRecipient && r.status === "accepted" && (
            <p className="text-sm text-gray-500">
              Now in your <span className="font-medium">Leads</span> — work it
              through the funnel there and the referrer sees the progress.
            </p>
          )}
          {r.status === "converted" && (
            <button
              onClick={() => onAct(r, "markPaid", "Marked as paid out")}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Mark fee paid
            </button>
          )}
        </div>

        {/* Activity */}
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Activity
          </p>
          <ol className="mt-3 space-y-3">
            {[...r.activity].reverse().map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <div>
                  <p className="text-gray-700">{a.text}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(a.at).toLocaleString("en-GB")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{children}</dd>
    </div>
  );
}
