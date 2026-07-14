import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonField } from "@/lib/utils";
import { ProfileEditForm } from "./profile-edit-form";

export default async function ProfileEditPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  return (
    <ProfileEditForm
      initial={{
        displayName: profile.displayName,
        age: profile.age,
        gender: profile.gender,
        // heightCm stores total inches; weightKg/goalWeightKg store lbs
        heightIn: profile.heightCm,
        weightLbs: profile.weightKg,
        goalWeightLbs: profile.goalWeightKg,
        bmrOverride: profile.bmrOverride,
        activityLevel: profile.activityLevel,
        conditions: parseJsonField<string[]>(profile.conditions, []),
        injuries: parseJsonField<string[]>(profile.injuries, []),
        equipment: parseJsonField<string[]>(profile.equipment, []),
        restrictions: parseJsonField<string[]>(profile.restrictions, []),
        targetsCustom: profile.targetsCustom,
      }}
    />
  );
}
