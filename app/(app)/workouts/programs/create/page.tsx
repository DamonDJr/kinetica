"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGeneration } from "@/components/generation-context";

const GOALS = [
  { value: "strength", label: "Build Strength", emoji: "🏋️", desc: "Progressive overload, compound lifts" },
  { value: "hypertrophy", label: "Build Muscle", emoji: "💪", desc: "Volume-focused, muscle growth" },
  { value: "endurance", label: "Endurance", emoji: "🏃", desc: "Cardio capacity, stamina" },
  { value: "mobility", label: "Mobility & Flexibility", emoji: "🧘", desc: "Range of motion, injury prevention" },
  { value: "weight_loss", label: "Lose Weight", emoji: "🔥", desc: "Calorie burn, metabolic conditioning" },
  { value: "general", label: "General Fitness", emoji: "⚡", desc: "Balanced health and fitness" },
];

const WEEKS = [2, 4, 6, 8, 12];
const DAYS = [2, 3, 4, 5];
const DIFFICULTIES = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function CreateProgramPage() {
  const router = useRouter();
  const { generate, state } = useGeneration();
  const [goal, setGoal] = useState("general");
  const [weeks, setWeeks] = useState(4);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [difficulty, setDifficulty] = useState("beginner");
  const [freeForm, setFreeForm] = useState("");

  const loading = state.status === "generating";

  async function handleGenerate() {
    const result = await generate({ goal, weeks, daysPerWeek, difficulty, freeForm: freeForm.trim() || undefined });
    if (result) {
      router.push(`/workouts/programs/${result.programId}`);
    }
    // errors are shown in the GenerationBanner — no need to duplicate here
  }

  return (
    <div className="space-y-8 pb-8">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">AI Generator</p>
        <h1 className="text-3xl font-black tracking-tight">Build a Program</h1>
        <p className="text-sm text-muted-foreground mt-1">AI designs every session, adapted to your health profile and equipment.</p>
      </div>

      {/* Goal */}
      <section>
        <h2 className="text-base font-black mb-3">What's your goal?</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {GOALS.map((g) => (
            <button
              key={g.value}
              onClick={() => setGoal(g.value)}
              className={cn(
                "text-left p-3.5 rounded-2xl border transition-all",
                goal === g.value
                  ? "border-primary/50 bg-primary/8 shadow-sm"
                  : "border-border bg-white hover:border-primary/20 shadow-sm shadow-black/4"
              )}
            >
              <span className="text-xl">{g.emoji}</span>
              <p className={cn("font-bold text-sm mt-1.5", goal === g.value ? "text-primary" : "text-foreground")}>{g.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{g.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Free-form */}
      <section>
        <h2 className="text-base font-black mb-1">Tell the AI more <span className="text-muted-foreground font-medium text-sm">(optional)</span></h2>
        <p className="text-xs text-muted-foreground mb-2.5">Specific focus areas, limitations, equipment, style preferences…</p>
        <textarea
          value={freeForm}
          onChange={(e) => setFreeForm(e.target.value)}
          placeholder="e.g. I want to focus on handstand press work and hip flexor mobility. I have a pull-up bar and dumbbells. Avoid heavy barbell squats due to lower back issues."
          rows={3}
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
        />
      </section>

      {/* Duration */}
      <section>
        <h2 className="text-base font-black mb-3">How many weeks?</h2>
        <div className="flex gap-2">
          {WEEKS.map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={cn(
                "flex-1 py-3 rounded-xl border text-sm font-bold transition-all",
                weeks === w
                  ? "border-primary/50 bg-primary/8 text-primary"
                  : "border-border bg-white text-foreground hover:border-primary/20"
              )}
            >
              {w}w
            </button>
          ))}
        </div>
      </section>

      {/* Days */}
      <section>
        <h2 className="text-base font-black mb-3">Days per week?</h2>
        <div className="flex gap-2">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setDaysPerWeek(d)}
              className={cn(
                "flex-1 py-3 rounded-xl border text-sm font-bold transition-all",
                daysPerWeek === d
                  ? "border-primary/50 bg-primary/8 text-primary"
                  : "border-border bg-white text-foreground hover:border-primary/20"
              )}
            >
              {d}×
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          That's <strong>{weeks * daysPerWeek} total sessions</strong> over {weeks} weeks.
        </p>
      </section>

      {/* Difficulty */}
      <section>
        <h2 className="text-base font-black mb-3">Difficulty</h2>
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={cn(
                "flex-1 py-3 rounded-xl border text-sm font-bold transition-all",
                difficulty === d.value
                  ? "border-primary/50 bg-primary/8 text-primary"
                  : "border-border bg-white text-foreground hover:border-primary/20"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <Button onClick={handleGenerate} disabled={loading} className="w-full h-14 text-base font-bold rounded-2xl">
        {loading ? (
          <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Building your {weeks}-week program…</>
        ) : (
          <><Sparkles className="h-5 w-5 mr-2" />Generate {weeks}-Week Program</>
        )}
      </Button>

      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-2"
        >
          <p className="text-sm text-muted-foreground">Designing {weeks * daysPerWeek} unique sessions…</p>
          <p className="text-xs text-muted-foreground">You can navigate away — a banner will notify you when it's ready.</p>
        </motion.div>
      )}
    </div>
  );
}
