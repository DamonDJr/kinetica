import { ai, AI_MODEL, stripReasoning } from "@/lib/ai";
import { webSearch } from "@/lib/search";
import { searchUsdaFoods, type UsdaFood } from "@/lib/usda";
import { db } from "@/lib/db";

// ── Public types ──────────────────────────────────────────────────────────────

export type NutritionItem = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingAmount: number;
  servingUnit: string;
  servingGrams?: number;
};

export type NutritionEstimate = {
  name: string;
  servingDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: "high" | "medium" | "low";
  notes: string;
  items?: NutritionItem[];
};

// The multi-stage pipeline streams these to the client so the UI can show what
// the AI is currently doing. `result`/`error` are terminal.
export type PipelineStage =
  | "identifying"
  | "planning"
  | "tools"
  | "memory"
  | "verifying";

export type StageEvent =
  | { type: "stage"; stage: PipelineStage; label: string }
  | { type: "result"; estimate: NutritionEstimate; searchUsed: boolean }
  | { type: "error"; error: string };

export type PipelineInput = {
  description?: string | null;
  image?: { base64: string; mimeType: string };
  profileId: string;
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  identifying: "Identifying the food…",
  planning: "Planning the breakdown…",
  tools: "Looking up nutrition data…",
  memory: "Checking your saved foods…",
  verifying: "Verifying the numbers…",
};

// ── Prompts ───────────────────────────────────────────────────────────────────

