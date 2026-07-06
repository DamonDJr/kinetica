"use client";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Moon, Sparkles, Loader2, Clock, AlarmClock, Trash2, Save, BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format12h } from "@/lib/sleep";

type SleepLog = {
  id: string;
  forDate: string;
  hours: number;
  quality: number;
  sleepStart: string | null;
  wakeAt: string | null;
  notes: string | null;
};

type Debt = {
  windowDays: number;
  goalHours: number;
  nightsLogged: number;
  totalSlept: number;
  totalGoal: number;
  debtHours: number;
  avgHours: number | null;
  severity: "none" | "mild" | "moderate" | "severe";
};

type Reco = {
  recommendation: { bedtime: string; getReadyAt: string; reasoning: string };
  baseline: { bedtime: string; getReadyAt: string; targetHours: number };
  aiUsed: boolean;
};

const QUALITY_LABELS = ["Awful", "Poor", "Okay", "Good", "Great"];
const SEVERITY_COLOR: Record<Debt["severity"], string> = {
  none: "text-emerald-600 bg-emerald-100 border-emerald-200",
  mild: "text-amber-600 bg-amber-100 border-amber-200",
  moderate: "text-orange-600 bg-orange-100 border-orange-200",
  severe: "text-rose-600 bg-rose-100 border-rose-200",
};

interface Props {
  goals: { wakeTimeGoal: string | null; sleepGoalHours: number };
  debt7: Debt;
  debt14: Debt;
  logs: SleepLog[];
}

export function SleepClient({ goals: initialGoals, debt7, debt14, logs: initialLogs }: Props) {
  const [goals, setGoals] = useState(initialGoals);
  const [logs, setLogs] = useState(initialLogs);
  const [savingGoals, setSavingGoals] = useState(false);
  const [reco, setReco] = useState<Reco | null>(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function saveGoals(next: { wakeTimeGoal: string | null; sleepGoalHours: number }) {
    setSavingGoals(true);
    try {
      const res = await fetch("/api/sleep/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(data);
      }
    } finally {
      setSavingGoals(false);
    }
  }

  async function fetchReco() {
    if (!goals.wakeTimeGoal) {
      setRecoError("Set a wake time goal first.");
      return;
    }
    setRecoLoading(true);
    setRecoError(null);
    try {
      const res = await fetch("/api/sleep/recommendation");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRecoError(err.error ?? "Couldn't get a recommendation.");
        return;
      }
      setReco(await res.json());
    } finally {
      setRecoLoading(false);
    }
  }

  async function deleteLog(id: string) {
    const res = await fetch(`/api/sleep?id=${id}`, { method: "DELETE" });
    if (res.ok) startTransition(() => setLogs((prev) => prev.filter((l) => l.id !== id)));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Sleep</h1>
        <p className="text-sm text-muted-foreground">Track recovery, hit your goal, train smarter.</p>
      </div>

      <DebtCard debt={debt7} label="Last 7 days" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlarmClock className="h-4 w-4" /> Goals</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Wake time
            </label>
            <input
              type="time"
              value={goals.wakeTimeGoal ?? ""}
              onChange={(e) => setGoals({ ...goals, wakeTimeGoal: e.target.value || null })}
              className="w-full h-11 rounded-xl border border-border bg-card px-3 text-base font-semibold tabular-nums"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Nightly goal</span>
              <span className="text-2xl font-black tabular-nums">{goals.sleepGoalHours.toFixed(1)}h</span>
            </div>
            <input
              type="range"
              min={5}
              max={10}
              step={0.25}
              value={goals.sleepGoalHours}
              onChange={(e) => setGoals({ ...goals, sleepGoalHours: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
          <Button
            onClick={() => saveGoals(goals)}
            disabled={savingGoals}
            className="w-full"
            size="sm"
          >
            {savingGoals ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5" /> Save goals</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Tonight&apos;s bedtime
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {!reco && !recoLoading && (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask the coach when to wind down based on your wake goal and sleep debt.
              </p>
              <Button onClick={fetchReco} disabled={!goals.wakeTimeGoal} size="sm" className="w-full">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Get tonight&apos;s plan
              </Button>
              {recoError && <p className="text-xs text-rose-600">{recoError}</p>}
            </>
          )}
          {recoLoading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Calculating…
            </div>
          )}
          {reco && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <TimeTile icon={<BedDouble className="h-4 w-4" />} label="Bedtime" value={format12h(reco.recommendation.bedtime)} />
                <TimeTile icon={<Clock className="h-4 w-4" />} label="Wind down" value={format12h(reco.recommendation.getReadyAt)} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{reco.recommendation.reasoning}</p>
              {!reco.aiUsed && (
                <p className="text-[10px] text-muted-foreground italic">Based on a baseline calculation — AI was unavailable.</p>
              )}
              <Button onClick={fetchReco} variant="ghost" size="sm" className="w-full">Re-roll</Button>
            </motion.div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">14-day rolling debt</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <DebtSummary debt={debt14} compact />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Moon className="h-4 w-4" /> Sleep history</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No sleep logged yet — log from the dashboard each morning.</p>
          ) : (
            logs.map((log) => (
              <LogRow key={log.id} log={log} goalHours={goals.sleepGoalHours} onDelete={() => deleteLog(log.id)} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DebtCard({ debt, label }: { debt: Debt; label: string }) {
  const sign = debt.debtHours > 0 ? "−" : debt.debtHours < 0 ? "+" : "";
  const abs = Math.abs(debt.debtHours).toFixed(1);
  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-widest">{label}</p>
            <p className="text-4xl font-black tabular-nums mt-1">{sign}{abs}h</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {debt.debtHours > 0 ? "sleep debt" : debt.debtHours < 0 ? "ahead of goal" : "right on goal"}
            </p>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${SEVERITY_COLOR[debt.severity]}`}>
            {debt.severity}
          </span>
        </div>
        <DebtSummary debt={debt} />
      </CardContent>
    </Card>
  );
}

function DebtSummary({ debt, compact }: { debt: Debt; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-3 gap-3 ${compact ? "" : "mt-4"}`}>
      <Stat label="Logged" value={`${debt.nightsLogged}/${debt.windowDays}`} sub="nights" />
      <Stat label="Avg" value={debt.avgHours != null ? `${debt.avgHours.toFixed(1)}h` : "—"} sub={`goal ${debt.goalHours}h`} />
      <Stat label="Slept" value={`${debt.totalSlept.toFixed(0)}h`} sub={`of ${debt.totalGoal.toFixed(0)}h`} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-white/60 border border-border p-2.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function TimeTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 border border-border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-xl font-black tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function LogRow({ log, goalHours, onDelete }: { log: SleepLog; goalHours: number; onDelete: () => void }) {
  const date = new Date(log.forDate);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const delta = +(log.hours - goalHours).toFixed(1);
  const deltaColor = delta < -1 ? "text-rose-600" : delta < 0 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <div className="w-16 shrink-0">
        <p className="text-xs font-semibold text-muted-foreground">{dateLabel}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold tabular-nums">
          {log.hours}h <span className={`text-xs font-semibold ${deltaColor}`}>{delta > 0 ? "+" : ""}{delta}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {QUALITY_LABELS[log.quality - 1]}
          {log.notes ? ` · ${log.notes}` : ""}
        </p>
      </div>
      <button
        onClick={onDelete}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
        aria-label="Delete log"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
