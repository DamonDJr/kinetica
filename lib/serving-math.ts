// Shared scaling math for meal-log items: given a reference "per one serving"
// macro/serving size, compute the macros for however much was actually eaten.
// Used by the smart-log item editor (grams/amount inputs) and reused
// server-side wherever a client-sent item needs its totals trusted-verified.

export type Macros = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** Scales a base macro set by `ratio`, rounding the way the rest of the app does (calories to whole numbers, macros to 0.1g). */
export function scaleMacros(base: Macros, ratio: number): Macros {
  return {
    calories: Math.round(base.calories * ratio),
    proteinG: Math.round(base.proteinG * ratio * 10) / 10,
    carbsG: Math.round(base.carbsG * ratio * 10) / 10,
    fatG: Math.round(base.fatG * ratio * 10) / 10,
  };
}

/** Ratio of an entered gram weight to the reference serving's gram weight. */
export function ratioFromGrams(baseGrams: number, enteredGrams: number): number {
  if (!baseGrams || baseGrams <= 0) return 1;
  return enteredGrams / baseGrams;
}

/** Ratio of an entered serving count to the reference serving count. */
export function ratioFromAmount(baseAmount: number, enteredAmount: number): number {
  if (!baseAmount || baseAmount <= 0) return 1;
  return enteredAmount / baseAmount;
}

/**
 * Re-derives a "per one serving" base value from a directly-edited current
 * value, so future serving-size edits keep scaling from the correction
 * instead of snapping back to the original estimate.
 */
export function rebaseFromCurrent(currentValue: number, ratio: number): number {
  const safeRatio = Math.abs(ratio) > 0.0001 ? ratio : 1;
  return currentValue / safeRatio;
}
