"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Exercise = {
  name: string;
  type?: "warmup" | "main" | "cooldown";
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

type Session = {
  dayNumber: number;
  name: string;
  focus: string;
  notes: string;
  exercises: Exercise[];
  conditionTips: { condition: string; tip: string }[];
};

type Preview = {
  name: string;
  description: string;
  coachNote: string;
  weeks: number;
  daysPerWeek: number;
  goal: string;
  difficulty: string;
  warnings: string[];
  sessions: Session[];
};

const PLACEHOLDER = `Paste your plan here. Anything works — bullet lists, tables, paragraphs.

Example:
Day 1 - Push
- Bench press: 4x8
- Overhead press: 3x10
- Triceps pushdown: 3x12

Day 2 - Pull
- Deadlift: 3x5
- Pull-ups: 4xAMRAP
- Barbell row: 3x10

Day 3 - Legs
- Squat: 4x8
- Romanian deadlift: 3x10
- Calf raises: 3x15`;

export function ImportClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    setError(null);
    setParsing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/ai/program/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Parse failed");
        return;
      }
      setPreview(data.preview);
    } catch {
      setError("Network error");
    } finally {
      setParsing(false);
    }
  }

  async function save(setActive: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/program/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, setActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      router.push(`/workouts/programs/${data.program.id}`);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
          <Link href="/workouts"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Import Plan</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Paste any workout plan — text, bullets, table, whatever. The coach will parse it,
        adapt for your conditions and injuries, and import it as a program.
      </p>

      {!preview && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <textarea
              className="w-full min-h-[260px] rounded-xl border border-border bg-background p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={PLACEHOLDER}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground tabular-nums">{text.length} chars</span>
              <Button onClick={parse} disabled={parsing || text.trim().length < 30} size="sm">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {parsing ? "Parsing..." : "Parse with AI"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {preview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Summary */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-white">
            <CardContent className="pt-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Preview</p>
              <h2 className="text-xl font-black tracking-tight">{preview.name}</h2>
              <p className="text-sm text-muted-foreground">{preview.description}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="default">{preview.goal}</Badge>
                <Badge variant="secondary">{preview.difficulty}</Badge>
                <Badge variant="secondary">{preview.weeks}w · {preview.daysPerWeek}/wk</Badge>
              </div>
              {preview.coachNote && (
                <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3 mt-3">
                  {preview.coachNote}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <p className="text-xs font-bold text-amber-800 uppercase tracking-widest">Safety adjustments</p>
              </div>
              <ul className="space-y-1">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-800 leading-relaxed">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sessions */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Week 1 — {preview.sessions.length} sessions
            </p>
            {preview.sessions.map((s) => (
              <details key={s.dayNumber} className="rounded-xl border border-border bg-card/50">
                <summary className="cursor-pointer p-3 flex items-baseline justify-between gap-3 list-none">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.focus}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{s.exercises.length} ex</span>
                </summary>
                <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-1.5">
                  {s.exercises.map((ex, i) => (
                    <div key={i} className="text-xs flex items-baseline gap-2">
                      <span className="font-semibold flex-1 truncate">{ex.name}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {ex.sets}×{ex.reps}
                      </span>
                    </div>
                  ))}
                  {s.conditionTips.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-border/50 space-y-1">
                      {s.conditionTips.map((t, i) => (
                        <p key={i} className="text-[11px] text-amber-700 leading-relaxed">
                          <span className="font-semibold">{t.condition}:</span> {t.tip}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => save(true)} disabled={saving}>
              <Check className="h-4 w-4 mr-1.5" />
              {saving ? "Saving..." : "Save & set active"}
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              Save only
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)} className="col-span-2 h-8" size="sm">
              ← Edit text
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