const VERIFY_SYSTEM = `You are a precise nutrition calculator. You are given a meal broken into components, plus reference data looked up from a nutrition database and from the user's own previously-saved foods. Produce a final, verified nutrition estimate.

BRANDED / PACKAGED PRODUCTS — read first:
If "PRODUCT CANDIDATES" are provided, the meal is a single packaged product. Do NOT decompose it into ingredients and re-estimate — reconstructing instant noodles, chips, candy, or frozen meals from parts inflates them. Instead:
1. Pick the candidate that best matches the named product (right brand/variety). Plain "Maruchan chicken ramen" is the plain chicken ramen, NOT a "with vegetables", "instant lunch cup", or "reduced fat" variant.
2. PORTION IS CRITICAL — it is the #1 source of error. Each candidate states either a real serving (a household measure like "1 package", "0.5 block", "1 cup", with a gram weight) or is marked "PER 100 g — NOT a serving".
   - A "PER 100 g" figure is a lab reference, NOT a portion. Never output it as one serving. Scale it to the real amount eaten. A single instant-ramen package is ~85 g (NOT 100 g) — so a "per 100 g" ramen value must be multiplied by ~0.85.
   - Assume the user ate ONE standard package/portion of the product unless they said otherwise (e.g. "half a pack", "2 packs"). If a candidate's serving is half a block / half a package, double it for a whole package.
3. Return ONE item equal to the chosen, portion-scaled label. Trust it even if it seems low.

Real-world portions for common packaged items (use when scaling a per-100 g or per-block figure):
- Instant ramen, one single pack (block + seasoning): ~85 g total.
- Slice of sandwich bread: ~28 g. Bagel: ~95 g. Tortilla (burrito size): ~70 g.

METHOD for composed / homemade meals (no product candidates):
1. Value each component using the EXACT quantity stated. Do not assume a bigger or smaller portion than stated.
   - When the user gives a COUNT of a discrete item (e.g. "3 slices of pepperoni", "2 eggs"), value exactly that many pieces — multiply the per-piece value by the count. NEVER substitute a standard package/ounce serving for an explicit count. 3 slices of pepperoni is ~15 cal, NOT a 1 oz serving.
2. Account for cooking: raw ground meat loses ~25% of its weight when cooked (a raw "1/4 lb" / 4 oz patty becomes ~3 oz cooked).
3. Output every component with its own macros, then totals that are the exact sum of the components.
4. For each component, also state the household serving you valued it at (servingAmount + servingUnit, e.g. 3 + "slice") and your best-estimate total gram weight for that amount (servingGrams) — use the same per-piece reference weights implied above (e.g. a pizza-style pepperoni slice ≈1g, a cheese slice ≈20g, a bagel ≈95g, a cooked oz of meat ≈28g) so the user can later re-scale the item by weight.

DATA PRECEDENCE (most to least trusted):
1. The user's OWN saved foods, when a component matches one — these are values the user has confirmed, use them as-is (scaled to the stated amount).
2. PRODUCT CANDIDATES, for a packaged product — pick the best match and scale to the real portion (see above).
3. A "Web nutrition label" provided for a BRANDED component — this is the named product's real published label. Trust it for that component (scaled to the stated amount), ranking it alongside product candidates above the generic reference values.
4. USDA database lookups for components — come from real labels; trust them over the generic reference values for that specific item, scaling a "per 100 g" figure to the actual amount eaten.
5. The reference values below — for generic, homemade, or unbranded components.
6. Plain web search snippets — useful for a branded product's published label, but unreliable for small COUNTED generic items; never let a web "per slice"/"per serving" figure inflate a counted estimate (e.g. "3 slices pepperoni") above the reference.

Common reference values — scale these to the stated amount:
- Cooked ground beef 80/20: ~75 cal, 7g protein, 0g carb, 5g fat per cooked oz. Fattier 73/27–75/25 blends: ~80 cal, 7g protein, 0g carb, 6g fat per cooked oz.
- Cheese slice (American / colby jack / cheddar): ~80 cal, 5g protein, 1g carb, 6.5g fat per slice.
- Burger / sandwich / potato bun: ~140 cal, 5g protein, 26g carb, 2.5g fat each.
- Bread slice: ~80 cal, 3g protein, 14g carb, 1g fat.
- Cooked chicken breast: ~47 cal, 9g protein, 0g carb, 1g fat per oz.
- Pepperoni: DEFAULT to thin pizza-style slices (~1g each): ~5 cal, 0.2g protein, 0g carb, 0.4g fat PER SLICE. Only use the larger deli slice (~5g: ~23 cal, 1g protein, 0g carb, 2g fat) if the user explicitly says deli/sandwich/thick. A full 1 oz (28g) serving is ~130 cal — only use this if the user gave no count at all.
- Cured/deli meat (salami, ham, turkey) slice: ~1 oz/28g per slice typical, scale per slice stated.
- Bacon, cooked strip: ~45 cal, 3g protein, 0g carb, 3.5g fat per slice.
- Cooked rice or pasta: ~200 cal, 4g protein, 43g carb, 1g fat per cup.
- Large egg: ~72 cal, 6g protein, 0.5g carb, 5g fat.
- Oil / butter: ~110 cal, 0g protein, 0g carb, 12g fat per tbsp.
- Ketchup / BBQ / similar condiment: ~15 cal, ~4g carb per tbsp.

VERIFICATION before you answer:
- Protein is ~7g per cooked oz of meat — a single-patty cheeseburger has roughly 25–32g protein, NOT 45g. Do not inflate.
- Carbs come almost entirely from breads, grains, sugars, and starches — meat and cheese add almost none.
- Calories should roughly equal protein*4 + carbs*4 + fat*9 (±10%). If they don't, recheck the components.
- Totals MUST be the exact sum of the listed items.

Always return valid JSON.`;

