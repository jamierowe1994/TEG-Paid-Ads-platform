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

export interface Brand {
  id: BrandId;
  name: string;
  shortName: string;
  domains: string[];
  accent: string; // hex accent colour used to theme the dashboard
  accentSoft: string; // light tint for backgrounds/badges
  crmName: string; // the CRM leads get pushed to
  conversionLabel: string; // what a "successful" converted lead is called
  conversionVerb: string; // button text, e.g. "Book Market Appraisal"
  audience: string; // who the agents are
  logo: string; // /brand-logos/<id>.png — falls back to a letter mark
}

// The parent group brand. Used on the marketing/pre-login pages (landing,
// signup, login) where we don't yet know which business the visitor is with.
export const EXPERTS_GROUP = {
  name: "The Experts Group",
  accent: "#E31F36", // Experts Group red
  accentDark: "#C11A2E",
  accentSoft: "#FEF2F2",
  logo: "/brand-logos/group.png",
};

export const BRANDS: Brand[] = [
  {
    id: "property",
    name: "The Property Experts",
    shortName: "Property",
    domains: ["thepropertyexperts.co.uk", "propertyexperts.co.uk"],
    accent: "#E31F36", // red (shared group/estate colour)
    accentSoft: "#FEF2F2",
    crmName: "REP",
    conversionLabel: "Market Appraisal (MA)",
    conversionVerb: "Book Market Appraisal",
    audience: "Estate agents",
    logo: "/brand-logos/TPE - Icon.png",
  },
  {
    id: "lettings",
    name: "The Lettings Experts",
    shortName: "Lettings",
    domains: ["thelettingsexperts.co.uk", "lettingsexperts.co.uk"],
    accent: "#E31F36", // red
    accentSoft: "#FEF2F2",
    crmName: "REP",
    conversionLabel: "Market Appraisal (MA)",
    conversionVerb: "Book Market Appraisal",
    audience: "Lettings agents",
    logo: "/brand-logos/TLE - Icon.png",
  },
  {
    id: "mortgage",
    name: "The Mortgage Experts",
    shortName: "Mortgage",
    domains: ["themortgageexperts.co.uk", "mortgageexperts.co.uk"],
    accent: "#2B6193", // blue
    accentSoft: "#EEF4FA",
    crmName: "CRM",
    conversionLabel: "Appointment Booked",
    conversionVerb: "Book Appointment",
    audience: "Mortgage advisers",
    logo: "/brand-logos/TMGE - Icon.png",
  },
  {
    id: "recruitment",
    name: "The Recruitment Experts",
    shortName: "Recruitment",
    domains: ["therecruitmentexperts.co.uk", "recruitmentexperts.co.uk"],
    accent: "#998170", // bronze
    accentSoft: "#F6F3F1",
    crmName: "Atlas",
    conversionLabel: "Appointment Booked",
    conversionVerb: "Book Appointment",
    audience: "Recruiters",
    // Full lockup (pin + wordmark) — a pin-only "Icon" version would match
    // the other brands better at small sizes.
    logo: "/brand-logos/TRE - Colour.png",
  },
  {
    id: "commercial",
    name: "The Commercial Property Experts",
    shortName: "Commercial",
    domains: ["thecommercialpropertyexperts.co.uk", "commercialpropertyexperts.co.uk"],
    accent: "#41AAE1", // blue
    accentSoft: "#ECF7FC",
    crmName: "CRM",
    conversionLabel: "Appointment Booked",
    conversionVerb: "Book Appointment",
    audience: "Commercial property agents",
    logo: "/brand-logos/TCPE - Icon.png",
  },
  {
    id: "fineandcountry",
    name: "Fine & Country",
    shortName: "Fine & Country",
    // TODO(brand): confirm the exact email domain(s) Fine & Country agents use
    domains: ["fineandcountry.com", "fineandcountry.co.uk"],
    accent: "#A78F51", // gold
    accentSoft: "#F7F4EC",
    crmName: "REP",
    conversionLabel: "Market Appraisal (MA)",
    conversionVerb: "Book Market Appraisal",
    audience: "Premium estate agents",
    logo: "/brand-logos/F&C - Icon.png",
  },
  {
    id: "auction",
    name: "The Auction Company",
    shortName: "Auction",
    // TODO(brand): confirm the exact email domain(s) for The Auction Company
    domains: ["theauctioncompany.co.uk", "auctioncompany.co.uk"],
    accent: "#A3C739", // green
    accentSoft: "#F4F8E9",
    crmName: "REP",
    conversionLabel: "Valuation Booked",
    conversionVerb: "Book Valuation",
    audience: "Auction valuers",
    logo: "/brand-logos/TAC - Icon.png",
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
