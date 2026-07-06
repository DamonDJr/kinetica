import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveProgressPhoto, deleteProgressPhoto } from "@/lib/progress-photos";
import { randomUUID } from "crypto";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const photos = await db.progressPhoto.findMany({
    where: { profileId: profile.id },
    orderBy: { takenAt: "asc" },
  });

  return NextResponse.json({ photos });
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
  const takenAtRaw = formData.get("takenAt");
  const takenAt =
    typeof takenAtRaw === "string" && !Number.isNaN(Date.parse(takenAtRaw))
      ? new Date(takenAtRaw)
      : new Date();

  const id = randomUUID();
  let saved;
  try {
    saved = await saveProgressPhoto(profile.id, id, Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Could not process that image" }, { status: 400 });
  }

  const photo = await db.progressPhoto.create({
    data: {
      id,
      profileId: profile.id,
      takenAt,
      fileName: saved.fileName,
      width: saved.width,
      height: saved.height,
      notes,
    },
  });

  return NextResponse.json({ photo });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const photo = await db.progressPhoto.findUnique({ where: { id } });
  if (!photo || photo.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.progressPhoto.delete({ where: { id } });
  await deleteProgressPhoto(profile.id, photo.fileName);
  return NextResponse.json({ ok: true });
}