const PLAN_SYSTEM = `You break a described meal into its individual food components so each can be looked up in a nutrition database.

CRITICAL: If the meal is a single packaged or branded product — a named brand like "Maruchan ramen", "Clif bar", "Chobani yogurt", or a standard packaged item eaten as-is — DO NOT split it, even when the product's full name is long and reads like a dish description. Frozen/packaged entrees are named after their contents (e.g. "Healthy Choice Cafe Steamers Grilled Chicken Marinara with Parmesan", "Lean Cuisine Alfredo Pasta with Chicken & Broccoli", "Hot Pockets Pepperoni Pizza"): everything after the brand/product line is the FLAVOR or VARIETY of that ONE product, not a list of separate ingredients to look up and sum. If the description names a specific packaged product (brand, or a known product line like "Cafe Steamers", "Lean Cuisine", "Hot Pockets", "Stouffer's", "Marie Callender's", "Banquet"), return it as ONE component using its full product name (including the brand), with a lookupQuery that keeps the brand and full product name (e.g. query "Healthy Choice Cafe Steamers Grilled Chicken Marinara with Parmesan"). Packaged products have a single nutrition label — splitting them into ingredients makes the estimate wrong.

Otherwise, for composed or homemade meals, split into every distinct component (each protein, bread, cheese, sauce, side, drink, etc.). For each component, keep the EXACT quantity the user stated in its name, and give a short database search query WITHOUT the quantity (e.g. component "3 slices pepperoni" → query "pepperoni").

For each component, set "branded": true if it is a specific name-brand or packaged product (e.g. "Clif bar", "Chobani yogurt", "Heinz ketchup", "Quest protein bar"), else false. For a branded component, KEEP the brand and product in BOTH the name and the lookupQuery (e.g. query "Clif bar chocolate chip") — its published label is more accurate than a generic estimate.

Do not estimate any nutrition numbers here — only decompose. Return valid JSON only.`;

const PLAN_SCHEMA = `{
  "mealName": "string — short name for the whole meal",
  "components": [
    { "name": "string — one component including its stated quantity, e.g. '3 oz cooked 80/20 beef'", "lookupQuery": "string — food name for database search, no quantity (keep the brand for branded products)", "branded": boolean }
  ]
}`;

const JSON_SCHEMA = `{
  "name": "string — short name for the whole meal",
  "servingDescription": "string — what this total covers, e.g. '1 cheeseburger as described'",
  "items": [
    { "name": "string — one component, incl. its quantity e.g. '3 oz cooked 80/20 beef'", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "servingAmount": "number — the household count this item's macros are FOR, e.g. 3 for '3 slices pepperoni'", "servingUnit": "string — the unit for servingAmount, e.g. 'slice', 'oz', 'cup', 'piece'", "servingGrams": "number — your best-estimate total gram weight of servingAmount of this item" }
  ],
  "calories": number,
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "confidence": "high" | "medium" | "low",
  "notes": "string — key assumptions made"
}`;

type Plan = { mealName: string; components: { name: string; lookupQuery: string; branded?: boolean }[] };

// Known frozen/packaged-meal product lines whose full names read like a dish
// description (e.g. "Healthy Choice Cafe Steamers Grilled Chicken Marinara
// with Parmesan"). The planner LLM sometimes splits these into ingredients
// despite PLAN_SYSTEM's instruction not to — this is a deterministic backstop
// that forces single-product treatment regardless of what the planner returns.
const PACKAGED_MEAL_BRANDS = [
  "healthy choice", "cafe steamers", "lean cuisine", "stouffer's", "stouffers",
  "hot pockets", "hungry-man", "hungry man", "banquet", "marie callender's",
  "marie callenders", "amy's", "amys kitchen", "kevin's natural foods",
  "smart ones", "michelina's", "michelinas", "bertolli", "birds eye voila",
  "devour", "tai pei", "p.f. chang's home menu", "evol foods", "gardein",
];

