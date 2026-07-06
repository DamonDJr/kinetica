// Shared USDA FoodData Central lookup. Used both by the food-search route and
// the nutrition analysis pipeline's "tool call" stage, so the scaling logic
// lives in one place.

const USDA_KEY = process.env.USDA_API_KEY ?? "DEMO_KEY";
const USDA_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const NUTRIENT_IDS = {
  calories: [1008, 2047],
  protein: [1003],
  fat: [1004],
  carbs: [1005],
};

export type UsdaFood = {
  id: number;
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  servingDescription: string;
  household: string | null;
  // True when USDA gave no real serving size and we fell back to a 100 g
  // reference block. Such a figure is NOT a portion — it must be scaled to the
  // amount actually eaten before use.
  servingIsPer100g: boolean;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

// USDA foodNutrients values are per 100 g. `factor` rescales them to the food's
// actual serving size (servingSize / 100).
function extractNutrient(
  nutrients: { nutrientId: number; value: number }[],
  ids: number[],
  factor: number,
): number {
  const hit = nutrients.find((n) => ids.includes(n.nutrientId));
  return hit ? Math.round(hit.value * factor * 10) / 10 : 0;
}

function servingLabel(size: number, unit: string, household?: string): string {
  const base = `${Math.round(size * 10) / 10} ${unit}`;
  return household?.trim() ? `${household.trim()} (${base})` : base;
}

export async function searchUsdaFoods(query: string, pageSize = 8): Promise<UsdaFood[]> {
  if (!query?.trim()) return [];

  try {
    const url = new URL(USDA_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("api_key", USDA_KEY);
    url.searchParams.set("dataType", "Foundation,SR Legacy,Branded");
    url.searchParams.set("pageSize", String(pageSize));

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const demoHint = res.status === 429 && USDA_KEY === "DEMO_KEY"
        ? " — DEMO_KEY is rate-limited (30 req/hr shared per IP); set USDA_API_KEY in .env (free at https://fdc.nal.usda.gov/api-key-signup)"
        : "";
      console.warn(`[usda] search returned ${res.status} for "${query}"${demoHint}`);
      return [];
    }

    const data = await res.json();
    return (data.foods ?? []).map((food: {
      fdcId: number;
      description: string;
      brandName?: string;
      servingSize?: number;
      servingSizeUnit?: string;
      householdServingFullText?: string;
      foodNutrients: { nutrientId: number; value: number }[];
    }): UsdaFood => {
      // Foundation/SR Legacy foods often omit servingSize — fall back to a 100 g
      // reference serving.
      const servingIsPer100g = food.servingSize == null;
      const servingSize = food.servingSize ?? 100;
      const servingUnit = food.servingSizeUnit ?? "g";
      const factor = servingSize / 100;
      return {
        id: food.fdcId,
        name: food.description,
        brand: food.brandName ?? null,
        servingSize,
        servingUnit,
        servingDescription: servingLabel(servingSize, servingUnit, food.householdServingFullText),
        household: food.householdServingFullText?.trim() || null,
        servingIsPer100g,
        calories: extractNutrient(food.foodNutrients, NUTRIENT_IDS.calories, factor),
        proteinG: extractNutrient(food.foodNutrients, NUTRIENT_IDS.protein, factor),
        carbsG: extractNutrient(food.foodNutrients, NUTRIENT_IDS.carbs, factor),
        fatG: extractNutrient(food.foodNutrients, NUTRIENT_IDS.fat, factor),
      };
    });
  } catch (err) {
    console.warn(`[usda] search failed for "${query}":`, err instanceof Error ? err.message : err);
    return [];
  }
}
