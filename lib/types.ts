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
  // The Meta campaign this agent's ads run under — set by the admin, used to
  // pull per-agent stats/leads once Meta is connected.
  metaCampaignId?: string | null;
}

// Lead funnel stages. Progressive: each stage reveals the next relevant
// action in the UI. After three contact attempts with no answer, a lead can
// be dropped into a marketing/nurture funnel rather than lost outright.
// "converted" is displayed using the brand's own conversion label
// (e.g. Market Appraisal for The Property Experts).
export type LeadStage =
  | "new"
  | "attempt1"
  | "attempt2"
  | "attempt3"
  | "nurture" // added to a marketing funnel after no answer
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
  referralId?: string | null; // set when the lead came from a referral
}

// Referral lifecycle:
//  pending   — sent, waiting for the receiving business to accept
//  accepted  — accepted; a lead now exists in the recipient's funnel and its
//              stage mirrors back here so the referrer can watch progress
//  converted — the deal converted; the referral fee is now owed
//  paid      — the referral fee has been paid out
//  declined  — the receiving business declined it
export type ReferralStatus =
  | "pending"
  | "accepted"
  | "converted"
  | "paid"
  | "declined";

export interface Referral {
  id: string;
  direction?: "sent" | "received"; // computed per viewer, not stored
  fromUserId: string;
  fromName: string;
  fromBrandId: BrandId;
  toBrandId: BrandId;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  note: string;
  feeAmount: number; // what the referrer earns if the deal goes through
  status: ReferralStatus;
  stage: LeadStage; // working progress once accepted (mirrors the lead)
  dueDate: string | null; // when it's expected to come due
  leadId: string | null; // the linked lead in the recipient's funnel
  createdAt: string;
  activity: { at: string; text: string }[];
}
