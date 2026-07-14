"use client";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { scaleMacros, ratioFromGrams, ratioFromAmount, rebaseFromCurrent, type Macros } from "@/lib/serving-math";

export type EditableItem = {
  clientId: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingAmount: number;
  servingUnit: string;
  servingGrams: number | null;
  baseCalories: number;
  baseProteinG: number;
  baseCarbsG: number;
  baseFatG: number;
  baseServingAmount: number;
  baseServingGrams: number | null;
  savedFoodId: string | null;
};

type EstimateItemLike = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingAmount?: number;
  servingUnit?: string;
  servingGrams?: number;
};

type EstimateLike = {
  // Present only when this whole result already IS a saved food (picked from
  // the Saved tab) — makes the resulting item calibrated from the start.
  id?: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingAmount?: number;
  servingUnit?: string;
  servingGrams?: number;
  items?: EstimateItemLike[];
};

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `item-${Date.now()}-${clientIdCounter}`;
}

function makeItem(src: EstimateItemLike, savedFoodId: string | null = null): EditableItem {
  const servingAmount = src.servingAmount && src.servingAmount > 0 ? src.servingAmount : 1;
  const servingGrams = src.servingGrams && src.servingGrams > 0 ? src.servingGrams : null;
  return {
    clientId: nextClientId(),
    name: src.name,
    calories: Math.round(src.calories),
    proteinG: src.proteinG,
    carbsG: src.carbsG,
    fatG: src.fatG,
    servingAmount,
    servingUnit: src.servingUnit ?? "",
    servingGrams,
    baseCalories: Math.round(src.calories),
    baseProteinG: src.proteinG,
    baseCarbsG: src.carbsG,
    baseFatG: src.fatG,
    baseServingAmount: servingAmount,
    baseServingGrams: servingGrams,
    savedFoodId,
  };
}

/**
 * Builds the per-item editor list from a nutrition estimate — one row per
 * decomposed component, or a single synthesized row when the estimate has no
 * breakdown (plain search results still go through the same UI). A result
 * that's already a saved food (has an `id`) produces a calibrated item —
 * see the `savedFoodId` doc on ItemsEditor for what that changes.
 */
export function buildEditableItems(estimate: EstimateLike): EditableItem[] {
  if (estimate.items?.length) return estimate.items.map((it) => makeItem(it));
  return [
    makeItem(
      {
        name: estimate.name,
        calories: estimate.calories,
        proteinG: estimate.proteinG,
        carbsG: estimate.carbsG,
        fatG: estimate.fatG,
        servingAmount: estimate.servingAmount,
        servingUnit: estimate.servingUnit,
        servingGrams: estimate.servingGrams,
      },
      estimate.id ?? null,
    ),
  ];
}