function looksLikePackagedMeal(text: string): boolean {
  const lower = text.toLowerCase();
  return PACKAGED_MEAL_BRANDS.some((b) => lower.includes(b));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T | null {
  try {
    const cleaned = stripReasoning(raw).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const start = cleaned.search(/[{[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

const STOP_WORDS = new Set(["flavored", "flavor", "with", "and", "the", "of", "a", "in", "style"]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Fraction of the query's significant words that appear in the candidate name —
// used to rank USDA hits so the closest-named product is offered first.
function nameMatchScore(query: string, candidate: string): number {
  const q = significantWords(query);
  if (!q.length) return 0;
  const c = new Set(significantWords(candidate));
  return q.filter((w) => c.has(w)).length / q.length;
}

// Formats a USDA hit for the model, making the portion explicit. A "per 100 g"
// figure is flagged loudly because treating it as one serving is the dominant
// error for packaged foods (a real ramen pack is 85 g, not 100 g).
function candidateLine(f: UsdaFood): string {
  const macros = `${f.calories} cal, ${f.proteinG}g protein, ${f.carbsG}g carb, ${f.fatG}g fat`;
  const portion = f.servingIsPer100g
    ? "PER 100 g — NOT a serving; scale to the real portion eaten"
    : `per ${f.servingDescription}`;
  return `- "${f.name}"${f.brand ? ` [${f.brand}]` : ""}: ${macros} — ${portion}`;
}

// The model is good at per-item values but often fumbles the final addition.
// Recompute totals from the itemized breakdown so the numbers always tie out.
function reconcileTotals(est: NutritionEstimate): NutritionEstimate {
  if (!est.items?.length) return est;
  const sum = (key: keyof NutritionItem) =>
    est.items!.reduce((acc, it) => acc + (Number(it[key]) || 0), 0);
  return {
    ...est,
    calories: Math.round(sum("calories")),
    proteinG: Math.round(sum("proteinG") * 10) / 10,
    carbsG: Math.round(sum("carbsG") * 10) / 10,
    fatG: Math.round(sum("fatG") * 10) / 10,
  };
}

// Final deterministic sanity pass: if the stated calories diverge wildly from
// the macro-derived figure (4/4/9), trust the macros — a runaway calorie count
// is the most common way the estimate ends up "way off".
function sanityCheck(est: NutritionEstimate): NutritionEstimate {
  const fromMacros = est.proteinG * 4 + est.carbsG * 4 + est.fatG * 9;
  if (fromMacros > 0 && est.calories > 0) {
    const ratio = est.calories / fromMacros;
    if (ratio > 1.25 || ratio < 0.75) {
      return { ...est, calories: Math.round(fromMacros), confidence: "low" };
    }
  }
  return est;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function* runNutritionPipeline(input: PipelineInput): AsyncGenerator<StageEvent> {
  try {
    let description = input.description?.trim() ?? "";
    const image = input.image;

    // ── Stage 0: identify (image only) ──────────────────────────────────────
    if (image) {
      yield { type: "stage", stage: "identifying", label: STAGE_LABELS.identifying };
      const identifyRes = await ai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
              { type: "text", text: `What food is shown in this image? Reply with just the food name and approximate serving size visible — nothing else. Keep it short.${description ? ` Context: ${description}` : ""}` },
            ] as never,
          },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      });
      const identified = stripReasoning(identifyRes.choices[0]?.message?.content ?? "");
      description = [identified, description].filter(Boolean).join(". ");
    }

    if (!description) {
      yield { type: "error", error: "Nothing to analyze — add a description or photo." };
      return;
    }

    // ── Stage 1: planner — decompose the meal into components ────────────────
    yield { type: "stage", stage: "planning", label: STAGE_LABELS.planning };
    const planRaw = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: PLAN_SYSTEM + "\n\nRespond ONLY with valid JSON matching this schema. No markdown, no explanation.\n" + PLAN_SCHEMA },
        { role: "user", content: `Break this meal into components: "${description}"` },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    });
    const plan = parseJson<Plan>(planRaw.choices[0]?.message?.content ?? "");
    // Cap components to keep latency bounded on the local model.
    const components = (plan?.components ?? []).filter((c) => c?.lookupQuery?.trim()).slice(0, 8);

    // ── Stage 2: tool calls — look up each component in the food database ─────
    yield { type: "stage", stage: "tools", label: STAGE_LABELS.tools };

    // A single-component plan means the planner judged this to be one packaged
    // product. For those, offer several closest-named USDA candidates (with their
    // real serving sizes) and let the verifier pick + scale to a real portion —
    // USDA Branded data is inconsistent, so picking one programmatically is worse
    // than letting the model choose. For composed meals, look up each component.
    // A known packaged-meal brand in the description overrides a multi-component
    // plan — see looksLikePackagedMeal.
    const isPackaged = components.length === 1 || looksLikePackagedMeal(description);
    const usdaLines: string[] = [];
    const webComponentBlocks: string[] = [];
    let productCandidatesBlock = "";
    let webSnippets: string[] = [];

    if (isPackaged) {
      const lookupQuery = (components.length === 1 && components[0].lookupQuery) || description;
      const hits = await searchUsdaFoods(lookupQuery, 8);
      const ranked = hits
        .map((h) => ({ h, score: nameMatchScore(description, `${h.name} ${h.brand ?? ""}`) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((x) => x.h);
      if (ranked.length) {
        productCandidatesBlock = `PRODUCT CANDIDATES (pick the best match for the named product, scale to ONE standard package/portion):\n${ranked.map(candidateLine).join("\n")}`;
      }
      // A branded product's published label is often clearest on the web.
      webSnippets = await webSearch(`${description} nutrition facts calories protein carbs fat per package serving`);
    } else {
      // Look up every component in the database, and for the ones the planner
      // flagged as branded, ALSO pull the product's published label off the web —
      // both lookups per component run in parallel to keep latency down.
      const lookups = await Promise.all(
        components.map(async (c) => {
          const [hits, snips] = await Promise.all([
            searchUsdaFoods(c.lookupQuery, 4),
            c.branded
              ? webSearch(`${c.lookupQuery} nutrition facts calories protein carbs fat per serving`, 3)
              : Promise.resolve<string[]>([]),
          ]);
          // USDA's own result order is unreliable (oddball branded rows often
          // rank first) — pick the hit whose name best matches the query.
          const top = hits
            .map((h) => ({ h, score: nameMatchScore(c.lookupQuery, `${h.name} ${h.brand ?? ""}`) }))
            .sort((a, b) => b.score - a.score)[0]?.h;
          return { c, top, snips };
        }),
      );
      for (const { c, top, snips } of lookups) {
        if (top) usdaLines.push(`- ${c.name} → ${candidateLine(top)}`);
        if (snips.length) {
          webComponentBlocks.push(`Web nutrition label for "${c.name}":\n${snips.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`);
        }
      }
      // Broad fallback only when we found nothing at all (no DB hits, no branded
      // web data) — otherwise the noisy whole-meal snippets aren't worth it.
      if (!usdaLines.length && !webComponentBlocks.length) {
        webSnippets = await webSearch(`${description} nutrition facts calories protein carbs fat per serving`);
      }
    }

    // ── Stage 3: memory search — the user's own previously-saved foods ───────
    yield { type: "stage", stage: "memory", label: STAGE_LABELS.memory };
    const memoryLines: string[] = [];
    const seenMemory = new Set<string>();
    const memoryQueries = components.length ? components.map((c) => c.lookupQuery) : [description];
    for (const q of memoryQueries) {
      const term = q.split(/\s+/).filter((w) => w.length > 2)[0] ?? q;
      const saved = await db.savedFood.findMany({
        where: { profileId: input.profileId, name: { contains: term } },
        orderBy: [{ useCount: "desc" }, { lastUsedAt: "desc" }],
        take: 2,
      });
      for (const f of saved) {
        if (seenMemory.has(f.id)) continue;
        seenMemory.add(f.id);
        memoryLines.push(
          `- YOUR saved "${f.name}"${f.brand ? ` (${f.brand})` : ""}: ${f.calories} cal, ${f.proteinG}g protein, ${f.carbsG}g carb, ${f.fatG}g fat per ${f.servingDescription || "serving"} (logged ${f.useCount}×)`,
        );
      }
    }

    // ── Stage 4: verification — synthesize + sanity-check the final estimate ──
    yield { type: "stage", stage: "verifying", label: STAGE_LABELS.verifying };
    const contextBlocks = [
      memoryLines.length ? `The user's OWN saved foods (authoritative — prefer these when a component matches):\n${memoryLines.join("\n")}` : "",
      productCandidatesBlock,
      components.length && !isPackaged ? `Planned components:\n${components.map((c) => `- ${c.name}`).join("\n")}` : "",
      usdaLines.length ? `Food-database (USDA) lookups for reference:\n${usdaLines.join("\n")}` : "",
      webComponentBlocks.length ? `Web nutrition labels for branded components (trust these for the named branded item, scaled to the stated amount):\n${webComponentBlocks.join("\n")}` : "",
      webSnippets.length ? `Web search results:\n${webSnippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    const instruction = isPackaged
      ? "This is a single packaged product. Pick the best PRODUCT CANDIDATE, scale it to one standard package/portion (a 'per 100 g' figure is NOT a serving), and return it as ONE item. Then verify. Return JSON:"
      : "Value each component, sum them, and verify per the rules. Return JSON:";

    const verifyRes = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: VERIFY_SYSTEM + "\n\nRespond ONLY with valid JSON. No markdown, no explanation." },
        {
          role: "user",
          content: `Meal: "${description}"\n\n${contextBlocks}\n\n${instruction}\n${JSON_SCHEMA}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    });

    const parsed = parseJson<NutritionEstimate>(verifyRes.choices[0]?.message?.content ?? "");
    if (!parsed) {
      yield { type: "error", error: "Could not produce a nutrition estimate. Try again." };
      return;
    }

    let estimate = sanityCheck(reconcileTotals(parsed));
    const searchUsed = !!productCandidatesBlock || usdaLines.length > 0 || webComponentBlocks.length > 0 || webSnippets.length > 0;
    // Without any external reference data (USDA down/rate-limited, web search
    // unavailable, no saved-food match) the estimate is model knowledge only —
    // never present that as high confidence.
    if (!searchUsed && !memoryLines.length && estimate.confidence !== "low") {
      estimate = {
        ...estimate,
        confidence: "low",
        notes: [estimate.notes, "No nutrition database or web data was available — estimated from general knowledge."].filter(Boolean).join(" "),
      };
    }
    yield { type: "result", estimate, searchUsed };
  } catch {
    yield { type: "error", error: "The AI pipeline failed. Check that LM Studio is running." };
  }
}

// ── Food search (Search tab) ────────────────────────────────────────────────
// The plain food search now consults the web alongside the USDA database. USDA's
// Branded data is patchy and often missing or generic for name-brand products, so
// for branded queries we let the AI read web nutrition-label snippets and return
// structured, label-accurate entries — surfaced above the raw database rows.

export type FoodSearchSource = "database" | "web";

export type FoodSearchResult = {
  name: string;
  brand: string | null;
  servingDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: FoodSearchSource;
  confidence?: "high" | "medium" | "low";
};

const SEARCH_EXTRACT_SYSTEM = `You extract verified nutrition facts for a food the user searched for, using web search snippets (which often contain the product's published nutrition label) and food-database candidates.

Return up to 3 distinct matching foods, best match first. Strongly prefer specific BRANDED products when the query names or implies a brand — values from a real published label are far more accurate than a generic estimate.

For each result:
- name: the specific product/food name. brand: the brand if it is a packaged product, else null.
- servingDescription: the product's standard serving as a household measure with weight when known (e.g. "1 bar (40 g)", "1 cup (240 ml)", "1 package (85 g)"). NEVER report a bare "per 100 g" lab reference as the serving unless 100 g is genuinely the package.
- calories/proteinG/carbsG/fatG: per ONE serving as described. Pull them from the published label in the snippets when present; otherwise from the database candidate; estimate only as a last resort.
- calories should ≈ proteinG*4 + carbsG*4 + fatG*9 (±10%). If a snippet's numbers violate this badly, distrust them.
- confidence: "high" if taken from a clear matching label, "medium" if cross-referenced or lightly estimated, "low" if uncertain.

If the snippets contain no usable nutrition data for the searched food, return an empty results array. Do NOT invent brands or fabricate numbers.

Always return valid JSON.`;

const SEARCH_EXTRACT_SCHEMA = `{
  "results": [
    { "name": "string", "brand": "string | null", "servingDescription": "string", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "confidence": "high" | "medium" | "low" }
  ]
}`;

type ExtractResponse = { results: Array<Omit<FoodSearchResult, "source">> };

function clampMacro(v: unknown, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(max, n) * 10) / 10;
}

// Per-result version of the pipeline's sanity check: if stated calories diverge
// wildly from the 4/4/9 macro math, trust the macros and drop confidence.
function sanitizeSearchResult(r: Omit<FoodSearchResult, "source">): Omit<FoodSearchResult, "source"> {
  const calories = clampMacro(r.calories, 5000);
  const proteinG = clampMacro(r.proteinG, 400);
  const carbsG = clampMacro(r.carbsG, 700);
  const fatG = clampMacro(r.fatG, 400);
  const fromMacros = proteinG * 4 + carbsG * 4 + fatG * 9;
  let finalCalories = Math.round(calories);
  let confidence = r.confidence;
  if (fromMacros > 0 && calories > 0) {
    const ratio = calories / fromMacros;
    if (ratio > 1.25 || ratio < 0.75) {
      finalCalories = Math.round(fromMacros);
      confidence = "low";
    }
  }
  return {
    name: String(r.name ?? "").trim(),
    brand: r.brand ? String(r.brand).trim() : null,
    servingDescription: String(r.servingDescription ?? "").trim() || "1 serving",
    calories: finalCalories,
    proteinG,
    carbsG,
    fatG,
    confidence,
  };
}

function usdaToResult(f: UsdaFood): FoodSearchResult {
  return {
    name: f.name,
    brand: f.brand,
    servingDescription: f.servingIsPer100g ? "100 g" : f.servingDescription,
    calories: f.calories,
    proteinG: f.proteinG,
    carbsG: f.carbsG,
    fatG: f.fatG,
    source: "database",
  };
}

// Treat two foods as the same listing when their names overlap strongly either
// way — keeps a web result from being duplicated by a near-identical USDA row.
function sameFood(a: string, b: string): boolean {
  return Math.max(nameMatchScore(a, b), nameMatchScore(b, a)) >= 0.8;
}

/**
 * Search for a food across the web and the USDA database, returning a merged,
 * de-duplicated list. AI-synthesized, label-accurate web matches (tagged
 * `source: "web"`) are surfaced first, followed by raw database rows.
 */
export async function searchNutrition(query: string): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // USDA lookup and web search run in parallel — neither blocks the other.
  const [usdaHits, webSnippets] = await Promise.all([
    searchUsdaFoods(q, 8),
    webSearch(`${q} nutrition facts calories protein carbs fat per serving`, 6),
  ]);

  const dbResults = usdaHits
    .map((h) => ({ h, score: nameMatchScore(q, `${h.name} ${h.brand ?? ""}`) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => usdaToResult(x.h));

  // Ask the model to turn the web (and USDA cross-reference) into structured,
  // label-accurate branded entries. Best-effort: any failure falls back to DB.
  let webResults: FoodSearchResult[] = [];
  if (webSnippets.length) {
    try {
      const usdaCrossRef = usdaHits.slice(0, 5).map(candidateLine).join("\n");
      const userPrompt = [
        `Food searched: "${q}"`,
        "",
        `WEB SEARCH RESULTS (may contain the product's published nutrition label):\n${webSnippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
        usdaCrossRef ? `\nFOOD-DATABASE CANDIDATES (USDA — real labels, cross-check serving sizes & macros):\n${usdaCrossRef}` : "",
        `\nReturn up to 3 matching foods as JSON matching this schema. No markdown, no explanation.\n${SEARCH_EXTRACT_SCHEMA}`,
      ].join("\n");

      const res = await ai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SEARCH_EXTRACT_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      });
      const parsed = parseJson<ExtractResponse>(res.choices[0]?.message?.content ?? "");
      webResults = (parsed?.results ?? [])
        .map(sanitizeSearchResult)
        .filter((r) => r.name && (r.calories > 0 || r.proteinG > 0 || r.carbsG > 0 || r.fatG > 0))
        .slice(0, 3)
        .map((r) => ({ ...r, source: "web" as const }));
    } catch {
      webResults = [];
    }
  }

  // Web matches first; append database rows that aren't near-duplicates of them.
  const merged: FoodSearchResult[] = [...webResults];
  for (const d of dbResults) {
    if (merged.length >= 8) break;
    if (webResults.some((w) => sameFood(w.name, d.name))) continue;
    merged.push(d);
  }
  return merged;
}
