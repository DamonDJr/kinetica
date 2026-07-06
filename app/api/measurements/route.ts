import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { kgToLb } from "@/lib/utils";

const NUMERIC_FIELDS = [
  "weightKg",
  "bodyFatPct",
  "waistCm",
  "chestCm",
  "hipsCm",
  "armCm",
  "thighCm",
  "neckCm",
] as const;

function pickNumeric(body: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const k of NUMERIC_FIELDS) {
    const v = body[k];
    if (v === null || v === undefined || v === "") {
      out[k] = null;
    } else {
      const n = Number(v);
      out[k] = Number.isFinite(n) && n >= 0 && n < 1000 ? n : null;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "180", 10) || 180, 1), 730);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const measurements = await db.bodyMeasurement.findMany({
    where: { profileId: profile.id, takenAt: { gte: since } },
    orderBy: { takenAt: "desc" },
  });

  return NextResponse.json({ measurements });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = (await req.json()) as Record<string, unknown>;
  const fields = pickNumeric(body);

  if (Object.values(fields).every((v) => v === null)) {
    return NextResponse.json({ error: "at least one measurement required" }, { status: 400 });
  }

  const takenAt = body.takenAt ? new Date(body.takenAt as string) : new Date();
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;

  const measurement = await db.bodyMeasurement.create({
    data: { profileId: profile.id, takenAt, notes, ...fields },
  });

  // Profile.weightKg actually stores lbs (imperial throughout the app), but
  // BodyMeasurement.weightKg is true metric kg — convert when syncing.
  if (fields.weightKg !== null) {
    await db.profile.update({
      where: { id: profile.id },
      data: { weightKg: kgToLb(fields.weightKg) },
    });
  }

  return NextResponse.json({ measurement });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const m = await db.bodyMeasurement.findUnique({ where: { id } });
  if (!m || m.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.bodyMeasurement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
