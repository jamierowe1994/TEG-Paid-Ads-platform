// Paid ads packages. Pricing is placeholder until the Stripe account is
// live — each package carries a `stripePriceId` slot ready for the real
// Stripe Price IDs.

export interface AdPackage {
  id: "starter" | "growth" | "scale";
  name: string;
  price: number; // GBP per month (placeholder)
  tagline: string;
  features: string[];
  highlighted?: boolean;
  stripePriceId: string | null; // TODO: plug in real Stripe Price ID
}

export const PACKAGES: AdPackage[] = [
  {
    id: "starter",
    name: "Starter",
    price: 199,
    tagline: "Get your name out there",
    features: [
      "1 platform (Instagram or Facebook)",
      "2 ad creatives per month",
      "Local area targeting",
      "Lead tracking dashboard",
      "Monthly performance summary",
    ],
    stripePriceId: null,
  },
  {
    id: "growth",
    name: "Growth",
    price: 349,
    tagline: "Our most popular package",
    highlighted: true,
    features: [
      "Instagram and Facebook",
      "4 ad creatives per month",
      "Advanced audience targeting",
      "Lead tracking dashboard",
      "Referrals network access",
      "Fortnightly performance review",
    ],
    stripePriceId: null,
  },
  {
    id: "scale",
    name: "Scale",
    price: 549,
    tagline: "Maximum visibility, maximum leads",
    features: [
      "Instagram and Facebook",
      "8 ad creatives per month",
      "Video ad production",
      "Priority creative turnaround",
      "Referrals network access",
      "Weekly performance review",
      "Dedicated account manager",
    ],
    stripePriceId: null,
  },
];

export function packageById(id: string | null | undefined): AdPackage | undefined {
  return PACKAGES.find((p) => p.id === id);
}
