// The Experts Group — brand registry.
// Signup email domains are matched against `domains` to route each agent
// into the correct business dashboard automatically. Each brand carries its
// own accent colour (used to theme the dashboard), its CRM, and the label
// it uses for a "successful" conversion (see conversionLabel).

export type BrandId =
  | "property"
  | "lettings"
  | "mortgage"
  | "recruitment"
  | "commercial"
  | "fineandcountry"
  | "auction";

/* Every referral fee on screen is GROSS commission to the business — what the
   deal earns before the referrer's own split is applied. Shown everywhere a
   fee appears so nobody reads the headline number as take-home pay. */
export const GROSS_FEE_NOTE =
  "Gross commission — subject to your normal split";

export interface Brand {
  id: BrandId;
  name: string;
  shortName: string;
  /**
   * Two-or-three letter mark for tight spaces — the portal sidebar, where the
   * full name would otherwise wrap over three lines. Not an acronym for its
   * own sake: these are what people in the group actually call each business.
   */
  initials: string;
  domains: string[];
  accent: string; // hex accent colour used to theme the dashboard
  accentSoft: string; // light tint for backgrounds/badges
  crmName: string; // the CRM leads get pushed to
  conversionLabel: string; // what a "successful" converted lead is called
  conversionVerb: string; // button text, e.g. "Book Market Appraisal"
  audience: string; // who the agents are
  logo: string; // /brand-logos/<id>.png — falls back to a letter mark
  // Referrals advertising: what an agent earns for referring a lead into this
  // business, how that fee is worked out, and the sales pitch shown on the
  // referrals tiles / preview so people know exactly who to send over.
  referralFee: number; // headline average fee, in £
  referralFeeNote: string; // the small print on how the fee is calculated
  referralPitch: string; // one-line hook on the tile
  referralAbout: string; // couple of sentences for the preview modal
}

// The parent group brand. Used on the marketing/pre-login pages (landing,
// signup, login) where we don't yet know which business the visitor is with.
export const EXPERTS_GROUP = {
  name: "The Experts Group",
  accent: "#E31F36", // Experts Group red
  accentDark: "#C11A2E",
  accentSoft: "#FEF2F2",
  logo: "/brand-logos/group-black.png",
};

