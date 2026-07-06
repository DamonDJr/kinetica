import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcSleepDebt } from "@/lib/sleep";
import { SleepClient } from "./sleep-client";

export default async function SleepPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const now = new Date();
  const since = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const logs = await db.sleepLog.findMany({
    where: { profileId: profile.id, forDate: { gte: since } },
    orderBy: { forDate: "desc" },
  });

  const debt7 = calcSleepDebt(logs, profile.sleepGoalHours, 7);
  const debt14 = calcSleepDebt(logs, profile.sleepGoalHours, 14);

  return (
    <SleepClient
      goals={{ wakeTimeGoal: profile.wakeTimeGoal, sleepGoalHours: profile.sleepGoalHours }}
      debt7={debt7}
      debt14={debt14}
      logs={logs.map((l) => ({
        id: l.id,
        forDate: l.forDate.toISOString(),
        hours: l.hours,
        quality: l.quality,
        sleepStart: l.sleepStart?.toISOString() ?? null,
        wakeAt: l.wakeAt?.toISOString() ?? null,
        notes: l.notes,
      }))}
    />
  );
}
