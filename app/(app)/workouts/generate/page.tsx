"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Clock, Dumbbell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "strength", label: "Strength", emoji: "💪" },
  { value: "cardio", label: "Cardio", emoji: "🏃" },
  { value: "mobility", label: "Mobility", emoji: "🧘" },
  { value: "recovery", label: "Recovery", emoji: "😌" },
  { value: "hiit", label: "HIIT", emoji: "⚡" },
];

const DIFFICULTIES = [
  { value: "beginner", label: "Beginner", desc: "Low intensity, form-focused" },
  { value: "intermediate", label: "Intermediate", desc: "Moderate challenge" },
  { value: "advanced", label: "Advanced", desc: "High intensity" },
];

const DURATIONS = [15, 20, 30, 45, 60];

export default function GenerateWorkoutPage() {
  const router = useRouter();
  const [category, setCategory] = useState("strength");
  const [difficulty, setDifficulty] = useState("beginner");
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, difficulty, duration }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      router.push(`/workouts/${data.plan.id}`);
    } catch {
      setError("AI generation failed. Is LM Studio running?");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Generate Workout</h1>
        <p className="text-muted-foreground text-sm mt-1">AI will adapt the plan to your profile and conditions</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Category</h2>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all",
                category === c.value
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              <span className="text-2xl">{c.emoji}</span>
              <span className="text-xs font-medium">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Duration</h2>
        <div className="flex gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={cn(
                "flex-1 h-10 rounded-xl border text-sm font-medium transition-all",
                duration === d
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              {d}m
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Difficulty</h2>
        <div className="space-y-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={cn(
                "w-full text-left px-4 py-3 rounded-xl border transition-all",
                difficulty === d.value
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-card border-border text-foreground hover:border-primary/30"
              )}
            >
              <p className="text-sm font-medium">{d.label}</p>
              <p className="text-xs text-muted-foreground">{d.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

      <Button onClick={handleGenerate} disabled={loading} className="w-full h-12 text-base">
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating your plan…
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5 mr-2" /> Generate with AI
          </>
        )}
      </Button>

      {loading && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-muted-foreground"
        >
          The AI is crafting a plan tailored to your health profile…
        </motion.p>
      )}
    </div>
  );
}
