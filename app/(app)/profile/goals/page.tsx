import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseGoals } from "@/lib/utils";
import { GoalsEditor } from "./goals-editor";

export default async function GoalsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const goals = parseGoals(profile.fitnessGoals);

  return <GoalsEditor initialGoals={goals} />;
}
