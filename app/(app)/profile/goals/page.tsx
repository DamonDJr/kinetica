import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseGoals } from "@/lib/utils";
import { GoalsEditor } from "./goals-editor";
import { GoalPhotoCard } from "./goal-photo-card";

export default async function GoalsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const goals = parseGoals(profile.fitnessGoals);
  const progressPhotoCount = await db.progressPhoto.count({ where: { profileId: profile.id } });

  return (
    <GoalsEditor
      initialGoals={goals}
      photoCard={
        <GoalPhotoCard
          initialGoalPhoto={
            profile.goalPhotoFileName
              ? {
                  width: profile.goalPhotoWidth ?? 0,
                  height: profile.goalPhotoHeight ?? 0,
                  notes: profile.goalPhotoNotes,
                  description: profile.goalPhotoDescription,
                }
              : null
          }
          hasProgressPhotos={progressPhotoCount > 0}
        />
      }
    />
  );
}
