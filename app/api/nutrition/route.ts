import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// A meal/water entry can be back-dated. We accept a YYYY-MM-DD string and pin
// the timestamp to noon so it lands inside the day window the nutrition page
// computes server-side, regardless of timezone. Future dates and bad input
// fall back to "now".
function resolveLoggedAt(date: unknown): Date | undefined {
  if (typeof date !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return undefined;
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  if (d.getTime() > todayEnd.getTime()) return undefined;
  return d;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  const date = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const [meals, water] = await Promise.all([
    db.mealLog.findMany({
      where: { profileId: profile.id, loggedAt: { gte: start, lte: end } },
      orderBy: { loggedAt: "asc" },
    }),
    db.waterLog.findMany({
      where: { profileId: profile.id, loggedAt: { gte: start, lte: end } },
    }),
  ]);

  return NextResponse.json({ meals, water, waterMl: water.reduce((s, w) => s + w.amountMl, 0) });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const meal = await db.mealLog.findUnique({ where: { id } });
  if (!meal || meal.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.mealLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const { type, ...data } = body;
  const loggedAt = resolveLoggedAt(data.date);

  if (type === "water") {
    const log = await db.waterLog.create({
      data: { profileId: profile.id, amountMl: data.amountMl ?? 250, ...(loggedAt && { loggedAt }) },
    });
    return NextResponse.json({ log });
  }

  const meal = await db.mealLog.create({
    data: {
      profileId: profile.id,
      mealType: data.mealType ?? "other",
      name: data.name,
      calories: data.calories ?? 0,
      proteinG: data.proteinG ?? 0,
      carbsG: data.carbsG ?? 0,
      fatG: data.fatG ?? 0,
      notes: data.notes,
      ...(loggedAt && { loggedAt }),
    },
  });

  // Save foods sourced from AI / photo so users can re-log them later.
  // Store per-serving values (caller passes `perServing`) when available,
  // else store the totals just logged.
  const source: string | undefined = data.source;
  if (source === "ai" || source === "photo" || source === "search") {
    const perServing = data.perServing ?? null;
    const name: string = (data.name ?? "").trim();
    const servingDescription: string = (data.servingDescription ?? "").trim();
    if (name) {
      const payload = {
        calories: Math.round(perServing?.calories ?? data.calories ?? 0),
        proteinG: perServing?.proteinG ?? data.proteinG ?? 0,
        carbsG: perServing?.carbsG ?? data.carbsG ?? 0,
        fatG: perServing?.fatG ?? data.fatG ?? 0,
        brand: data.brand?.trim() || null,
        source,
        lastUsedAt: new Date(),
      };
      try {
        await db.savedFood.upsert({
          where: {
            profileId_name_servingDescription: {
              profileId: profile.id,
              name,
              servingDescription,
            },
          },
          create: { profileId: profile.id, name, servingDescription, ...payload },
          update: { ...payload, useCount: { increment: 1 } },
        });
      } catch {
        // non-fatal — meal already logged
      }
    }
  }

  return NextResponse.json({ meal });
}
