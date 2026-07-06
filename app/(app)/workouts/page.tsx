import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { Dumbbell, Plus, Sparkles, CalendarDays, Upload, PenLine } from "lucide-react";
import { ProgramsList, PlansList } from "@/components/workouts/workouts-list";

export default async function WorkoutsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const [plans, programs, recentLogs] = await Promise.all([
    db.workoutPlan.findMany({
      where: { profileId: profile.id, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.workoutProgram.findMany({
      where: { profileId: profile.id, isActive: true },
      orderBy: { createdAt: "desc" },
      include: { sessions: true },
    }),
    db.workoutLog.findMany({
      where: { profileId: profile.id },
      orderBy: { completedAt: "desc" },
      take: 4,
    }),
  ]);

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Your Training</p>
          <h1 className="text-3xl font-black tracking-tight">Workouts</h1>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <Button asChild size="sm">
            <Link href="/workouts/generate"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Quick AI</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/workouts/programs/create"><CalendarDays className="h-3.5 w-3.5 mr-1.5" />Full Program</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/workouts/import"><Upload className="h-3.5 w-3.5 mr-1.5" />Import</Link>
          </Button>
        </div>
      </div>

      {/* Log a self-directed workout */}
      <Link href="/workouts/log">
        <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 to-accent/5 p-4 flex items-center gap-4 hover:border-primary/40 transition-colors group">
          <div className="h-12 w-12 rounded-2xl bg-primary/12 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <PenLine className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm">Did your own workout?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Describe it — AI tidies it up and you earn +50 XP</p>
          </div>
        </div>
      </Link>

      {/* Programs */}
      <section>
        <SectionHeader label="Programs" />
        {programs.length === 0 ? (
          <Link href="/workouts/programs/create">
            <div className="rounded-2xl border-2 border-dashed border-border p-6 flex items-center gap-4 hover:border-primary/30 transition-colors group">
              <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <CalendarDays className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">Create a multi-week program</p>
                <p className="text-xs text-muted-foreground mt-0.5">AI designs a full training block — 2 to 12 weeks</p>
              </div>
            </div>
          </Link>
        ) : (
          <ProgramsList programs={programs} />
        )}
      </section>

      {/* Single Workouts */}
      <section>
        <SectionHeader
          label="Single Workouts"
          action={
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <Link href="/workouts/generate"><Plus className="h-3.5 w-3.5" />New</Link>
            </Button>
          }
        />
        {plans.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center space-y-2">
            <Dumbbell className="h-8 w-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No workouts yet — generate one with AI</p>
          </div>
        ) : (
          <PlansList plans={plans} />
        )}
      </section>

      {/* Recent sessions */}
      {recentLogs.length > 0 && (
        <section>
          <SectionHeader label="Recent Sessions" />
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted/50 border border-border/60">
                <div>
                  <p className="text-sm font-semibold">{log.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(log.completedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {log.durationMin ? ` · ${log.durationMin}m` : ""}
                  </p>
                </div>
                {log.caloriesBurned && (
                  <span className="text-xs font-bold text-primary">{log.caloriesBurned} kcal</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
