import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProgressPhotosClient } from "./progress-photos-client";

export default async function ProgressPhotosPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const photos = await db.progressPhoto.findMany({
    where: { profileId: profile.id },
    orderBy: { takenAt: "asc" },
  });

  return (
    <ProgressPhotosClient
      initialPhotos={photos.map((p) => ({
        id: p.id,
        takenAt: p.takenAt.toISOString(),
        notes: p.notes,
      }))}
    />
  );
}
