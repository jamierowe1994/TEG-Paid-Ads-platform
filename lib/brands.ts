// The Experts Group — brand registry.
// Signup email domains are matched against `domains` to route each agent
// into the correct business dashboard automatically.

export type BrandId =
  | "property"
  | "lettings"
  | "mortgage"
  | "recruitment"
  | "commercial";

export interface Brand {
  id: BrandId;
  name: string;
  shortName: string;
  domains: string[];
  accent: string; // hex accent colour used to theme the dashboard
  accentSoft: string; // light tint for backgrounds/badges
  crmName: string; // the CRM leads get pushed to
  conversionLabel: string; // what a "converted" lead is called in this business
  audience: string; // who the agents are
}

export const BRANDS: Brand[] = [
  {
    id: "property",
    name: "The Property Experts",
    shortName: "Property",
    domains: ["thepropertyexperts.co.uk", "propertyexperts.co.uk"],
    accent: "#16A34A",
    accentSoft: "#F0FDF4",
    crmName: "REP",
    conversionLabel: "Market Appraisal (MA)",
    audience: "Estate agents",
  },
  {
    id: "lettings",
    name: "The Lettings Experts",
    shortName: "Lettings",
    domains: ["thelettingsexperts.co.uk", "lettingsexperts.co.uk"],
    accent: "#0D9488",
    accentSoft: "#F0FDFA",
    crmName: "REP",
    conversionLabel: "Landlord Appraisal",
    audience: "Lettings agents",
  },
  {
    id: "mortgage",
    name: "The Mortgage Experts",
    shortName: "Mortgage",
    domains: ["themortgageexperts.co.uk", "mortgageexperts.co.uk"],
    accent: "#2563EB",
    accentSoft: "#EFF6FF",
    crmName: "CRM",
    conversionLabel: "Booked Appointment",
    audience: "Mortgage advisers",
  },
  {
    id: "recruitment",
    name: "The Recruitment Experts",
    shortName: "Recruitment",
    domains: ["therecruitmentexperts.co.uk", "recruitmentexperts.co.uk"],
    accent: "#7C3AED",
    accentSoft: "#F5F3FF",
    crmName: "Atlas",
    conversionLabel: "Terms Signed",
    audience: "Recruiters",
  },
  {
    id: "commercial",
    name: "The Commercial Experts",
    shortName: "Commercial",
    domains: ["thecommercialexperts.co.uk", "commercialexperts.co.uk"],
    accent: "#EA580C",
    accentSoft: "#FFF7ED",
    crmName: "CRM",
    conversionLabel: "Instruction Won",
    audience: "Commercial agents",
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
