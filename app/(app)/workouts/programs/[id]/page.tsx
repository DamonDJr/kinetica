import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Dumbbell, Layers } from "lucide-react";
import { ProgramDetailClient } from "./program-detail-client";

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const program = await db.workoutProgram.findUnique({
    where: { id },
    include: { sessions: { orderBy: { dayNumber: "asc" } } },
  });
  if (!program || program.profileId !== profile.id) notFound();

  const weeks: { weekNum: number; sessions: { id: string; dayNumber: number; name: string; focus: string; exercises: string; conditionTips: string; notes: string | null; completed: boolean }[] }[] = [];
  for (let w = 1; w <= program.weeks; w++) {
    const start = (w - 1) * program.daysPerWeek + 1;
    const end = w * program.daysPerWeek;
    const weekSessions = program.sessions.filter((s) => s.dayNumber >= start && s.dayNumber <= end);
    if (weekSessions.length) weeks.push({ weekNum: w, sessions: weekSessions });
  }

  const isActiveProgram = profile.activeProgramId === program.id;

  return (
    <div className="space-y-8 pb-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          {program.aiGenerated && <Badge variant="default" className="text-[10px]">AI Program</Badge>}
          <Badge variant="outline" className="text-[10px] capitalize">{program.goal}</Badge>
          <Badge variant="outline" className="text-[10px] capitalize">{program.difficulty}</Badge>
          {isActiveProgram && <Badge className="text-[10px] bg-emerald-500 hover:bg-emerald-500">Active</Badge>}
        </div>
        <h1 className="text-3xl font-black tracking-tight">{program.name}</h1>
        {program.description && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{program.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-primary" />{program.weeks} weeks
          </span>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Dumbbell className="h-4 w-4 text-primary" />{program.daysPerWeek}×/week
          </span>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" />{program.sessions.length} sessions
          </span>
        </div>
      </div>

      <ProgramDetailClient
        weeks={weeks}
        totalWeeks={program.weeks}
        programId={program.id}
        isActiveProgram={isActiveProgram}
        progressionTips={program.progressionTips}
      />
    </div>
  );
}
