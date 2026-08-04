// TEMPORARY local-only seed: one pre-provisioned account exactly as the Invite
// tab would create it, so the first-sign-in journey can be walked.
import { hashPassword } from "./lib/auth";
import fs from "node:fs";

const EMAIL = "launchtest.partner@thelettingexperts.co.uk";
const users = JSON.parse(fs.readFileSync("data/users.json", "utf8"));
const list: Record<string, unknown>[] = Array.isArray(users) ? users : users.users;
const existing = list.findIndex((u) => u.email === EMAIL);
if (existing >= 0) list.splice(existing, 1);
list.push({
  id: "launchtest" + Date.now().toString(36),
  name: "Launch Test",
  email: EMAIL,
  mobile: "",
  photo: null,
  brandId: "lettings",
  platforms: [],
  goal: "",
  packageId: "starter",
  paid: false,
  accountType: "paid",
  mustResetPassword: true,
  createdAt: new Date().toISOString(),
  passwordHash: hashPassword("TEG2026"),
  metaCampaignId: "120000000000000001",
  location: null,
  onboardingStage: "signed_up",
  adminNotes: [],
});
fs.writeFileSync("data/users.json", JSON.stringify(users, null, 2));
console.log("seeded", EMAIL, "with the shared launch password");
