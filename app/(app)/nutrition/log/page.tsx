"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"];

function todayParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LogMealPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayParam();
  const initialDate = (() => {
    const d = searchParams.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;
  })();
  const [date, setDate] = useState(initialDate);
  const [form, setForm] = useState({
    mealType: "lunch",
    name: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.calories) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType: form.mealType,
          name: form.name.trim(),
          calories: parseInt(form.calories),
          proteinG: parseFloat(form.proteinG || "0"),
          carbsG: parseFloat(form.carbsG || "0"),
          fatG: parseFloat(form.fatG || "0"),
          notes: form.notes || null,
          date,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      router.push(date === today ? "/nutrition" : `/nutrition?date=${date}`);
    } catch {
      setError("Failed to log meal. Try again.");
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Log Meal</h1>
        <p className="text-muted-foreground text-sm mt-1">Track what you eat to hit your nutrition targets</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
          {date !== today && (
            <p className="text-xs text-muted-foreground">Logging to a past day</p>
          )}
        </div>

        <div>
          <Label className="mb-2 block">Meal type</Label>
          <div className="flex gap-2 flex-wrap">
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, mealType: t })}
                className={cn(
                  "px-3 py-1.5 rounded-xl border text-sm capitalize transition-all",
                  form.mealType === t
                    ? "bg-primary/20 border-primary/50 text-primary font-medium"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Food name</Label>
          <Input
            id="name"
            placeholder="e.g. Chicken rice bowl"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="calories">Calories</Label>
            <Input
              id="calories"
              type="number"
              placeholder="450"
              value={form.calories}
              onChange={(e) => setForm({ ...form, calories: e.target.value })}
              required
              min="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="protein">Protein (g)</Label>
            <Input
              id="protein"
              type="number"
              placeholder="35"
              value={form.proteinG}
              onChange={(e) => setForm({ ...form, proteinG: e.target.value })}
              step="0.1"
              min="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carbs">Carbs (g)</Label>
            <Input
              id="carbs"
              type="number"
              placeholder="45"
              value={form.carbsG}
              onChange={(e) => setForm({ ...form, carbsG: e.target.value })}
              step="0.1"
              min="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fat">Fat (g)</Label>
            <Input
              id="fat"
              type="number"
              placeholder="12"
              value={form.fatG}
              onChange={(e) => setForm({ ...form, fatG: e.target.value })}
              step="0.1"
              min="0"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Input
            id="notes"
            placeholder="Home-made, extra veggies…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

        <Button type="submit" className="w-full h-12" disabled={loading}>
          {loading ? "Saving…" : "Log meal"}
        </Button>
      </form>
    </motion.div>
  );
}
