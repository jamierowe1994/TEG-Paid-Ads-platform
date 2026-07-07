// Onboarding / production stages for an agent's account. The admin moves an
// agent along these in the CRM, and the agent sees the same progress on their
// dashboard. "paused" sits off the main track.

export const ONBOARDING_STAGES = [
  { id: "signed_up", label: "Signed up" },
  { id: "onboarding", label: "Onboarding call" },
  { id: "creatives", label: "Creatives in production" },
  { id: "review", label: "Campaign review" },
  { id: "live", label: "Ads live" },
] as const;

export type OnboardingStage =
  | (typeof ONBOARDING_STAGES)[number]["id"]
  | "paused";

export function stageLabel(stage: OnboardingStage | undefined): string {
  if (stage === "paused") return "Paused";
  return (
    ONBOARDING_STAGES.find((s) => s.id === stage)?.label ?? "Signed up"
  );
}

export function stageIndex(stage: OnboardingStage | undefined): number {
  const i = ONBOARDING_STAGES.findIndex((s) => s.id === stage);
  return i === -1 ? 0 : i;
}
