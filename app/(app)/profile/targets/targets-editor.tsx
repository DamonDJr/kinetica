"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = {
  calorieTargetMin: number;
  calorieTargetMax: number;
  proteinTargetG: number;
  carbTargetG: number | null;
  fatTargetG: number | null;
  custom: boolean;
};

export function TargetsEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [min, setMin] = useState(String(initial.calorieTargetMin));
  const [max, setMax] = useState(String(initial.calorieTargetMax));
  const [protein, setProtein] = useState(String(initial.proteinTargetG));
  const [carbs, setCarbs] = useState(initial.carbTargetG != null ? String(initial.carbTargetG) : "");
  const [fat, setFat] = useState(initial.fatTargetG != null ? String(initial.fatTargetG) : "");
  const [showMacros, setShowMacros] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ reasoning: string; confidence: string } | null>(null);

  const minN = Number(min);
  const maxN = Number(max);
  const proteinN = Number(protein);
  const center = Number.isFinite(minN) && Number.isFinite(maxN) ? Math.round((minN + maxN) / 2) : 0;
  const rangeValid = Number.isFinite(minN) && Number.isFinite(maxN) && minN > 0 && maxN > minN;
  const formValid = rangeValid && Number.isFinite(proteinN) && proteinN > 0;

  async function handleSave() {
    if (!formValid) {
      setError("Enter a valid calorie range (max above min) and protein target.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: {
            calorieTargetMin: minN,
            calorieTargetMax: maxN,
            proteinTargetG: proteinN,
            carbTargetG: carbs.trim() ? Number(carbs) : undefined,
            fatTargetG: fat.trim() ? Number(fat) : undefined,
          },
        }),
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

  async function runAi() {
    setAiBusy(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await fetch("/api/ai/targets", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "AI failed");
        return;
      }
      // Fill the form with the AI's suggestion so the user can tweak then save.
      setMin(String(data.targets.calorieTargetMin));
      setMax(String(data.targets.calorieTargetMax));
      setProtein(String(data.targets.proteinTargetG));
      if (data.targets.carbTargetG != null) setCarbs(String(data.targets.carbTargetG));
      if (data.targets.fatTargetG != null) setFat(String(data.targets.fatTargetG));
      setAiResult({ reasoning: data.reasoning, confidence: data.confidence });
      router.refresh();
    } catch {
      setAiError("Network error");
    } finally {
      setAiBusy(false);
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
          <h1 className="text-2xl font-black tracking-tight">Nutrition Targets</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4 flex gap-3">
        <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Set your own daily calorie <span className="font-semibold text-foreground">range</span> and protein
          target. Any day that lands inside the range counts as on-target — your weekly and monthly trends
          only flag days that fall <span className="font-semibold text-foreground">above</span> or below it.
        </p>
      </div>

      {/* Calorie range */}
      <div className="space-y-2">
        <Label className="text-xs">Daily calorie range (kcal)</Label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              type="number"
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="Min"
              aria-label="Minimum calories"
            />
          </div>
          <span className="text-muted-foreground text-sm">to</span>
          <div className="flex-1">
            <Input
              type="number"
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="Max"
              aria-label="Maximum calories"
            />
          </div>
        </div>
        {rangeValid ? (
          <p className="text-[11px] text-muted-foreground">
            Center ~<span className="font-semibold text-foreground tabular-nums">{center.toLocaleString()}</span> kcal
            {" · "}±<span className="tabular-nums">{Math.round((maxN - minN) / 2).toLocaleString()}</span> kcal band
          </p>
        ) : (
          <p className="text-[11px] text-rose-500">Max must be higher than min.</p>
        )}
      </div>

      {/* Protein */}
      <div className="space-y-2">
        <Label className="text-xs">Protein target (g/day)</Label>
        <Input
          type="number"
          inputMode="numeric"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder="e.g. 150"
          aria-label="Protein target"
        />
        <p className="text-[11px] text-muted-foreground">Protein is a floor — aim for at least this each day.</p>
      </div>

      {/* Optional macros */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowMacros((s) => !s)}
          className="w-full flex items-center justify-between p-3 text-left"
        >
          <span className="text-sm font-semibold">Carbs &amp; fat (optional)</span>
          {showMacros ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showMacros && (
          <div className="border-t border-border p-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Carbs (g)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="e.g. 250"
                aria-label="Carb target"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fat (g)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                placeholder="e.g. 65"
                aria-label="Fat target"
              />
            </div>
          </div>
        )}
      </div>

      {/* AI suggestion */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Not sure where to start?</p>
          <Button onClick={runAi} disabled={aiBusy} size="sm" variant="outline" className="h-8 gap-1.5">
            {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiBusy ? "Calculating…" : "Suggest with AI"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Fills the fields above from your goals, body trend, and recent eating. Review, then save.
        </p>
        {aiError && <p className="text-xs text-rose-500">{aiError}</p>}
        {aiResult && (
          <div className="rounded-xl border border-primary/20 bg-card p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">{aiResult.confidence} confidence</span>
            <p className="text-xs text-muted-foreground leading-relaxed">{aiResult.reasoning}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border md:static md:p-0 md:bg-transparent md:border-0">
        <div className="max-w-2xl mx-auto">
          <Button onClick={handleSave} disabled={saving || saved || !formValid} className="w-full h-12 font-bold">
            {saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved
              </>
            ) : saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save targets"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
