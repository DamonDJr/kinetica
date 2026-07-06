import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MeasurementsClient } from "./measurements-client";

export default async function MeasurementsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const measurements = await db.bodyMeasurement.findMany({
    where: { profileId: profile.id, takenAt: { gte: since } },
    orderBy: { takenAt: "desc" },
  });

  return (
    <MeasurementsClient
      goalWeightKg={profile.goalWeightKg}
      currentWeightKg={profile.weightKg}
      initialMeasurements={measurements.map((m) => ({
        id: m.id,
        takenAt: m.takenAt.toISOString(),
        weightKg: m.weightKg,
        bodyFatPct: m.bodyFatPct,
        waistCm: m.waistCm,
        chestCm: m.chestCm,
        hipsCm: m.hipsCm,
        armCm: m.armCm,
        thighCm: m.thighCm,
        neckCm: m.neckCm,
        notes: m.notes,
      }))}
    />
  );
}
