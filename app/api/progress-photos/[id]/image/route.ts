import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { readProgressPhoto } from "@/lib/progress-photos";

// Progress photos are private, so they're streamed through this auth check
// rather than served from public/.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { id } = await params;
  const photo = await db.progressPhoto.findUnique({ where: { id } });
  if (!photo || photo.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await readProgressPhoto(profile.id, photo.fileName);
  if (!data) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      // Immutable per id (uploads are never edited in place), but private —
      // browser cache only, never a shared proxy.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
