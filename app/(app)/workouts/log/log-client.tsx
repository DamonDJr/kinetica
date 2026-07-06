"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Sparkles, Loader2, Check, Trophy, Dumbbell, Clock, Flame, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ParsedWorkout = {
  title: string;
  category: string;
  focus: string;
  durationMin: number | null;
  caloriesBurned: number | null;
  exercises: Array<{ name: string; detail: string }>;
  summary: string;
  coachNote: string;
};

const XP_REWARD = 50;

export function LogWorkoutClient({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null);
  // Set when the AI can't parse / is unreachable — we still let the user save the
  // raw description so a session is never lost.
  const [rawFallback, setRawFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields (seeded from the AI result, or blank in raw-fallback mode).
  const [title, setTitle] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [caloriesBurned, setCaloriesBurned] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleParse() {
    if (description.trim().length < 10) return;
    setParsing(true);
    setError(null);
    setRawFallback(false);
    try {
      const res = await fetch("/api/workouts/log/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: description }),
      });
      const data = await res.json();
      if (res.ok && data.parsed) {
        const p = data.parsed as ParsedWorkout;
        setParsed(p);
        setTitle(p.title);
        setDurationMin(p.durationMin != null ? String(p.durationMin) : "");
        setCaloriesBurned(p.caloriesBurned != null ? String(p.caloriesBurned) : "");
      } else {
        // Couldn't organize it — fall back to saving the raw text.
        setRawFallback(true);
        setError(data.error ?? "Couldn't organize that automatically — you can still save it.");
      }
    } catch {
      setRawFallback(true);
      setError("Couldn't reach the AI. You can still save this workout as-is.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    const dur = parseInt(durationMin, 10);
    const cals = parseInt(caloriesBurned, 10);
    const finalTitle = title.trim() || (rawFallback ? "Logged workout" : parsed?.title ?? "Logged workout");
    try {
      const res = await fetch("/api/workouts/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          durationMin: Number.isFinite(dur) && dur > 0 ? dur : null,
          caloriesBurned: Number.isFinite(cals) && cals > 0 ? cals : null,
          notes: parsed?.summary || description.trim(),
          exercises: parsed?.exercises ?? [],
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => router.push("/workouts"), 1500);
      } else {
        setError("Couldn't save. Try again.");
        setSaving(false);
      }
    } catch {
      setError("Couldn't save. Try again.");
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4"
      >
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <p className="text-xl font-black">Nice work, {displayName}!</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
          <Sparkles className="h-4 w-4" /> +{XP_REWARD} XP
        </span>
        {parsed?.coachNote && (
          <p className="text-sm text-muted-foreground max-w-xs">{parsed.coachNote}</p>
        )}
      </motion.div>
    );
  }

  const showConfirm = parsed !== null || rawFallback;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/workouts">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Your Training</p>
          <h1 className="text-2xl font-black tracking-tight">Log a Workout</h1>
        </div>
      </div>

      {/* Description input */}
      <div className="space-y-2">
        <Label className="block">What did you do?</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 3 sets of 10 push-ups, dumbbell rows till failure, then a 20 min incline walk. Felt strong."
          rows={5}
          className="w-full rounded-xl border border-border bg-input px-3.5 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Type it however you like — the AI cleans it up into a tidy entry. You earn +{XP_REWARD} XP for logging it.
        </p>
      </div>

      {!showConfirm && (
        <Button onClick={handleParse} disabled={parsing || description.trim().length < 10} className="w-full h-12 font-bold">
          {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Organizing…</> : <><Sparkles className="h-4 w-4 mr-2" />Organize with AI</>}
        </Button>
      )}

      {error && <p className="text-xs text-fat font-medium">{error}</p>}

      {/* Confirm panel */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-4"
          >
            {parsed?.focus && (
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wide">
                <Dumbbell className="h-3.5 w-3.5" />
                {parsed.focus}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Pencil className="h-3 w-3" /> Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session title" className="h-9" />
            </div>

            {parsed && parsed.exercises.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Exercises</p>
                <div className="space-y-1.5">
                  {parsed.exercises.map((ex, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-border px-3 py-2">
                      <span className="text-sm font-semibold truncate">{ex.name}</span>
                      {ex.detail && <span className="text-xs text-muted-foreground tabular-nums shrink-0">{ex.detail}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Duration (min)</Label>
                <Input type="number" inputMode="numeric" min="0" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="—" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Flame className="h-3 w-3" /> Calories burned</Label>
                <Input type="number" inputMode="numeric" min="0" value={caloriesBurned} onChange={(e) => setCaloriesBurned(e.target.value)} placeholder="—" className="h-9" />
              </div>
            </div>

            {rawFallback && (
              <p className="text-[11px] text-muted-foreground">
                Saving your description as-is. You can tidy the title and add a duration above.
              </p>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full h-12 font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Save &amp; earn +{XP_REWARD} XP
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
