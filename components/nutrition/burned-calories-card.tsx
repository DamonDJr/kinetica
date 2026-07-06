"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Activity, Check, Loader2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Shows net calories (food intake − total burn) and lets the user set the
// day's active burn (e.g. from a watch). Watches only report active calories,
// so we add the user's estimated BMR (resting burn) to get total burn — the
// figure that actually determines a calorie deficit or surplus.
export function BurnedCaloriesCard({
  intakeCals,
  activeKcal,
  bmr,
  date,
}: {
  intakeCals: number;
  activeKcal: number;
  bmr: number | null;
  date?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(activeKcal ? String(activeKcal) : "");
  const [saving, setSaving] = useState(false);

  const totalBurned = activeKcal + (bmr ?? 0);
  const net = intakeCals - totalBurned;

  async function handleSave() {
    setSaving(true);
    const kcal = parseInt(value, 10);
    await fetch("/api/nutrition/burned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kcal: Number.isFinite(kcal) && kcal > 0 ? kcal : 0, ...(date && { date }) }),
    });
    setEditing(false);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Net calories</span>
        </div>
        <span className="text-lg font-black tabular-nums">
          {net > 0 ? "+" : ""}{net.toLocaleString()}
          <span className="text-xs font-medium text-muted-foreground ml-1">kcal</span>
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{intakeCals.toLocaleString()} eaten</span>
        <span className="text-muted-foreground/60">−</span>
        <span className="tabular-nums">{activeKcal.toLocaleString()} active</span>
        <span className="text-muted-foreground/60">−</span>
        <span className="tabular-nums">{(bmr ?? 0).toLocaleString()} resting</span>
      </div>
      {bmr == null && (
        <p className="text-[11px] text-muted-foreground/70 -mt-1">
          Add your age, height and weight in your profile to include resting burn (BMR).
        </p>
      )}

      {editing ? (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Flame className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Active calories burned (from watch)"
              className="h-9 pl-9"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="h-9 shrink-0">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold py-2 hover:bg-primary/10 transition-colors"
        >
          <Pencil className="h-3 w-3" />
          {activeKcal ? "Edit active calories" : "Log active calories"}
        </button>
      )}
    </div>
  );
}
