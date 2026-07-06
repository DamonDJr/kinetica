"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, Clock, ChevronLeft, HeartPulse, Play, Pause, Loader2, Trophy, Sparkles,
  Timer, SkipForward, Plus, Minus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedbackEntry = { difficulty?: number; note?: string };
type Adjustment = { sessionName: string; summary: string; adjustment: string } | null;

const DIFFICULTY_LABELS = ["Too easy", "Easy", "Just right", "Hard", "Brutal"];
const DIFFICULTY_COLORS = [
  "bg-sky-100 border-sky-300 text-sky-700",
  "bg-emerald-100 border-emerald-300 text-emerald-700",
  "bg-primary/10 border-primary/30 text-primary",
  "bg-amber-100 border-amber-300 text-amber-700",
  "bg-rose-100 border-rose-300 text-rose-700",
];

type Exercise = {
  name: string;
  type?: "warmup" | "main" | "cooldown";
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

type ConditionTip = { condition: string; tip: string };

const conditionColors: Record<string, { bg: string; border: string; label: string }> = {
  default: { bg: "bg-amber-50", border: "border-amber-200", label: "text-amber-700" },
  POTS: { bg: "bg-sky-50", border: "border-sky-200", label: "text-sky-700" },
  hEDS: { bg: "bg-violet-50", border: "border-violet-200", label: "text-violet-700" },
  Hypermobility: { bg: "bg-violet-50", border: "border-violet-200", label: "text-violet-700" },
  "Chronic Fatigue": { bg: "bg-rose-50", border: "border-rose-200", label: "text-rose-700" },
  CFS: { bg: "bg-rose-50", border: "border-rose-200", label: "text-rose-700" },
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

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Parse rest strings like "60s", "90 sec", "1 min", "1:30", "2-3 min", "90". */
function parseRestSeconds(rest: string | undefined | null): number {
  if (!rest) return 60;
  const trimmed = rest.toLowerCase().trim();

  // mm:ss
  const colon = trimmed.match(/^(\d+):([0-5]\d)$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);

  // pull the first number (handles ranges like "2-3 min" → 2)
  const numMatch = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 60;
  const num = parseFloat(numMatch[1]);

  if (/min/.test(trimmed)) return Math.round(num * 60);
  if (/sec|^\d+s\b|s\b/.test(trimmed)) return Math.round(num);
  // bare number — assume seconds when small, minutes when ≤10
  return num <= 10 ? Math.round(num * 60) : Math.round(num);
}

/** Wall-clock read isolated to a helper so eslint's purity rule sees a single
 * call site we can audit (event handlers + intervals only). */
function readNow(): number {
  return Date.now();
}

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    setTimeout(() => ctx.close(), 600);
  } catch {
    // no-op
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* */ }
  }
}

interface Props {
  programId: string;
  session: { id: string; name: string; focus: string; notes: string | null; completed: boolean };
  exercises: Exercise[];
  conditionTips: ConditionTip[];
}

type RestState = {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  endsAt: number;
  totalSeconds: number;
};

