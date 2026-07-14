import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

  const foods = await db.savedFood.findMany({
    where: {
      profileId: profile.id,
      ...(q ? { name: { contains: q } } : {}),
    },
    orderBy: [{ lastUsedAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ foods });
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

// Saves (or re-saves) a single food — used by the meal-item bookmark button so
// a component of a composed meal (e.g. just the pepperoni out of a bagel
// melt) can be reused later independent of the meal it came from.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const name: string = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const servingAmount = num(body.servingAmount, 1) || 1;
  const servingUnit = String(body.servingUnit ?? "").trim();
  const servingGrams = numOrNull(body.servingGrams);
  const servingDescription =
    String(body.servingDescription ?? "").trim() ||
    [servingAmount !== 1 || servingUnit ? `${servingAmount}${servingUnit ? ` ${servingUnit}` : ""}` : "", servingGrams ? `(${servingGrams}g)` : ""]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "1 serving";

  const payload = {
    calories: Math.round(num(body.calories)),
    proteinG: num(body.proteinG),
    carbsG: num(body.carbsG),
    fatG: num(body.fatG),
    servingAmount,
    servingUnit,
    servingGrams,
    brand: typeof body.brand === "string" ? body.brand.trim() || null : null,
    source: "item",
    lastUsedAt: new Date(),
  };

  const food = await db.savedFood.upsert({
    where: { profileId_name_servingDescription: { profileId: profile.id, name, servingDescription } },
    create: { profileId: profile.id, name, servingDescription, ...payload },
    update: { ...payload, useCount: { increment: 1 } },
  });

  return NextResponse.json({ food });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const food = await db.savedFood.findUnique({ where: { id } });
  if (!food || food.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.savedFood.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