export function itemsTotal(items: EditableItem[]): Macros {
  return items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      proteinG: Math.round((acc.proteinG + it.proteinG) * 10) / 10,
      carbsG: Math.round((acc.carbsG + it.carbsG) * 10) / 10,
      fatG: Math.round((acc.fatG + it.fatG) * 10) / 10,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

function currentRatio(item: EditableItem): number {
  if (item.servingGrams && item.baseServingGrams) return ratioFromGrams(item.baseServingGrams, item.servingGrams);
  return ratioFromAmount(item.baseServingAmount, item.servingAmount);
}

const MACRO_FIELDS = [
  { key: "calories", label: "cal", suffix: "", color: "bg-primary/10 text-primary" },
  { key: "proteinG", label: "protein", suffix: "g", color: "bg-accent/10 text-accent" },
  { key: "carbsG", label: "carbs", suffix: "g", color: "bg-carbs/10 text-carbs" },
  { key: "fatG", label: "fat", suffix: "g", color: "bg-fat/10 text-fat" },
] as const;

type MacroKey = (typeof MACRO_FIELDS)[number]["key"];
type BaseKey = "baseCalories" | "baseProteinG" | "baseCarbsG" | "baseFatG";
const BASE_KEY: Record<MacroKey, BaseKey> = {
  calories: "baseCalories",
  proteinG: "baseProteinG",
  carbsG: "baseCarbsG",
  fatG: "baseFatG",
};

type SavedFoodLite = {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingAmount: number;
  servingUnit: string;
  servingGrams: number | null;
};

function MacroPill({
  value,
  field,
  onCommit,
}: {
  value: number;
  field: (typeof MACRO_FIELDS)[number];
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const rounded = Math.round(value * 10) / 10;
  if (editing) {
    return (
      <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ring-2 ring-primary/50", field.color)}>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          defaultValue={rounded}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            onCommit(Math.max(0, parseFloat(e.target.value) || 0));
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-11 bg-transparent outline-none text-xs font-bold tabular-nums"
        />
        <span className="font-medium opacity-70">{field.label}</span>
      </span>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "px-2 py-0.5 rounded-full text-xs font-bold transition-shadow hover:ring-2 hover:ring-primary/30 active:ring-2 active:ring-primary/40",
        field.color,
      )}
    >
      {rounded}
      {field.suffix} <span className="font-medium opacity-70">{field.label}</span>
    </button>
  );
}

/** One editable row per meal component: macros, serving amount + unit + weight, a saved-food suggestion chip, and a per-item bookmark button. */
export function ItemsEditor({ items, onChange }: { items: EditableItem[]; onChange: (items: EditableItem[]) => void }) {
  const [matches, setMatches] = useState<Record<string, SavedFoodLite | null>>({});
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [justSaved, setJustSaved] = useState<Record<string, boolean>>({});

  // Debounced saved-food name lookup per item, surfaced as a dismissible
  // suggestion chip rather than applied automatically.
  const namesKey = items.map((i) => `${i.clientId}:${i.name}:${i.savedFoodId ?? ""}`).join("|");
  useEffect(() => {
    const timers = items.map((item) => {
      if (item.savedFoodId || dismissed[item.clientId] || item.name.trim().length < 2) return null;
      return setTimeout(async () => {
        try {
          const res = await fetch(`/api/saved-foods?q=${encodeURIComponent(item.name.trim())}&limit=5`);
          const data = await res.json();
          const foods: SavedFoodLite[] = data.foods ?? [];
          const lower = item.name.trim().toLowerCase();
          const match = foods.find((f) => f.name.toLowerCase().includes(lower) || lower.includes(f.name.toLowerCase())) ?? null;
          setMatches((m) => ({ ...m, [item.clientId]: match }));
        } catch {
          // best-effort suggestion — ignore failures
        }
      }, 400);
    });
    return () => timers.forEach((t) => t && clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  function updateItem(clientId: string, patch: Partial<EditableItem>) {
    onChange(items.map((it) => (it.clientId === clientId ? { ...it, ...patch } : it)));
  }

  function applySavedMatch(item: EditableItem, food: SavedFoodLite) {
    updateItem(item.clientId, {
      name: food.name,
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      servingAmount: food.servingAmount || 1,
      servingUnit: food.servingUnit || "",
      servingGrams: food.servingGrams ?? null,
      baseCalories: food.calories,
      baseProteinG: food.proteinG,
      baseCarbsG: food.carbsG,
      baseFatG: food.fatG,
      baseServingAmount: food.servingAmount || 1,
      baseServingGrams: food.servingGrams ?? null,
      savedFoodId: food.id,
    });
    setMatches((m) => ({ ...m, [item.clientId]: null }));
  }

  // Before an item is linked to a saved food (savedFoodId is null), macros,
  // amount, and weight are edited completely independently — the user is
  // still figuring out the right numbers in all three dimensions, and
  // auto-rescaling one field off an unconfirmed estimate would fight them.
  // Once an item IS linked (picked from Saved, matched via the suggestion
  // chip, or just bookmarked), its base values are treated as calibrated:
  // editing amount or weight then proportionally rescales macros from that
  // known reference, which is the "auto serving math" behavior.

  function editMacro(item: EditableItem, key: MacroKey, value: number) {
    if (!item.savedFoodId) {
      updateItem(item.clientId, { [key]: value } as Partial<EditableItem>);
      return;
    }
    const ratio = currentRatio(item);
    updateItem(item.clientId, { [key]: value, [BASE_KEY[key]]: rebaseFromCurrent(value, ratio) } as Partial<EditableItem>);
  }

  function editAmount(item: EditableItem, amount: number) {
    const safeAmount = Math.max(0, amount);
    if (!item.savedFoodId) {
      updateItem(item.clientId, { servingAmount: safeAmount });
      return;
    }
    const ratio = ratioFromAmount(item.baseServingAmount, safeAmount);
    const scaled = scaleMacros(
      { calories: item.baseCalories, proteinG: item.baseProteinG, carbsG: item.baseCarbsG, fatG: item.baseFatG },
      ratio,
    );
    updateItem(item.clientId, {
      servingAmount: safeAmount,
      servingGrams: item.baseServingGrams ? Math.round(item.baseServingGrams * ratio * 10) / 10 : item.servingGrams,
      ...scaled,
    });
  }

  function editGrams(item: EditableItem, grams: number) {
    const safeGrams = Math.max(0, grams);
    if (!item.savedFoodId) {
      updateItem(item.clientId, { servingGrams: safeGrams });
      return;
    }
    if (!item.baseServingGrams) {
      // Calibrated item with no known reference weight yet — record this as
      // the reference instead of rescaling against an unknown relationship.
      updateItem(item.clientId, { servingGrams: safeGrams, baseServingGrams: safeGrams });
      return;
    }
    const ratio = ratioFromGrams(item.baseServingGrams, safeGrams);
    const scaled = scaleMacros(
      { calories: item.baseCalories, proteinG: item.baseProteinG, carbsG: item.baseCarbsG, fatG: item.baseFatG },
      ratio,
    );
    updateItem(item.clientId, {
      servingGrams: safeGrams,
      servingAmount: Math.round(item.baseServingAmount * ratio * 100) / 100,
      ...scaled,
    });
  }

  async function saveItem(item: EditableItem) {
    setSaving((s) => ({ ...s, [item.clientId]: true }));
    try {
      const res = await fetch("/api/saved-foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          servingAmount: item.servingAmount,
          servingUnit: item.servingUnit,
          servingGrams: item.servingGrams,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Freeze the just-saved values as the calibrated reference, so any
        // further amount/weight edit (now or next time this is pulled up)
        // scales proportionally from exactly what was saved.
        updateItem(item.clientId, {
          savedFoodId: data.food?.id ?? item.savedFoodId,
          baseCalories: item.calories,
          baseProteinG: item.proteinG,
          baseCarbsG: item.carbsG,
          baseFatG: item.fatG,
          baseServingAmount: item.servingAmount,
          baseServingGrams: item.servingGrams,
        });
        setJustSaved((s) => ({ ...s, [item.clientId]: true }));
        setTimeout(() => setJustSaved((s) => ({ ...s, [item.clientId]: false })), 1500);
      }
    } finally {
      setSaving((s) => ({ ...s, [item.clientId]: false }));
    }
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const match = matches[item.clientId];
        return (
          <div key={item.clientId} className="rounded-xl border border-border bg-white p-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <input
                value={item.name}
                onChange={(e) => updateItem(item.clientId, { name: e.target.value })}
                className="flex-1 min-w-0 bg-transparent outline-none font-bold text-sm"
              />
              <button
                onClick={() => saveItem(item)}
                disabled={saving[item.clientId]}
                aria-label={item.savedFoodId ? "Update saved food" : "Save this item"}
                className={cn(
                  "shrink-0 h-7 w-7 rounded-full flex items-center justify-center transition-colors",
                  item.savedFoodId
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10",
                )}
              >
                {saving[item.clientId] ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : item.savedFoodId || justSaved[item.clientId] ? (
                  <BookmarkCheck className="h-3.5 w-3.5" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {match && !dismissed[item.clientId] && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  onClick={() => applySavedMatch(item, match)}
                  className="flex-1 text-left px-2 py-1 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground font-medium truncate"
                >
                  Use saved: <span className="font-bold text-foreground">{match.name}</span> — {match.calories} cal, tap to autofill
                </button>
                <button
                  onClick={() => setDismissed((d) => ({ ...d, [item.clientId]: true }))}
                  aria-label="Dismiss suggestion"
                  className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {MACRO_FIELDS.map((f) => (
                <MacroPill key={f.key} value={item[f.key]} field={f} onCommit={(v) => editMacro(item, f.key, v)} />
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground/70">
              {item.savedFoodId
                ? "Linked to a saved food — amount/weight edits rescale macros."
                : "Not saved yet — macros, amount, and weight edit independently."}
            </p>

            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1 text-muted-foreground">
                <span className="text-[10px] font-semibold uppercase tracking-wide">Amount</span>
                <input
                  key={`${item.clientId}-amount-${item.servingAmount}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  defaultValue={item.servingAmount}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) editAmount(item, v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="w-14 rounded-lg border border-border bg-input px-1.5 py-1 text-xs tabular-nums"
                />
              </label>
              <input
                placeholder="unit"
                value={item.servingUnit}
                onChange={(e) => updateItem(item.clientId, { servingUnit: e.target.value })}
                className="w-16 rounded-lg border border-border bg-input px-1.5 py-1 text-xs"
              />
              <label className="flex items-center gap-1 text-muted-foreground ml-auto">
                <span className="text-[10px] font-semibold uppercase tracking-wide">Weight</span>
                <input
                  key={`${item.clientId}-grams-${item.servingGrams ?? ""}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="g"
                  defaultValue={item.servingGrams ?? ""}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) editGrams(item, v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="w-16 rounded-lg border border-border bg-input px-1.5 py-1 text-xs tabular-nums"
                />
                <span>g</span>
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
