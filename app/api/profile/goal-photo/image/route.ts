import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { readProgressPhoto } from "@/lib/progress-photos";

// Private, so it's streamed through this auth check rather than served from public/.
export async function GET(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile?.goalPhotoFileName) return NextResponse.json({ error: "No goal photo" }, { status: 404 });

  const data = await readProgressPhoto(profile.id, profile.goalPhotoFileName);
  if (!data) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      // Private per-user content, and the fixed goal-photo id gets overwritten
      // in place on re-upload — so no long-lived caching, unlike progress photos.
      "Cache-Control": "private, no-cache",
    },
  });
}
