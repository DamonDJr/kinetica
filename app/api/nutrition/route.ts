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
      include: { items: { orderBy: { sortOrder: "asc" } } },
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

// Coerces an unknown value to a finite, non-negative number, or `fallback`.
function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// An item's own macros are client-editable, so they're trusted no more than
// the meal-level totals were before — recomputed server-side as the sum of
// items rather than taken from a client-sent meal total.
type ItemInput = {
  name?: unknown;
  calories?: unknown;
  proteinG?: unknown;
  carbsG?: unknown;
  fatG?: unknown;
  servingAmount?: unknown;
  servingUnit?: unknown;
  servingGrams?: unknown;
  baseCalories?: unknown;
  baseProteinG?: unknown;
  baseCarbsG?: unknown;
  baseFatG?: unknown;
  baseServingAmount?: unknown;
  baseServingGrams?: unknown;
  savedFoodId?: unknown;
};

function sanitizeItem(item: ItemInput, index: number) {
  const name = String(item?.name ?? "").trim() || `Item ${index + 1}`;
  const calories = Math.round(num(item?.calories));
  const proteinG = num(item?.proteinG);
  const carbsG = num(item?.carbsG);
  const fatG = num(item?.fatG);
  return {
    name,
    calories,
    proteinG,
    carbsG,
    fatG,
    servingAmount: num(item?.servingAmount, 1) || 1,
    servingUnit: String(item?.servingUnit ?? "").trim(),
    servingGrams: numOrNull(item?.servingGrams),
    baseCalories: Math.round(num(item?.baseCalories, calories)),
    baseProteinG: num(item?.baseProteinG, proteinG),
    baseCarbsG: num(item?.baseCarbsG, carbsG),
    baseFatG: num(item?.baseFatG, fatG),
    baseServingAmount: num(item?.baseServingAmount, 1) || 1,
    baseServingGrams: numOrNull(item?.baseServingGrams),
    sortOrder: index,
    ...(typeof item?.savedFoodId === "string" && item.savedFoodId ? { savedFoodId: item.savedFoodId } : {}),
  };
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

  // When items are provided, the meal's totals are the exact sum of the
  // items' (client-editable) macros rather than whatever totals the client
  // also sent — same trust posture as the AI pipeline's own reconcileTotals.
  const rawItems: ItemInput[] = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.map(sanitizeItem);
  const totals = items.length
    ? items.reduce(
        (acc, it) => ({
          calories: acc.calories + it.calories,
          proteinG: acc.proteinG + it.proteinG,
          carbsG: acc.carbsG + it.carbsG,
          fatG: acc.fatG + it.fatG,
        }),
        { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      )
    : { calories: num(data.calories), proteinG: num(data.proteinG), carbsG: num(data.carbsG), fatG: num(data.fatG) };

  const meal = await db.mealLog.create({
    data: {
      profileId: profile.id,
      mealType: data.mealType ?? "other",
      name: data.name,
      calories: Math.round(totals.calories),
      proteinG: Math.round(totals.proteinG * 10) / 10,
      carbsG: Math.round(totals.carbsG * 10) / 10,
      fatG: Math.round(totals.fatG * 10) / 10,
      notes: data.notes,
      ...(loggedAt && { loggedAt }),
      ...(items.length && { items: { create: items } }),
    },
    include: { items: true },
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
