"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  Plus,
  Check,
  Globe,
  Clock,
  Flame,
  Dumbbell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type MealIdea = {
  name: string;
  description: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepTime: string;
  tip: string;
};

type IdeasContext = {
  remainingCal: number;
  remainingProtein: number;
  inferredMealType: MealIdea["mealType"];
  workoutContext: string;
  mealsLoggedCount: number;
  searchUsed: boolean;
};

const MEAL_TYPES: Array<MealIdea["mealType"] | "auto"> = ["auto", "breakfast", "lunch", "snack", "dinner"];

const QUICK_PROMPTS = [
  "I just finished a workout and need a protein boost",
  "Craving something sweet but healthy",
  "Quick snack, nothing to prep",
  "Light dinner, low carb",
];

function todayParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MealIdeasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayParam();
  const logDate = (() => {
    const d = searchParams.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;
  })();
  const [freeForm, setFreeForm] = useState("");
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<MealIdea[]>([]);
  const [context, setContext] = useState<IdeasContext | null>(null);
  const [loggingIdx, setLoggingIdx] = useState<number | null>(null);
  const [loggedIdx, setLoggedIdx] = useState<Set<number>>(new Set());

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setIdeas([]);
    setContext(null);
    setLoggedIdx(new Set());
    try {
      const res = await fetch("/api/ai/meal-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeForm: freeForm.trim() || undefined,
          mealType: mealType === "auto" ? undefined : mealType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate ideas");
        return;
      }
      setIdeas(data.ideas ?? []);
      setContext(data.context ?? null);
    } catch {
      setError("Network error. Is LM Studio running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleLog(idea: MealIdea, idx: number) {
    setLoggingIdx(idx);
    try {
      const res = await fetch("/api/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType: idea.mealType,
          name: idea.name,
          calories: idea.calories,
          proteinG: idea.proteinG,
          carbsG: idea.carbsG,
          fatG: idea.fatG,
          date: logDate,
        }),
      });
      if (res.ok) {
        setLoggedIdx((prev) => new Set(prev).add(idx));
      }
    } finally {
      setLoggingIdx(null);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <Link href="/nutrition">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Nutrition</p>
          <h1 className="text-2xl font-black tracking-tight">Meal Ideas</h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-3">
        Personalized suggestions based on your remaining macros, recent workouts, and goals.
      </p>

      {/* Meal type chips */}
      <div>
        <Label className="mb-2 block text-xs">Meal type</Label>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setMealType(type)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors",
                mealType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {type === "auto" ? "auto (by time)" : type}
            </button>
          ))}
        </div>
      </div>

      {/* Freeform context */}
      <div>
        <Label className="mb-1.5 block">Anything specific?</Label>
        <textarea
          value={freeForm}
          onChange={(e) => setFreeForm(e.target.value)}
          placeholder="e.g. I just finished a workout and need a protein boost"
          rows={3}
          className="w-full rounded-2xl border border-border bg-input px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => setFreeForm(p)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={handleGenerate} disabled={loading} className="w-full h-12 font-bold">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Cooking up ideas…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Get Meal Ideas
          </>
        )}
      </Button>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Context summary */}
      {context && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
        >
          <span className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5" />
            {context.remainingCal} kcal · {context.remainingProtein}g P left
          </span>
          {context.workoutContext && !context.workoutContext.startsWith("No recent") && (
            <span className="flex items-center gap-1.5">
              <Dumbbell className="h-3.5 w-3.5" />
              recent workout
            </span>
          )}
          {context.searchUsed && (
            <span className="flex items-center gap-1.5 text-accent">
              <Globe className="h-3.5 w-3.5" />
              web inspiration
            </span>
          )}
        </motion.div>
      )}

      {/* Ideas */}
      <AnimatePresence>
        {ideas.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {ideas.map((idea, i) => {
              const isLogged = loggedIdx.has(i);
              const isLogging = loggingIdx === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "rounded-2xl border bg-card p-4 space-y-3 transition-colors",
                    isLogged ? "border-primary/40 bg-primary/5" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base leading-snug">{idea.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="capitalize font-semibold">{idea.mealType}</span>
                        <span className="opacity-50">·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {idea.prepTime}
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black leading-none">{idea.calories}</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">kcal</p>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed">{idea.description}</p>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-bold">
                      {Math.round(idea.proteinG)}g <span className="font-medium opacity-70">protein</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-carbs/10 text-carbs text-xs font-bold">
                      {Math.round(idea.carbsG)}g <span className="font-medium opacity-70">carbs</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-fat/10 text-fat text-xs font-bold">
                      {Math.round(idea.fatG)}g <span className="font-medium opacity-70">fat</span>
                    </span>
                  </div>

                  {idea.tip && (
                    <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-border pl-3">
                      {idea.tip}
                    </p>
                  )}

                  <Button
                    onClick={() => handleLog(idea, i)}
                    disabled={isLogging || isLogged}
                    variant={isLogged ? "secondary" : "default"}
                    className="w-full h-10"
                  >
                    {isLogged ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Logged
                      </>
                    ) : isLogging ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Log this meal
                      </>
                    )}
                  </Button>
                </motion.div>
              );
            })}

            <Button variant="ghost" onClick={() => router.push("/nutrition")} className="w-full">
              Back to nutrition
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
