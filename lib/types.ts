import type { BrandId } from "./brands";
import type { OnboardingStage } from "./onboarding";

export interface AdminNote {
  at: string;
  text: string;
}

// An ad creative the team produced, shown to the customer to review before
// go-live. url is a data URL (uploaded image) or an external link (video etc.).
export interface CampaignAsset {
  id: string;
  url: string;
  type: "image" | "video";
  caption?: string;
  at: string;
}

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
  // Admin-managed fields:
  location?: string | null; // the agent's town / patch
  onboardingStage?: OnboardingStage;
  adminNotes?: AdminNote[]; // internal — stripped before reaching the agent
  // Two-way campaign approval (Phase 2). The customer approves at the review
  // stage (last sign-off) and can leave feedback the team sees.
  campaignApproved?: boolean;
  campaignFeedback?: AdminNote[];
  campaignAssets?: CampaignAsset[]; // creatives the team produced for review
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
  // Populated later by the Meta lead webhook; optional until then. The UI
  // falls back to `note` when interestedIn is absent.
  adName?: string | null; // the ad/campaign the lead came from
  interestedIn?: string | null; // what the lead enquired about
  // Agent-added notes (from the Call → Add notes panel).
  notes?: { at: string; text: string }[];
  // When an appointment/call is booked (ISO). null once cancelled.
  appointmentAt?: string | null;
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
