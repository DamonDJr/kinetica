import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateVisionCompletion } from "@/lib/ai";
import { SYSTEM_COACH, buildProfileContext } from "@/lib/ai-prompts";
import { readProgressPhoto, stitchBeforeAfter } from "@/lib/progress-photos";

export const maxDuration = 120;

const dateLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const photos = await db.progressPhoto.findMany({
    where: { profileId: profile.id },
    orderBy: { takenAt: "asc" },
  });
  if (photos.length < 2) {
    return NextResponse.json({ error: "Upload at least two photos to compare" }, { status: 400 });
  }

  const oldest = photos[0];
  const newest = photos[photos.length - 1];

  const [oldData, newData] = await Promise.all([
    readProgressPhoto(profile.id, oldest.fileName),
    readProgressPhoto(profile.id, newest.fileName),
  ]);
  if (!oldData || !newData) {
    return NextResponse.json({ error: "Photo files are missing from storage" }, { status: 500 });
  }

  const stitched = await stitchBeforeAfter(
    { data: oldData, label: dateLabel(oldest.takenAt) },
    { data: newData, label: dateLabel(newest.takenAt) }
  );

  const days = Math.max(1, Math.round((newest.takenAt.getTime() - oldest.takenAt.getTime()) / 86400000));

  const feedback = await generateVisionCompletion(
    SYSTEM_COACH,
    `${buildProfileContext(profile)}

This image is a side-by-side comparison of the user's progress photos: LEFT is the "before" photo (${dateLabel(oldest.takenAt)}) and RIGHT is the "after" photo (${dateLabel(newest.takenAt)}) — ${days} days apart.

Give the user positive, encouraging feedback on their progress:
- Point out 2-3 specific visible improvements or signs of consistency you can see (posture, muscle definition, shape, confidence — whatever genuinely applies).
- Tie what you see to their stated goals where relevant.
- If changes are subtle, celebrate the consistency of showing up and taking photos — never invent changes that aren't there, and never be negative about their body.
- Close with one short motivating line about what's ahead.

Keep it to 3-5 sentences, written directly to the user. Plain text only, no headings or bullet lists.`,
    [{ base64: stitched.toString("base64"), mimeType: "image/jpeg" }],
    { temperature: 0.7 }
  );

  if (!feedback) {
    return NextResponse.json({ error: "AI did not respond. Is the model server running?" }, { status: 500 });
  }

  await db.aiInsight.create({
    data: {
      profileId: profile.id,
      type: "progress-photo",
      content: JSON.stringify({
        headline: `Progress check: ${days} days between photos`,
        body: feedback,
        action: "",
        priority: "low",
      }),
    },
  });

  return NextResponse.json({
    feedback,
    days,
    fromId: oldest.id,
    toId: newest.id,
  });
}