export function SessionWorkoutClient({ programId, session, exercises, conditionTips }: Props) {
  const router = useRouter();
  const [setsDone, setSetsDone] = useState<Record<string, number>>({});
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(session.completed);
  const [completing, setCompleting] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, FeedbackEntry>>({});
  const [sessionNote, setSessionNote] = useState("");
  const [adjustment, setAdjustment] = useState<Adjustment>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [now, setNow] = useState(0);
  const tickedRef = useRef(false);

  // Initialise the wall-clock once on mount (Date.now in the useState
  // initializer trips react-hooks/purity).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNow(readNow()); }, []);

  function setDifficulty(name: string, d: number) {
    setFeedback((prev) => ({ ...prev, [name]: { ...prev[name], difficulty: d } }));
  }
  function setExerciseNote(name: string, note: string) {
    setFeedback((prev) => ({ ...prev, [name]: { ...prev[name], note } }));
  }

  // Single 1Hz tick drives both the session elapsed counter and the rest banner.
  useEffect(() => {
    if (!running && !rest) return;
    const id = setInterval(() => {
      setNow(readNow());
      if (running) setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running, rest]);

  // Beep + clear rest when countdown reaches zero.
  const restRemaining = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
  useEffect(() => {
    if (rest && restRemaining === 0 && !tickedRef.current) {
      tickedRef.current = true;
      beep();
    }
    if (!rest || restRemaining > 0) tickedRef.current = false;
  }, [rest, restRemaining]);

  function bumpSet(ex: Exercise) {
    if (done) return;
    const current = setsDone[ex.name] ?? 0;
    if (current >= ex.sets) return;
    const next = current + 1;
    setSetsDone((prev) => ({ ...prev, [ex.name]: next }));

    // Auto-start the session timer on the first set the user completes.
    if (!running) setRunning(true);

    // Don't start a rest after the final set of the exercise — they're done.
    if (next < ex.sets) {
      const seconds = parseRestSeconds(ex.rest);
      const t = readNow();
      setRest({
        exerciseName: ex.name,
        setNumber: next,
        totalSets: ex.sets,
        endsAt: t + seconds * 1000,
        totalSeconds: seconds,
      });
      setNow(t);
    } else {
      setRest(null);
    }
  }

  function adjustRest(deltaSeconds: number) {
    setRest((prev) => (prev ? { ...prev, endsAt: prev.endsAt + deltaSeconds * 1000, totalSeconds: prev.totalSeconds + deltaSeconds } : prev));
  }

  function skipRest() {
    setRest(null);
  }

  function undoSet(ex: Exercise) {
    if (done) return;
    const current = setsDone[ex.name] ?? 0;
    if (current <= 0) return;
    setSetsDone((prev) => ({ ...prev, [ex.name]: current - 1 }));
    if (rest?.exerciseName === ex.name) setRest(null);
  }

  async function complete() {
    setCompleting(true);
    try {
      setRunning(false);
      setRest(null);
      const feedbackPayload = Object.entries(feedback)
        .filter(([, v]) => typeof v.difficulty === "number")
        .map(([exerciseName, v]) => ({
          exerciseName,
          difficulty: v.difficulty!,
          note: v.note?.trim() || undefined,
        }));
      const res = await fetch("/api/workouts/programs/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          durationMin: Math.round(elapsed / 60) || null,
          notes: sessionNote.trim() || undefined,
          feedback: feedbackPayload,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.adjustment) setAdjustment(data.adjustment);
        setDone(true);
      } else {
        throw new Error("save failed");
      }
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setCompleting(false);
    }
  }

  const warmup = useMemo(() => exercises.filter((e) => e.type === "warmup"), [exercises]);
  const main = useMemo(() => exercises.filter((e) => e.type === "main" || !e.type), [exercises]);
  const cooldown = useMemo(() => exercises.filter((e) => e.type === "cooldown"), [exercises]);

  const allDone = done;
  const totalSetsAllExercises = exercises.reduce((s, e) => s + e.sets, 0);
  const completedSets = exercises.reduce((s, e) => s + Math.min(e.sets, setsDone[e.name] ?? 0), 0);
  const sessionPct = totalSetsAllExercises > 0 ? Math.round((completedSets / totalSetsAllExercises) * 100) : 0;

  return (
    <div className="space-y-6 pb-32">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push(`/workouts/programs/${programId}`)}
          className="flex items-center gap-1 text-sm text-muted-foreground mb-4 -ml-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />Back to program
        </button>
        <h1 className="text-2xl font-black tracking-tight">{session.name}</h1>
        <p className="text-sm text-muted-foreground capitalize mt-0.5">{session.focus}</p>
        {session.notes && (
          <p className="text-xs text-muted-foreground italic mt-2 leading-relaxed">{session.notes}</p>
        )}
      </div>

      {/* Session timer + progress */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm shadow-black/4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-black tabular-nums tracking-tight">{fmt(elapsed)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {running ? "Session running" : elapsed === 0 ? "Auto-starts on first set" : "Paused"}
            </p>
          </div>
          <Button
            size="sm"
            variant={running ? "outline" : "default"}
            onClick={() => setRunning((r) => !r)}
            disabled={allDone}
            className="gap-1.5"
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-white" />}
            {running ? "Pause" : elapsed === 0 ? "Start" : "Resume"}
          </Button>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>{completedSets} / {totalSetsAllExercises} sets</span>
            <span>{sessionPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={false}
              animate={{ width: `${sessionPct}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 28 }}
            />
          </div>
        </div>
      </div>

      {/* Condition tips */}
      {conditionTips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <HeartPulse className="h-3 w-3" />Condition Tips
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

      {/* Exercises */}
      {[
        { label: "Warm-up", items: warmup, color: "text-amber-600" },
        { label: "Main Work", items: main, color: "text-primary" },
        { label: "Cool-down", items: cooldown, color: "text-accent" },
      ].map(({ label, items, color }) =>
        items.length > 0 ? (
          <div key={label}>
            <p className={cn("text-[10px] font-black uppercase tracking-widest mb-3", color)}>{label}</p>
            <div className="space-y-2.5">
              {items.map((ex) => {
                const sets = ex.sets || 1;
                const completedCount = setsDone[ex.name] ?? 0;
                const exDone = completedCount >= sets;
                const isMain = !ex.type || ex.type === "main";
                const isResting = rest?.exerciseName === ex.name;
                const fb = feedback[ex.name];

                return (
                  <div
                    key={ex.name}
                    className={cn(
                      "rounded-2xl border transition-all overflow-hidden",
                      exDone
                        ? "bg-emerald-50 border-emerald-200"
                        : isResting
                          ? "bg-primary/5 border-primary/30"
                          : "bg-white border-border shadow-sm shadow-black/4"
                    )}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <div className={cn(
                        "h-6 w-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        exDone ? "bg-emerald-500 border-emerald-500" : "border-border"
                      )}>
                        {exDone && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-semibold text-sm", exDone && "line-through text-muted-foreground")}>
                          {ex.name}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {sets > 0 && ex.reps && (
                            <span className="text-xs text-muted-foreground">{sets} × {ex.reps}</span>
                          )}
                          {ex.rest && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />{ex.rest}
                            </span>
                          )}
                        </div>
                        {ex.notes && (
                          <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed italic">{ex.notes}</p>
                        )}
                      </div>
                    </div>

                    {/* Per-set chips */}
                    {!allDone && (
                      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                        {Array.from({ length: sets }).map((_, idx) => {
                          const setNum = idx + 1;
                          const isSetDone = setNum <= completedCount;
                          const isNext = setNum === completedCount + 1;
                          return (
                            <button
                              key={idx}
                              onClick={() => isSetDone ? undoSet(ex) : isNext ? bumpSet(ex) : null}
                              disabled={!isSetDone && !isNext}
                              className={cn(
                                "h-9 min-w-[44px] px-3 rounded-lg text-xs font-bold border transition-all tabular-nums",
                                isSetDone
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : isNext
                                    ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                                    : "bg-secondary border-border text-muted-foreground/50 cursor-not-allowed"
                              )}
                              title={isSetDone ? "Tap to undo this set" : isNext ? "Tap when set is done" : ""}
                            >
                              {isSetDone ? <Check className="h-3 w-3 inline" strokeWidth={3} /> : `Set ${setNum}`}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Difficulty rating once exercise is done */}
                    {exDone && isMain && !allDone && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="border-t border-emerald-200/60 px-4 py-3 space-y-2"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          How did this one feel?
                        </p>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map((d) => {
                            const active = fb?.difficulty === d;
                            return (
                              <button
                                key={d}
                                onClick={() => setDifficulty(ex.name, d)}
                                className={cn(
                                  "flex-1 h-9 rounded-lg text-[10px] font-bold border transition-all",
                                  active
                                    ? DIFFICULTY_COLORS[d - 1]
                                    : "bg-white border-border text-muted-foreground hover:border-primary/30"
                                )}
                              >
                                {DIFFICULTY_LABELS[d - 1]}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          placeholder="Optional note (e.g. lower back tight, last set failed)…"
                          value={fb?.note ?? ""}
                          onChange={(e) => setExerciseNote(ex.name, e.target.value)}
                          className="w-full h-8 px-2.5 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null
      )}

      {/* Session note */}
      {!allDone && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Session note (optional)
          </p>
          <textarea
            value={sessionNote}
            onChange={(e) => setSessionNote(e.target.value)}
            placeholder="Anything to flag for next time? e.g. ran out of time on cooldown, felt strong"
            rows={2}
            className="w-full p-3 rounded-2xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
      )}

      {/* Complete / Done state */}
      <AnimatePresence mode="wait">
        {allDone ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-3"
          >
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
              <Trophy className="h-10 w-10 text-emerald-500 mx-auto" />
              <p className="font-black text-lg">Session Complete!</p>
              <p className="text-sm text-muted-foreground">+50 XP earned. Great work!</p>
            </div>
            {adjustment && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3"
              >
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                    Next session adjusted · {adjustment.adjustment}
                  </p>
                  <p className="text-sm font-semibold mt-0.5">{adjustment.sessionName}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">{adjustment.summary}</p>
                </div>
              </motion.div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/workouts/programs/${programId}`)}
            >
              Back to Program
            </Button>
          </motion.div>
        ) : (
          <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Button
              className="w-full h-12 text-base font-bold gap-2"
              onClick={complete}
              disabled={completing}
            >
              {completing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" strokeWidth={3} />
              )}
              {completing ? "Saving & adjusting…" : "Mark Session Complete"}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">Tap each set as you finish — rest timer is automatic</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky rest countdown banner */}
      <AnimatePresence>
        {rest && !allDone && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed left-0 right-0 bottom-0 z-50 px-3 pb-3 pointer-events-none"
          >
            <div className={cn(
              "max-w-md mx-auto rounded-2xl shadow-xl shadow-black/20 border pointer-events-auto overflow-hidden",
              restRemaining === 0
                ? "bg-emerald-500 border-emerald-600 text-white"
                : "bg-foreground border-foreground text-background"
            )}>
              <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-70 flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {restRemaining === 0 ? "Rest done — go!" : "Resting"}
                  </p>
                  <p className="text-xs font-semibold truncate mt-0.5">
                    After {rest.exerciseName} · Set {rest.setNumber}/{rest.totalSets}
                  </p>
                </div>
                <p className="text-3xl font-black tabular-nums">{fmt(restRemaining)}</p>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-white/15">
                <motion.div
                  key={rest.endsAt}
                  className={cn("h-full", restRemaining === 0 ? "bg-white" : "bg-primary")}
                  initial={false}
                  animate={{ width: `${rest.totalSeconds > 0 ? Math.max(0, Math.min(100, (restRemaining / rest.totalSeconds) * 100)) : 0}%` }}
                  transition={{ duration: 0.4, ease: "linear" }}
                />
              </div>

              <div className="px-2 pb-2 pt-2 grid grid-cols-4 gap-1.5">
                <button
                  onClick={() => adjustRest(-15)}
                  className="h-9 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center gap-1"
                >
                  <Minus className="h-3 w-3" />15s
                </button>
                <button
                  onClick={() => adjustRest(15)}
                  className="h-9 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="h-3 w-3" />15s
                </button>
                <button
                  onClick={skipRest}
                  className="h-9 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center gap-1 col-span-1"
                >
                  <SkipForward className="h-3 w-3" />Skip
                </button>
                <button
                  onClick={() => setRest(null)}
                  aria-label="Dismiss"
                  className="h-9 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
