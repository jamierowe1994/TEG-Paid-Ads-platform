// Paid ads packages. Each package price splits into a management fee (what
// The Experts Group charges to build, launch and manage the ads) and an ad
// spend allowance (the money that actually goes to Meta on the agent's
// behalf). This split is shown to the agent so the cost is transparent, and
// drives the cost-per-lead figure in the dashboard.
//
// Pricing is placeholder until the Stripe account is live — each package
// carries a `stripePriceId` slot ready for the real Stripe Price IDs.

export interface AdPackage {
  id: "starter" | "growth" | "scale";
  name: string;
  price: number; // total GBP per month (placeholder)
  managementFee: number; // our fee for building + running the ads
  adSpend: number; // monthly ad spend allowance paid to Meta
  tagline: string;
  features: string[];
  highlighted?: boolean;
  stripePriceId: string | null; // TODO(stripe): plug in real Stripe Price ID
}

export const PACKAGES: AdPackage[] = [
  {
    id: "starter",
    name: "Starter",
    price: 200,
    managementFee: 100,
    adSpend: 100,
    tagline: "Get your name out there",
    features: [
      "£100/mo ad spend included",
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
    price: 400,
    managementFee: 200,
    adSpend: 200,
    tagline: "Our most popular package",
    highlighted: true,
    features: [
      "£200/mo ad spend included",
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
    price: 600,
    managementFee: 300,
    adSpend: 300,
    tagline: "Maximum visibility, maximum leads",
    features: [
      "£300/mo ad spend included",
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
