import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { searchNutrition } from "@/lib/nutrition-pipeline";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = req.nextUrl.searchParams.get("q");
  if (!query?.trim()) return NextResponse.json({ results: [] });

  const results = await searchNutrition(query);
  if (!results.length) {
    return NextResponse.json({ results: [], error: "No nutrition data found — try the Describe tab." });
  }
  return NextResponse.json({ results });
}
