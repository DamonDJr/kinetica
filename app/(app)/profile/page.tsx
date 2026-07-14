import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonField, parseGoals, xpForNextLevel, formatHeight } from "@/lib/utils";
import { resolveCalorieRange } from "@/lib/nutrition-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dumbbell, Flame, Zap, Edit2, Activity, Bell, Camera, ChevronRight, Moon } from "lucide-react";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const conditions = parseJsonField<string[]>(profile.conditions, []);
  const equipment = parseJsonField<string[]>(profile.equipment, []);
  const goals = parseGoals(profile.fitnessGoals);
  const calorieRange = resolveCalorieRange(profile.calorieTarget, profile.calorieTargetMin, profile.calorieTargetMax);

  const xpNext = xpForNextLevel(profile.level);
  const xpCurrent = profile.xpPoints % xpNext;
  const xpPct = Math.round((xpCurrent / xpNext) * 100);

  const [totalWorkouts, totalMeals] = await Promise.all([
    db.workoutLog.count({ where: { profileId: profile.id } }),
    db.mealLog.count({ where: { profileId: profile.id } }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profile</h1>
        <Button asChild size="sm" variant="ghost">
          <Link href="/profile/edit"><Edit2 className="h-4 w-4 mr-1" /> Edit</Link>
        </Button>
      </div>

      {/* Header card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-4">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, ${profile.avatarColor}, #2dd4bf)` }}
            >
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{profile.displayName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="default">Level {profile.level}</Badge>
                {profile.streakDays > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <Flame className="h-3 w-3 text-amber-600 fill-amber-400" />
                    <span className="text-xs font-semibold text-amber-600">{profile.streakDays} day streak</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">XP Progress</span>
              <span className="font-medium">{xpCurrent} / {xpNext}</span>
            </div>
            <Progress value={xpPct} color="primary" />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Dumbbell className="h-4 w-4 text-primary" />} value={totalWorkouts} label="Workouts" />
        <StatTile icon={<Flame className="h-4 w-4 text-accent" />} value={totalMeals} label="Meals logged" />
        <StatTile icon={<Zap className="h-4 w-4 text-amber-600" />} value={profile.xpPoints} label="Total XP" />
      </div>

      {/* Body stats */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Body Stats</CardTitle>
          <Button asChild size="sm" variant="ghost" className="h-7">
            <Link href="/profile/measurements">Measurements <ChevronRight className="h-3.5 w-3.5 ml-0.5" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <Row label="Age" value={profile.age ? `${profile.age} years` : "—"} />
          <Row label="Height" value={formatHeight(profile.heightCm)} />
          <Row label="Weight" value={profile.weightKg ? `${profile.weightKg} lbs` : "—"} />
          <Row label="Goal weight" value={profile.goalWeightKg ? `${profile.goalWeightKg} lbs` : "—"} />
          <Row label="Activity level" value={profile.activityLevel} className="capitalize" />
          <Row
            label="Calorie range"
            value={profile.calorieTarget ? `${calorieRange.min.toLocaleString()}–${calorieRange.max.toLocaleString()} kcal` : "—"}
          />
          <Row label="Protein target" value={profile.proteinTargetG ? `${profile.proteinTargetG}g` : "—"} />
          <div className="pt-2">
            <Button asChild size="sm" variant="outline" className="w-full h-8 gap-1.5">
              <Link href="/profile/targets">
                <Edit2 className="h-3.5 w-3.5" /> Edit targets
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress photos */}
      <Card>
        <CardContent className="p-0">
          <Link
            href="/profile/progress-photos"
            className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Progress Photos</p>
                <p className="text-xs text-muted-foreground">Before &amp; after, timelapse, AI feedback</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      {/* Conditions */}
      {conditions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Health Conditions</CardTitle></CardHeader>
          <CardContent className="pt-0 flex flex-wrap gap-2">
            {conditions.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
          </CardContent>
        </Card>
      )}

      {/* Goals */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Fitness Goals</CardTitle>
          <Button asChild size="sm" variant="ghost" className="h-7">
            <Link href="/profile/goals"><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals set yet. Add some so the AI can tailor plans to you.</p>
          ) : (
            goals.map((g) => (
              <div key={g.label} className="rounded-xl border border-border bg-card/50 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="accent">{g.label}</Badge>
                </div>
                {g.detail && (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{g.detail}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Equipment */}
      {equipment.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Equipment</CardTitle></CardHeader>
          <CardContent className="pt-0 flex flex-wrap gap-2">
            {equipment.map((e) => <Badge key={e} variant="outline">{e}</Badge>)}
          </CardContent>
        </Card>
      )}

      {/* Appearance */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Moon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Dark theme</p>
              <p className="text-xs text-muted-foreground">Easier on the eyes for night sessions</p>
            </div>
          </div>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Link
            href="/settings"
            className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-xs text-muted-foreground">Reminders, quiet hours, test push</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <div className="pt-2 pb-4">
        <SignOutButton />
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${className ?? ""}`}>{value}</span>
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-4 rounded-2xl bg-card border border-border">
      {icon}
      <span className="text-xl font-bold">{value}</span>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}
