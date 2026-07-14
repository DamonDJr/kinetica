import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateVisionCompletion } from "@/lib/ai";
import { SYSTEM_COACH, buildProfileContext } from "@/lib/ai-prompts";
import { readProgressPhoto, stitchBeforeAfter } from "@/lib/progress-photos";

export const maxDuration = 120;

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
  if (!profile.goalPhotoFileName) {
    return NextResponse.json({ error: "Upload a goal reference photo first" }, { status: 400 });
  }

  const latest = await db.progressPhoto.findFirst({
    where: { profileId: profile.id },
    orderBy: { takenAt: "desc" },
  });
  if (!latest) {
    return NextResponse.json({ error: "Upload at least one progress photo to compare" }, { status: 400 });
  }

  const [currentData, goalData] = await Promise.all([
    readProgressPhoto(profile.id, latest.fileName),
    readProgressPhoto(profile.id, profile.goalPhotoFileName),
  ]);
  if (!currentData || !goalData) {
    return NextResponse.json({ error: "Photo files are missing from storage" }, { status: 500 });
  }

  const stitched = await stitchBeforeAfter(
    { data: currentData, label: "CURRENT" },
    { data: goalData, label: "GOAL" }
  );

  const feedback = await generateVisionCompletion(
    SYSTEM_COACH,
    `${buildProfileContext(profile)}

This image is a side-by-side comparison: LEFT is the user's most recent progress photo ("CURRENT"), RIGHT is the reference photo they chose to represent their body goal ("GOAL").

Give the user honest, encouraging, and actionable coaching:
- Note 1-2 genuine similarities already present between current and goal.
- Identify 2-3 specific, trainable differences (e.g. muscle definition in a region, overall leanness, posture) framed as concrete training focus areas, not criticism.
- Suggest what kind of training emphasis would help close the gap, tying back to their stated fitness goals.
- Never comment on anything other than physique/training-relevant traits, and never be negative or shaming about their current body.

Keep it to 4-6 sentences, written directly to the user. Plain text only, no headings or bullet lists.`,
    [{ base64: stitched.toString("base64"), mimeType: "image/jpeg" }],
    { temperature: 0.7 }
  );

  if (!feedback) {
    return NextResponse.json({ error: "AI did not respond. Is the model server running?" }, { status: 500 });
  }

  await db.aiInsight.create({
    data: {
      profileId: profile.id,
      type: "goal-photo",
      content: JSON.stringify({
        headline: "How you compare to your goal photo",
        body: feedback,
        action: "",
        priority: "low",
      }),
    },
  });

  return NextResponse.json({ feedback });
}
