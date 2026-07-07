// Demo data so the dashboard feels alive before the real lead channel is
// connected. Safe to delete once live data flows in.

import type { Lead, Referral } from "./types";

export const seedLeads: Lead[] = [
  {
    id: "ld-001",
    name: "Sarah Mitchell",
    phone: "07700 900123",
    email: "sarah.mitchell@example.com",
    source: "facebook",
    note: "Interested in a valuation on a 3-bed semi.",
    stage: "new",
    receivedAt: "2026-07-06T09:14:00Z",
    history: [{ stage: "new", at: "2026-07-06T09:14:00Z" }],
  },
  {
    id: "ld-002",
    name: "Tom Barker",
    phone: "07700 900456",
    email: "tom.barker@example.com",
    source: "instagram",
    note: "Clicked the summer campaign ad. Asked about fees.",
    stage: "attempt1",
    receivedAt: "2026-07-05T15:40:00Z",
    history: [
      { stage: "new", at: "2026-07-05T15:40:00Z" },
      { stage: "attempt1", at: "2026-07-06T10:02:00Z" },
    ],
  },
  {
    id: "ld-003",
    name: "Priya Shah",
    phone: "07700 900789",
    email: "priya.shah@example.com",
    source: "facebook",
    note: "Looking to move before September. Warm.",
    stage: "converted",
    receivedAt: "2026-07-03T11:20:00Z",
    history: [
      { stage: "new", at: "2026-07-03T11:20:00Z" },
      { stage: "attempt1", at: "2026-07-03T14:00:00Z" },
      { stage: "converted", at: "2026-07-04T09:30:00Z" },
    ],
  },
  {
    id: "ld-004",
    name: "James O'Neill",
    phone: "07700 900321",
    email: "j.oneill@example.com",
    source: "instagram",
    note: "No answer on three attempts — moved to marketing funnel.",
    stage: "nurture",
    receivedAt: "2026-07-02T08:05:00Z",
    history: [
      { stage: "new", at: "2026-07-02T08:05:00Z" },
      { stage: "attempt1", at: "2026-07-02T12:15:00Z" },
      { stage: "attempt2", at: "2026-07-03T17:45:00Z" },
      { stage: "attempt3", at: "2026-07-04T18:30:00Z" },
      { stage: "nurture", at: "2026-07-05T09:00:00Z" },
    ],
  },
];

export const seedReferrals: Referral[] = [
  {
    id: "rf-001",
    direction: "received",
    fromBrandId: "mortgage",
    toBrandId: "property",
    leadName: "Emma Clarke",
    leadContact: "07700 900654",
    note: "Mortgage in principle agreed — now needs to sell her flat.",
    status: "pending",
    createdAt: "2026-07-05T13:00:00Z",
  },
  {
    id: "rf-002",
    direction: "sent",
    fromBrandId: "property",
    toBrandId: "mortgage",
    leadName: "Daniel Hughes",
    leadContact: "daniel.h@example.com",
    note: "Buyer on Oakfield Road — needs a mortgage adviser.",
    status: "accepted",
    createdAt: "2026-07-04T10:30:00Z",
  },
];