export const BRANDS: Brand[] = [
  {
    id: "property",
    name: "The Property Experts",
    shortName: "Property",
    initials: "TPE",
    // Prestige Property Experts is a higher-end sub-brand of The Property
    // Experts, not a separate business — its people sit under this brand.
    domains: [
      "thepropertyexperts.co.uk",
      "propertyexperts.co.uk",
      "prestigepropertyexperts.co.uk",
    ],
    accent: "#E31F36", // red (shared group/estate colour)
    accentSoft: "#FEF2F2",
    crmName: "REX",
    conversionLabel: "Market Appraisal (MA)",
    conversionVerb: "Book Market Appraisal",
    audience: "Estate agents",
    logo: "/brand-logos/TPE - Icon.png",
    referralFee: 850,
    referralFeeNote: "0.25% of the sale price · average sale £341k",
    referralPitch: "Know someone thinking of selling? Send them our way.",
    referralAbout:
      "Our estate agents win the instruction and take the sale all the way to completion. Refer any homeowner weighing up a move and you'll earn on every one that sells.",
  },
  {
    id: "lettings",
    name: "The Lettings Experts",
    shortName: "Lettings",
    initials: "TLE",
    domains: ["thelettingexperts.co.uk", "lettingexperts.co.uk"],
    accent: "#E31F36", // red
    accentSoft: "#FEF2F2",
    crmName: "REX",
    conversionLabel: "Market Appraisal (MA)",
    conversionVerb: "Book Market Appraisal",
    audience: "Lettings agents",
    logo: "/brand-logos/TLE - Icon.png",
    referralFee: 150,
    referralFeeNote: "25% of the setup fee · average setup £600",
    referralPitch: "Landlords with a property to let — we'll get it tenanted.",
    referralAbout:
      "We take landlords from empty property to signed tenancy and ongoing management. Refer any landlord and you earn a share of the setup fee once they're on board.",
  },
  {
    id: "mortgage",
    name: "The Mortgage Experts",
    shortName: "Mortgage",
    initials: "TME",
    // mab.org.uk is Mortgage Advice Bureau, this brand's parent — a large
    // share of Mortgage Experts partners are on that domain.
    domains: [
      "themortgageexperts.co.uk",
      "mortgageexperts.co.uk",
      "mab.org.uk",
    ],
    accent: "#2B6193", // blue
    accentSoft: "#EEF4FA",
    crmName: "CRM",
    conversionLabel: "Appointment Booked",
    conversionVerb: "Book Appointment",
    audience: "Mortgage advisers",
    logo: "/brand-logos/TMGE - Icon.png",
    referralFee: 500,
    referralFeeNote: "Average per completed mortgage (£400–£600)",
    referralPitch: "Anyone buying, moving or remortgaging? We sort the finance.",
    referralAbout:
      "Our advisers handle the whole mortgage — buying, moving home or remortgaging — start to completion. Refer anyone who needs finance and you earn once their mortgage completes.",
  },
  {
    id: "recruitment",
    name: "The Recruitment Experts",
    shortName: "Recruitment",
    initials: "TRE",
    domains: ["therecruitmentexperts.co.uk", "recruitmentexperts.co.uk"],
    accent: "#998170", // bronze
    accentSoft: "#F6F3F1",
    crmName: "Atlas",
    conversionLabel: "Appointment Booked",
    conversionVerb: "Book Appointment",
    audience: "Recruiters",
    logo: "/brand-logos/TRE - Icon.png",
    referralFee: 600,
    referralFeeNote: "£600 per successful placement",
    referralPitch: "Businesses hiring, or great people looking — we place them.",
    referralAbout:
      "We recruit across the board — refer a business that's hiring or a strong candidate on the move and we take it from first call to placement. You earn £600 on every successful placement.",
  },
  {
    id: "commercial",
    name: "The Commercial Property Experts",
    shortName: "Commercial",
    initials: "TCPE",
    domains: ["thecommercialpropertyexperts.co.uk", "commercialpropertyexperts.co.uk"],
    accent: "#41AAE1", // blue
    accentSoft: "#ECF7FC",
    crmName: "CRM",
    conversionLabel: "Appointment Booked",
    conversionVerb: "Book Appointment",
    audience: "Commercial property agents",
    logo: "/brand-logos/TCPE - Icon.png",
    referralFee: 1750,
    referralFeeNote: "£350 hands-off · up to £1,750 with viewings & client care",
    referralPitch: "Offices, retail, industrial units — commercial, handled.",
    referralAbout:
      "We handle commercial property — offices, retail and industrial units, sales and lettings. Refer any business or landlord with a commercial requirement; the more you stay involved, the bigger your fee.",
  },
  {
    id: "fineandcountry",
    name: "Fine & Country",
    shortName: "Fine & Country",
    initials: "F&C",
    // TODO(brand): confirm the exact email domain(s) Fine & Country agents use
    domains: ["fineandcountry.com", "fineandcountry.co.uk"],
    accent: "#A78F51", // gold
    accentSoft: "#F7F4EC",
    crmName: "REX",
    conversionLabel: "Market Appraisal (MA)",
    conversionVerb: "Book Market Appraisal",
    audience: "Premium estate agents",
    logo: "/brand-logos/F&C - Icon.png",
    referralFee: 2500,
    referralFeeNote: "0.25% of the fee · 50/50 split with the business",
    referralPitch: "Premium and prestige homes deserve the Fine & Country touch.",
    referralAbout:
      "Fine & Country markets premium and prestige homes with a global reach and a bespoke service. Refer higher-value homeowners here — the fees are some of the biggest in the group.",
  },
  {
    id: "auction",
    name: "The Auction Company",
    shortName: "Auction",
    initials: "TAC",
    // TODO(brand): confirm the exact email domain(s) for The Auction Company
    domains: ["theauctioncompany.co.uk", "auctioncompany.co.uk"],
    accent: "#A3C739", // green
    accentSoft: "#F4F8E9",
    crmName: "REX",
    conversionLabel: "Valuation Booked",
    conversionVerb: "Book Valuation",
    audience: "Auction valuers",
    logo: "/brand-logos/TAC - Icon.png",
    referralFee: 7000,
    referralFeeNote: "£2,800–£7,000 · 50% on a 70/30 split",
    referralPitch: "Need a fast, certain sale? Auction is the route — and it pays.",
    referralAbout:
      "Auction gives sellers a fast, certain sale — ideal for probate, tenanted stock, land or anything needing a quick exit. Refer them here and you're in line for the biggest fees in the group.",
  },
];

export function brandById(id: string | null | undefined): Brand | undefined {
  return BRANDS.find((b) => b.id === id);
}

// Match an email address to a brand by its domain. Returns undefined for
// unknown domains — the signup flow then asks the user to pick manually.
export function brandForEmail(email: string): Brand | undefined {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return undefined;
  return BRANDS.find((b) => b.domains.includes(domain));
}

// Head-office staff aren't tied to a single brand but still get portal access.
export const HEAD_OFFICE_DOMAINS = ["theexpertsgroup.co.uk"];

// Every email domain allowed to register: the seven brands plus head office.
// The portal is internal, so signup is gated to exactly these domains.
export function allowedEmailDomains(): string[] {
  return [...BRANDS.flatMap((b) => b.domains), ...HEAD_OFFICE_DOMAINS];
}

export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  return !!domain && allowedEmailDomains().includes(domain);
}
