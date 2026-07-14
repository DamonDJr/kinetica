import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateVisionCompletion } from "@/lib/ai";
import { SYSTEM_COACH } from "@/lib/ai-prompts";
import { saveProgressPhoto, readProgressPhoto, deleteProgressPhoto } from "@/lib/progress-photos";

export const maxDuration = 60;

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// One reference photo per profile, so it's stored under a fixed file id
// rather than a per-upload cuid like progress photos.
const GOAL_PHOTO_ID = "goal";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  return NextResponse.json({
    goalPhoto: profile.goalPhotoFileName
      ? {
          width: profile.goalPhotoWidth,
          height: profile.goalPhotoHeight,
          notes: profile.goalPhotoNotes,
          description: profile.goalPhotoDescription,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "image required" }, { status: 400 });
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image too large (15MB max)" }, { status: 400 });
  }

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim().slice(0, 500) : null;

  let saved;
  try {
    saved = await saveProgressPhoto(profile.id, GOAL_PHOTO_ID, Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Could not process that image" }, { status: 400 });
  }

  // Describe the physique once at upload time so every later text-only AI
  // prompt (workout/meal generation) can reference the goal without needing
  // a vision call per request. If the model is unreachable the photo still
  // saves — the description just stays null until the next re-upload.
  const storedData = await readProgressPhoto(profile.id, saved.fileName);
  let description = "";
  if (storedData) {
    try {
      description = await generateVisionCompletion(
        SYSTEM_COACH,
        `This is a reference photo the user picked to represent their body goal${notes ? `. Their own note about it: "${notes}"` : ""}.
Describe the physique shown in neutral, factual, encouraging terms a coach would use when planning training: apparent build (e.g. lean, athletic, muscular), areas of visible muscle development, and overall proportions.
2-3 sentences, plain text, no headings. Never comment on identity, attractiveness, or anything outside physique/training-relevant traits.`,
        [{ base64: storedData.toString("base64"), mimeType: "image/jpeg" }],
        { temperature: 0.4 }
      );
    } catch {
      // AI server unreachable — the photo itself still saves below.
      description = "";
    }
  }

  const profileUpdated = await db.profile.update({
    where: { id: profile.id },
    data: {
      goalPhotoFileName: saved.fileName,
      goalPhotoWidth: saved.width,
      goalPhotoHeight: saved.height,
      goalPhotoNotes: notes,
      goalPhotoDescription: description || null,
    },
  });

  return NextResponse.json({
    goalPhoto: {
      width: profileUpdated.goalPhotoWidth,
      height: profileUpdated.goalPhotoHeight,
      notes: profileUpdated.goalPhotoNotes,
      description: profileUpdated.goalPhotoDescription,
    },
  });
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
  if (!profile.goalPhotoFileName) return NextResponse.json({ ok: true });

  await deleteProgressPhoto(profile.id, profile.goalPhotoFileName);
  await db.profile.update({
    where: { id: profile.id },
    data: {
      goalPhotoFileName: null,
      goalPhotoWidth: null,
      goalPhotoHeight: null,
      goalPhotoNotes: null,
      goalPhotoDescription: null,
    },
  });

  return NextResponse.json({ ok: true });
}
