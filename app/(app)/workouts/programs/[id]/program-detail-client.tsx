"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Bike,
  Check,
  ChevronDown,
  Dumbbell,
  Footprints,
  HeartPulse,
  Leaf,
  Lightbulb,
  Loader2,
  Moon,
  Play,
  Sparkles,
  Star,
  Sunrise,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Exercise = {
  name: string;
  type?: "warmup" | "main" | "cooldown";
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

type ConditionTip = {
  condition: string;
  tip: string;
};

type ProgressionTip = {
  weeks: string;
  tip: string;
};

type SessionData = {
  id: string;
  dayNumber: number;
  name: string;
  focus: string;
  exercises: string;
  conditionTips: string;
  notes: string | null;
  completed: boolean;
};

interface Props {
  weeks: { weekNum: number; sessions: SessionData[] }[];
  totalWeeks: number;
  programId: string;
  isActiveProgram: boolean;
  progressionTips: string;
}

const conditionColors: Record<string, { bg: string; border: string; label: string }> = {
  default: { bg: "bg-amber-50", border: "border-amber-200", label: "text-amber-700" },
  POTS: { bg: "bg-sky-50", border: "border-sky-200", label: "text-sky-700" },
  hEDS: { bg: "bg-violet-50", border: "border-violet-200", label: "text-violet-700" },
  "Hypermobility": { bg: "bg-violet-50", border: "border-violet-200", label: "text-violet-700" },
  "Chronic Fatigue": { bg: "bg-rose-50", border: "border-rose-200", label: "text-rose-700" },
  "CFS": { bg: "bg-rose-50", border: "border-rose-200", label: "text-rose-700" },
  ADHD: { bg: "bg-emerald-50", border: "border-emerald-200", label: "text-emerald-700" },
  Fibromyalgia: { bg: "bg-orange-50", border: "border-orange-200", label: "text-orange-700" },
  Asthma: { bg: "bg-teal-50", border: "border-teal-200", label: "text-teal-700" },
};

function getConditionStyle(condition: string) {
  const key = Object.keys(conditionColors).find(
    (k) => k !== "default" && condition.toLowerCase().includes(k.toLowerCase())
  );
  return conditionColors[key ?? "default"];
}

/*
 * Each day gets a color + icon theme picked from its focus/name. The color is
 * exposed as the --day CSS variable and every tint below is a color-mix() of
 * it over transparent, so the same theme reads correctly on light and dark
 * backgrounds.
 */
type DayTheme = { color: string; icon: LucideIcon };

const dayThemes: { keys: string[]; theme: DayTheme }[] = [
  { keys: ["lower", "glute", "leg", "thigh", "squat", "hip"], theme: { color: "#e0756a", icon: Footprints } },
  { keys: ["core", "ab", "stability", "plank"], theme: { color: "#5b86d6", icon: Target } },
  { keys: ["upper", "arm", "back", "chest", "shoulder", "push", "pull"], theme: { color: "#d9913d", icon: Dumbbell } },
  { keys: ["cardio", "bike", "interval", "conditioning", "endurance"], theme: { color: "#4caf7d", icon: Bike } },
  { keys: ["full body", "full-body", "total body", "circuit"], theme: { color: "#9c6bd9", icon: Zap } },
  { keys: ["recovery", "stretch", "mobility", "light", "flexibility"], theme: { color: "#2fae96", icon: Leaf } },
  { keys: ["rest"], theme: { color: "#8a8aa8", icon: Moon } },
];

function getDayTheme(session: SessionData): DayTheme {
  const text = `${session.focus} ${session.name}`.toLowerCase();
  const hit = dayThemes.find(({ keys }) => keys.some((k) => text.includes(k)));
  return hit?.theme ?? { color: "#7c6af7", icon: Activity };
}

/* Equipment chips are derived from the exercise text — the AI plan doesn't
 * store equipment separately. */
const equipmentPatterns: [RegExp, string][] = [
  [/\bbande?d?\b|resistance band|mini.?band|loop band/, "Resistance Bands"],
  [/pilates bar/, "Pilates Bar"],
  [/dumbbell/, "Dumbbells"],
  [/kettlebell/, "Kettlebell"],
  [/barbell/, "Barbell"],
  [/\bbike\b|cycling|recumbent/, "Recumbent Bike"],
  [/vibration plate/, "Vibration Plate"],
  [/machine/, "Machine"],
  [/treadmill/, "Treadmill"],
];

function deriveEquipment(exercises: Exercise[]): string[] {
  const text = exercises.map((e) => `${e.name} ${e.notes}`).join(" ").toLowerCase();
  const found = equipmentPatterns.filter(([re]) => re.test(text)).map(([, label]) => label);
  return found.length > 0 ? found : exercises.length > 0 ? ["Bodyweight"] : [];
}

export function ProgramDetailClient({ weeks, totalWeeks, programId, isActiveProgram, progressionTips }: Props) {
  const router = useRouter();
  const [active, setActive] = useState(isActiveProgram);
  const [togglingActive, setTogglingActive] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [tips, setTips] = useState<ProgressionTip[]>(() => {
    try {
      const parsed = JSON.parse(progressionTips);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [generatingTips, setGeneratingTips] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [sessionExercises, setSessionExercises] = useState<Record<string, Exercise[]>>(() => {
    const init: Record<string, Exercise[]> = {};
    weeks.forEach(({ sessions }) =>
      sessions.forEach((s) => {
        try {
          const parsed = JSON.parse(s.exercises);
          if (parsed.length > 0) init[s.id] = parsed;
        } catch {}
      })
    );
    return init;
  });
  const [sessionConditionTips, setSessionConditionTips] = useState<Record<string, ConditionTip[]>>(() => {
    const init: Record<string, ConditionTip[]> = {};
    weeks.forEach(({ sessions }) =>
      sessions.forEach((s) => {
        try {
          const parsed = JSON.parse(s.conditionTips);
          if (parsed.length > 0) init[s.id] = parsed;
        } catch {}
      })
    );
    return init;
  });
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    weeks.forEach(({ sessions }) => sessions.forEach((s) => { if (s.completed) ids.add(s.id); }));
    return ids;
  });

  // Land on the first session that still needs doing.
  const [activeWeekNum, setActiveWeekNum] = useState(() => {
    for (const w of weeks) if (w.sessions.some((s) => !s.completed)) return w.weekNum;
    return weeks[0]?.weekNum ?? 1;
  });
  const [activeDayIdx, setActiveDayIdx] = useState(() => {
    for (const w of weeks) {
      const idx = w.sessions.findIndex((s) => !s.completed);
      if (idx !== -1) return idx;
    }
    return 0;
  });

  const week = weeks.find((w) => w.weekNum === activeWeekNum) ?? weeks[0];
  const session = week?.sessions[Math.min(activeDayIdx, (week?.sessions.length ?? 1) - 1)];

  async function toggleActive() {
    setTogglingActive(true);
    try {
      const next = !active;
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProgramId: next ? programId : null }),
      });
      setActive(next);
      router.refresh();
    } finally {
      setTogglingActive(false);
    }
  }

  async function generateExercises(sessionId: string) {
    setGeneratingId(sessionId);
    try {
      const res = await fetch("/api/ai/program/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSessionExercises((prev) => ({ ...prev, [sessionId]: data.exercises }));
      if (data.conditionTips?.length) {
        setSessionConditionTips((prev) => ({ ...prev, [sessionId]: data.conditionTips }));
      }
    } catch {
      alert("Exercise generation failed. Check that LM Studio is running.");
    } finally {
      setGeneratingId(null);
    }
  }

  async function generateTips() {
    setGeneratingTips(true);
    try {
      const res = await fetch("/api/ai/program/progression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTips(data.tips);
    } catch {
      alert("Progression plan generation failed. Check that LM Studio is running.");
    } finally {
      setGeneratingTips(false);
    }
  }

  function selectWeek(weekNum: number) {
    setActiveWeekNum(weekNum);
    setActiveDayIdx(0);
    setExpandedExercise(null);
  }

  function selectDay(idx: number) {
    setActiveDayIdx(idx);
    setExpandedExercise(null);
  }

  function startSession(sessionId: string) {
    router.push(`/workouts/programs/${programId}/session/${sessionId}`);
  }

  if (!week || !session) return null;

  const exercises = sessionExercises[session.id] ?? [];
  const conditionTips = sessionConditionTips[session.id] ?? [];
  const hasExercises = exercises.length > 0;
  const isGenerating = generatingId === session.id;
  const isDone = completedIds.has(session.id);

  const warmup = exercises.filter((e) => e.type === "warmup");
  const main = exercises.filter((e) => e.type === "main" || !e.type);
  const cooldown = exercises.filter((e) => e.type === "cooldown");
  const equipment = deriveEquipment(exercises);

  const theme = getDayTheme(session);
  const DayIcon = theme.icon;

  return (
    <div className="space-y-6">
      {/* Active program toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-sm shadow-black/4">
        <div>
          <p className="font-bold text-sm">{active ? "Active Program" : "Set as Active"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {active ? "Shown on dashboard — tap to remove" : "Pin to dashboard for quick access"}
          </p>
        </div>
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          onClick={toggleActive}
          disabled={togglingActive}
          className={cn("shrink-0 gap-1.5", active && "bg-emerald-500 hover:bg-emerald-600 border-emerald-500")}
        >
          {togglingActive ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Star className={cn("h-3.5 w-3.5", active && "fill-white")} />
          )}
          {active ? "Active" : "Set Active"}
        </Button>
      </div>

      {/* Week selector */}
      {totalWeeks > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {weeks.map(({ weekNum, sessions }) => {
            const weekDone = sessions.every((s) => completedIds.has(s.id));
            const isActiveWeek = weekNum === activeWeekNum;
            return (
              <button
                key={weekNum}
                onClick={() => selectWeek(weekNum)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5",
                  isActiveWeek
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                )}
              >
                Week {weekNum}
                {weekDone && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Day selector pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {week.sessions.map((s, i) => {
          const t = getDayTheme(s);
          const Icon = t.icon;
          const isActiveDay = i === activeDayIdx;
          const done = completedIds.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => selectDay(i)}
              style={{ "--day": t.color } as CSSProperties}
              className={cn(
                "relative shrink-0 flex flex-col items-center gap-1 rounded-2xl border-2 px-3.5 py-2.5 transition-all",
                isActiveDay
                  ? "border-[var(--day)] bg-[color-mix(in_srgb,var(--day)_10%,transparent)]"
                  : "border-transparent bg-secondary/60 hover:bg-secondary"
              )}
            >
              <Icon
                className={cn("h-5 w-5", isActiveDay ? "text-[var(--day)]" : "text-muted-foreground")}
                strokeWidth={1.8}
              />
              <span className={cn(
                "text-[10px] font-black tracking-widest",
                isActiveDay ? "text-foreground" : "text-muted-foreground"
              )}>
                DAY {i + 1}
              </span>
              {done && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={session.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ "--day": theme.color } as CSSProperties}
          className="space-y-4"
        >
          {/* Day header card */}
          <div className="flex items-center gap-4 rounded-2xl border-2 border-[color-mix(in_srgb,var(--day)_45%,transparent)] bg-[color-mix(in_srgb,var(--day)_8%,transparent)] p-4">
            <div className="h-14 w-14 rounded-full bg-card shadow-sm shadow-black/5 flex items-center justify-center shrink-0">
              {isDone ? (
                <Check className="h-6 w-6 text-emerald-500" strokeWidth={2.5} />
              ) : (
                <DayIcon className="h-6 w-6 text-[var(--day)]" strokeWidth={1.8} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--day)] mb-0.5">
                Week {week.weekNum} · Day {activeDayIdx + 1}
                {isDone && " · Done"}
              </p>
              <h2 className={cn("text-xl font-black tracking-tight", isDone && "text-muted-foreground")}>
                {session.name}
              </h2>
              {session.focus && (
                <p className="text-sm text-muted-foreground capitalize mt-0.5">{session.focus}</p>
              )}
            </div>
          </div>

          {session.notes && (
            <p className="text-xs text-muted-foreground italic leading-relaxed px-1">{session.notes}</p>
          )}

          {/* Equipment chips */}
          {equipment.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Equipment</p>
              <div className="flex flex-wrap gap-1.5">
                {equipment.map((eq) => (
                  <span
                    key={eq}
                    className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs font-semibold text-secondary-foreground"
                  >
                    {eq}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Generate CTA when the session has no exercises yet */}
          {!hasExercises && (
            <button
              onClick={() => generateExercises(session.id)}
              disabled={isGenerating}
              className="w-full rounded-2xl border-2 border-dashed border-border p-6 flex flex-col items-center gap-2 hover:border-primary/40 transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Building exercises and condition tips…</p>
                </>
              ) : (
                <>
                  <Sparkles className="h-6 w-6 text-primary" />
                  <p className="font-bold text-sm">Generate this session</p>
                  <p className="text-xs text-muted-foreground">AI fills in exercises, reps and condition tips</p>
                </>
              )}
            </button>
          )}

          {/* Warm-up callout */}
          {warmup.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 items-start">
              <Sunrise className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Warm Up</p>
                {warmup.map((ex, i) => (
                  <p key={i} className="text-xs leading-relaxed text-foreground/80">
                    <span className="font-semibold">{ex.name}</span>
                    {ex.sets > 0 && ex.reps && <span className="text-muted-foreground"> — {ex.sets} × {ex.reps}</span>}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Main work */}
          {main.length > 0 && (
            <div>
              <div className="flex items-center justify-between border-b-2 border-[var(--day)] pb-2 mb-2.5">
                <p className="font-bold text-sm">Main Work</p>
                <span className="rounded-full bg-[var(--day)] px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {main.length} {main.length === 1 ? "exercise" : "exercises"}
                </span>
              </div>
              <div className="space-y-2">
                {main.map((ex, i) => {
                  const key = `${session.id}-main-${i}`;
                  const isOpen = expandedExercise === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setExpandedExercise(isOpen ? null : key)}
                      className={cn(
                        "w-full text-left rounded-xl border px-4 py-3 transition-colors",
                        isOpen
                          ? "border-[color-mix(in_srgb,var(--day)_50%,transparent)] bg-[color-mix(in_srgb,var(--day)_7%,transparent)]"
                          : "border-border bg-white shadow-sm shadow-black/4"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm mb-1.5">{ex.name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ex.sets > 0 && ex.reps && (
                              <span className="rounded-full bg-[color-mix(in_srgb,var(--day)_18%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold text-foreground/80">
                                {ex.sets} × {ex.reps}
                              </span>
                            )}
                            {ex.rest && ex.rest !== "—" && (
                              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                Rest: {ex.rest}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-[var(--day)] transition-transform duration-200",
                            isOpen && "rotate-180"
                          )}
                        />
                      </div>
                      <AnimatePresence initial={false}>
                        {isOpen && ex.notes && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 pt-3 border-t border-dashed border-[color-mix(in_srgb,var(--day)_45%,transparent)] flex gap-2.5 items-start">
                              <Lightbulb className="h-3.5 w-3.5 text-[var(--day)] shrink-0 mt-0.5" strokeWidth={2} />
                              <p className="text-xs leading-relaxed text-muted-foreground">{ex.notes}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cool-down callout */}
          {cooldown.length > 0 && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 flex gap-3 items-start">
              <Moon className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-teal-700 mb-1">Cool Down</p>
                {cooldown.map((ex, i) => (
                  <p key={i} className="text-xs leading-relaxed text-foreground/80">
                    <span className="font-semibold">{ex.name}</span>
                    {ex.sets > 0 && ex.reps && <span className="text-muted-foreground"> — {ex.sets} × {ex.reps}</span>}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Condition tips */}
          {conditionTips.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <HeartPulse className="h-3 w-3" />Always Remember
              </p>
              {conditionTips.map((tip, i) => {
                const style = getConditionStyle(tip.condition);
                return (
                  <div key={i} className={`rounded-xl border ${style.border} ${style.bg} px-3 py-2.5`}>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${style.label}`}>
                      {tip.condition}
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/80">{tip.tip}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Start workout */}
          {hasExercises && !isDone && (
            <Button className="w-full gap-2" onClick={() => startSession(session.id)}>
              <Play className="h-4 w-4 fill-white" />
              Start Workout
            </Button>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Progressive overload plan — program-level, fixed dark card in both themes */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "linear-gradient(135deg, #262140 0%, #1f2a40 60%, #1c3338 100%)" }}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#2dd4bf] mb-1 flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3" />Progressive Overload Plan
        </p>
        <p className="text-base font-bold text-[#faf9f7] mb-4">How You Keep Seeing Results</p>
        {tips.length > 0 ? (
          <div className="space-y-3">
            {tips.map((t, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="shrink-0 rounded-full bg-[#2dd4bf] px-2.5 py-0.5 text-[10px] font-black text-[#0a3d38] whitespace-nowrap mt-0.5">
                  {t.weeks}
                </span>
                <p className="text-xs leading-relaxed text-[#faf9f7]/80">{t.tip}</p>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={generateTips}
            disabled={generatingTips}
            className="w-full rounded-xl border border-dashed border-white/25 p-4 flex items-center justify-center gap-2 text-sm font-semibold text-[#faf9f7]/80 hover:border-[#2dd4bf]/60 hover:text-[#faf9f7] transition-colors"
          >
            {generatingTips ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#2dd4bf]" />
                Writing your progression plan…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-[#2dd4bf]" />
                Generate progression plan
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
