"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type Meal = {
  id: string;
  name: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export function MealList({ meals }: { meals: Meal[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mealOrder = ["breakfast", "lunch", "dinner", "snack", "other"];
  const byType = meals.reduce((acc, m) => {
    if (!acc[m.mealType]) acc[m.mealType] = [];
    acc[m.mealType].push(m);
    return acc;
  }, {} as Record<string, Meal[]>);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/nutrition?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {mealOrder.map((type) => {
        const typeMeals = byType[type];
        if (!typeMeals?.length) return null;
        const typeTotal = typeMeals.reduce((s, m) => s + m.calories, 0);
        return (
          <div key={type}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold capitalize">{type}</h3>
              <span className="text-xs text-muted-foreground">{typeTotal} kcal</span>
            </div>
            <div className="space-y-1.5">
              {typeMeals.map((meal) => (
                <div
                  key={meal.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-card border border-border group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{meal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      P: {Math.round(meal.proteinG)}g · C: {Math.round(meal.carbsG)}g · F: {Math.round(meal.fatG)}g
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-muted-foreground">{meal.calories}</span>
                    <button
                      onClick={() => handleDelete(meal.id)}
                      disabled={deletingId === meal.id}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/8 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
                      aria-label="Delete meal"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
