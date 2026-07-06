"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, X, Loader2, Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, type FitnessGoal } from "@/lib/utils";

const PRESET_GOALS = [
  "Lose Weight",
  "Gain Muscle",
  "Improve Flexibility",
  "Better Endurance",
  "Learn Skills (Handstand etc.)",
  "Manage Chronic Condition",
  "General Health",
  "Family Fitness",
];

const DETAIL_HINTS: Record<string, string> = {
  "Learn Skills (Handstand etc.)": "Which skills? e.g. handstand press, pistol squat, muscle-up, splits",
  "Manage Chronic Condition": "Which condition(s)? Any flares or constraints to know about?",
  "Lose Weight": "Pace, sustainability concerns, anything you've tried before?",
  "Gain Muscle": "Target areas, training history, any plateaus?",
  "Improve Flexibility": "Which areas — hips, hamstrings, shoulders, full splits?",
  "Better Endurance": "What activity — running, cycling, hiking, sports?",
  "General Health": "What does 'healthy' look like for you right now?",
  "Family Fitness": "Who's involved? Any shared goals or constraints?",
};

export function GoalsEditor({ initialGoals }: { initialGoals: FitnessGoal[] }) {
  const router = useRouter();
  const [goals, setGoals] = useState<FitnessGoal[]>(initialGoals);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(
    initialGoals.find((g) => !g.detail)?.label ?? null
  );
  const [customLabel, setCustomLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelSet = new Set(goals.map((g) => g.label));

  function togglePreset(label: string) {
    if (labelSet.has(label)) {
      setGoals((gs) => gs.filter((g) => g.label !== label));
      if (expandedLabel === label) setExpandedLabel(null);
    } else {
      setGoals((gs) => [...gs, { label }]);
      setExpandedLabel(label);
    }
  }

  function updateDetail(label: string, detail: string) {
    setGoals((gs) => gs.map((g) => (g.label === label ? { ...g, detail } : g)));
  }

  function removeGoal(label: string) {
    setGoals((gs) => gs.filter((g) => g.label !== label));
    if (expandedLabel === label) setExpandedLabel(null);
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label || labelSet.has(label)) return;
    setGoals((gs) => [...gs, { label }]);
    setExpandedLabel(label);
    setCustomLabel("");
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = goals.map((g) => {
        const detail = g.detail?.trim();
        return detail ? { label: g.label, detail } : { label: g.label };
      });
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fitnessGoals: payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push("/profile"), 800);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/profile">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Profile</p>
          <h1 className="text-2xl font-black tracking-tight">Fitness Goals</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4 flex gap-3">
        <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tap a goal to add it. Then expand it to add detail — e.g. for "Learn Skills" you might add
          "focus on handstand press and pistol squats". The AI uses these details when building your plans.
        </p>
      </div>

      {/* Preset chips */}
      <div>
        <Label className="mb-2 block text-xs">Choose your goals</Label>
        <div className="flex flex-wrap gap-2">
          {PRESET_GOALS.map((label) => {
            const selected = labelSet.has(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => togglePreset(label)}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm border transition-colors text-left",
                  selected
                    ? "bg-primary/15 border-primary/50 text-primary font-medium"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                {selected && <Check className="inline h-3 w-3 mr-1" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom goal */}
      <div>
        <Label className="mb-1.5 block text-xs">Add a custom goal</Label>
        <div className="flex gap-2">
          <Input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="e.g. Run a 5K under 25 min"
          />
          <Button onClick={addCustom} disabled={!customLabel.trim()} className="shrink-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active goals list with details */}
      {goals.length > 0 && (
        <div className="space-y-2">
          <Label className="block text-xs">Your goals — tap to elaborate</Label>
          <AnimatePresence initial={false}>
            {goals.map((g) => {
              const isExpanded = expandedLabel === g.label;
              const isAmbiguous = !g.detail && DETAIL_HINTS[g.label];
              return (
                <motion.div
                  key={g.label}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    "rounded-2xl border bg-card overflow-hidden",
                    isAmbiguous ? "border-amber-300/50" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => setExpandedLabel(isExpanded ? null : g.label)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      <span className="font-semibold text-sm truncate">{g.label}</span>
                      {isAmbiguous && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-100 rounded-full px-2 py-0.5 shrink-0">
                          add detail
                        </span>
                      )}
                      {g.detail && !isExpanded && (
                        <span className="text-xs text-muted-foreground truncate min-w-0">— {g.detail}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedLabel(isExpanded ? null : g.label)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGoal(g.label)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      aria-label="Remove goal"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border"
                      >
                        <div className="p-3 space-y-1.5">
                          <Label className="text-xs">Details (optional but recommended)</Label>
                          <textarea
                            value={g.detail ?? ""}
                            onChange={(e) => updateDetail(g.label, e.target.value)}
                            placeholder={DETAIL_HINTS[g.label] ?? "What does this goal mean specifically for you?"}
                            rows={3}
                            className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            The AI will use this verbatim when generating your plans.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border md:static md:p-0 md:bg-transparent md:border-0">
        <div className="max-w-2xl mx-auto">
          <Button onClick={handleSave} disabled={saving || saved} className="w-full h-12 font-bold">
            {saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved
              </>
            ) : saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save goals"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
