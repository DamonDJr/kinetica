import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { buildCoachContext } from "@/lib/coach-context";
import { measurementInsightPrompt } from "@/lib/ai-prompts";

export const maxDuration = 60;

type InsightItem = {
  headline: string;
  body: string;
  action: string;
  priority: "high" | "medium" | "low";
};

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const ctx = await buildCoachContext(profile.id);
  if (!ctx.measurements.latest) {
    return NextResponse.json({ error: "Log at least one measurement first" }, { status: 400 });
  }

  const { system, user } = measurementInsightPrompt(ctx);
  const result = await generateJSON<{ insights: InsightItem[] }>(system, user);

  if (!result?.insights?.length) {
    return NextResponse.json({ error: "AI did not return insights. Is LM Studio running?" }, { status: 500 });
  }

  const created = await db.$transaction(
    result.insights.map((i) =>
      db.aiInsight.create({
        data: {
          profileId: profile.id,
          type: "measurement",
          content: JSON.stringify({
            headline: i.headline,
            body: i.body,
            action: i.action,
            priority: i.priority,
          }),
        },
      }),
    ),
  );

  return NextResponse.json({
    insights: created.map((c) => ({
      id: c.id,
      type: c.type,
      content: c.content,
      createdAt: c.createdAt,
    })),
  });
}
