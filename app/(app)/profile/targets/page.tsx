import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveCalorieRange } from "@/lib/nutrition-stats";
import { TargetsEditor } from "./targets-editor";

export default async function TargetsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const range = resolveCalorieRange(
    profile.calorieTarget,
    profile.calorieTargetMin,
    profile.calorieTargetMax,
  );

  return (
    <TargetsEditor
      initial={{
        calorieTargetMin: range.min,
        calorieTargetMax: range.max,
        proteinTargetG: profile.proteinTargetG ?? 150,
        carbTargetG: profile.carbTargetG ?? null,
        fatTargetG: profile.fatTargetG ?? null,
        custom: profile.targetsCustom,
      }}
    />
  );
}
