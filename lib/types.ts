import type { BrandId } from "./brands";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  mobile: string;
  photo: string | null; // data URL for now; move to object storage later
  brandId: BrandId;
  platforms: ("instagram" | "facebook")[];
  goal: string;
  packageId: "starter" | "growth" | "scale";
  paid: boolean; // set true by the Stripe webhook once payments are live
  createdAt: string;
}

// Lead funnel stages. "converted" is displayed using the brand's own
// conversion label (e.g. Market Appraisal for The Property Experts).
export type LeadStage =
  | "new"
  | "attempt1"
  | "attempt2"
  | "converted"
  | "pushed" // sent to the brand's CRM (REP etc.)
  | "lost";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: "instagram" | "facebook" | "referral";
  note: string;
  stage: LeadStage;
  receivedAt: string;
  history: { stage: LeadStage; at: string }[];
}

export interface Referral {
  id: string;
  direction: "sent" | "received";
  toBrandId: BrandId;
  fromBrandId: BrandId;
  leadName: string;
  leadContact: string;
  note: string;
  status: "pending" | "accepted" | "converted";
  createdAt: string;
}
