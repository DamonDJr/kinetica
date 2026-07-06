"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, CheckCircle2, Clock, Dumbbell, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Exercise = {
  name: string;
  type?: "warmup" | "main" | "cooldown";
  sets?: number;
  reps?: string;
  rest?: string;
  duration?: string;
  notes?: string;
};

interface WorkoutDetailClientProps {
  planId: string;
  title: string;
  description: string;
  difficulty: string;
  durationMin: number;
  category: string;
  aiGenerated: boolean;
  exercises: Exercise[];
}

const typeLabel = { warmup: "Warm-up", main: "Main", cooldown: "Cool-down" };
const typeColor = { warmup: "text-amber-400", main: "text-primary", cooldown: "text-accent" };

export function WorkoutDetailClient({
  planId, title, description, difficulty, durationMin, category, aiGenerated, exercises,
}: WorkoutDetailClientProps) {
  const router = useRouter();
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState(false);

  const mainExercises = exercises.filter((e) => e.type === "main" || !e.type);
  const warmup = exercises.filter((e) => e.type === "warmup");
  const cooldown = exercises.filter((e) => e.type === "cooldown");

  function toggleComplete(idx: number) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  async function handleLogWorkout() {
    setLogging(true);
    await fetch("/api/workouts/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutPlanId: planId, title, durationMin }),
    });
    setLogging(false);
    setDone(true);
    setTimeout(() => router.push("/workouts"), 1500);
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4"
      >
        <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Workout logged!</h2>
        <p className="text-muted-foreground">Nice work. Every rep counts.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold">{title}</h1>
          {aiGenerated && <Badge variant="default" className="text-[10px]">AI</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {durationMin}m
          </span>
          <Badge variant="outline" className="text-[10px] capitalize">{category}</Badge>
          <span className="text-sm text-muted-foreground capitalize">{difficulty}</span>
        </div>
        {description && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>}
      </div>

      {warmup.length > 0 && (
        <ExerciseSection label="Warm-up" exercises={warmup} startIdx={0} completed={completed} onToggle={toggleComplete} color="text-amber-400" />
      )}
      <ExerciseSection label="Main Workout" exercises={mainExercises} startIdx={warmup.length} completed={completed} onToggle={toggleComplete} color="text-primary" />
      {cooldown.length > 0 && (
        <ExerciseSection label="Cool-down" exercises={cooldown} startIdx={warmup.length + mainExercises.length} completed={completed} onToggle={toggleComplete} color="text-accent" />
      )}

      <div className="pt-2 pb-2">
        <Button
          onClick={handleLogWorkout}
          disabled={logging}
          className="w-full h-12 text-base"
          variant={completed.size > 0 ? "default" : "outline"}
        >
          {logging ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Logging…</>
          ) : (
            <><Check className="h-4 w-4 mr-2" /> Log this workout</>
          )}
        </Button>
      </div>
    </div>
  );
}

function ExerciseSection({
  label, exercises, startIdx, completed, onToggle, color,
}: {
  label: string;
  exercises: Exercise[];
  startIdx: number;
  completed: Set<number>;
  onToggle: (i: number) => void;
  color: string;
}) {
  if (!exercises.length) return null;
  return (
    <div>
      <h2 className={cn("text-sm font-semibold uppercase tracking-wide mb-2", color)}>{label}</h2>
      <div className="space-y-2">
        {exercises.map((ex, i) => {
          const idx = startIdx + i;
          const isDone = completed.has(idx);
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <button
                onClick={() => onToggle(idx)}
                className={cn(
                  "w-full text-left px-4 py-3.5 rounded-2xl border transition-all",
                  isDone
                    ? "bg-primary/10 border-primary/30 opacity-70"
                    : "bg-card border-border hover:border-primary/30"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className={cn("font-semibold text-sm", isDone && "line-through text-muted-foreground")}>
                      {ex.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {ex.sets && ex.reps && (
                        <span className="text-xs text-muted-foreground">{ex.sets} × {ex.reps}</span>
                      )}
                      {ex.duration && (
                        <span className="text-xs text-muted-foreground">{ex.duration}</span>
                      )}
                      {ex.rest && (
                        <span className="text-xs text-muted-foreground">Rest: {ex.rest}</span>
                      )}
                    </div>
                    {ex.notes && (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed italic">{ex.notes}</p>
                    )}
                  </div>
                  <div className={cn(
                    "h-6 w-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-all mt-0.5",
                    isDone ? "bg-primary border-primary" : "border-border"
                  )}>
                    {isDone && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
