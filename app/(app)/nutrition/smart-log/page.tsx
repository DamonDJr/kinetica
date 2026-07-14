"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Camera, Sparkles, Loader2, Check, ArrowLeft, X, Globe, Bookmark, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ItemsEditor, buildEditableItems, itemsTotal, type EditableItem } from "@/components/nutrition/item-editor";

type NutritionItem = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingAmount?: number;
  servingUnit?: string;
  servingGrams?: number;
};

type NutritionResult = {
  id?: string;
  name: string;
  servingDescription?: string;
  brand?: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingAmount?: number;
  servingUnit?: string;
  servingGrams?: number;
  confidence?: "high" | "medium" | "low";
  notes?: string;
  items?: NutritionItem[];
  source?: "database" | "web";
};

type SavedFood = NutritionResult & { id: string; source: string; useCount: number; lastUsedAt: string };
type SourceTag = "search" | "ai" | "photo" | "saved";

type StageEvent =
  | { type: "stage"; stage: string; label: string }
  | { type: "result"; estimate: NutritionResult; searchUsed: boolean }
  | { type: "error"; error: string };

type AnalyzeOutcome = { estimate?: NutritionResult; searchUsed?: boolean; error?: string };

// POSTs to the streaming analyze route and reads its newline-delimited JSON,
// surfacing each pipeline stage's label via onStage as it arrives. Falls back to
// a plain JSON parse for non-streamed error responses (auth / validation).
async function streamAnalyze(init: RequestInit, onStage: (label: string) => void): Promise<AnalyzeOutcome> {
  const res = await fetch("/api/nutrition/analyze", { method: "POST", ...init });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("ndjson") || !res.body) {
    try {
      const d = await res.json();
      return { estimate: d.estimate, searchUsed: d.searchUsed, error: d.error };
    } catch {
      return { error: "Request failed" };
    }
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: AnalyzeOutcome = {};
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let evt: StageEvent;
      try {
        evt = JSON.parse(line) as StageEvent;
      } catch {
        continue;
      }
      if (evt.type === "stage") onStage(evt.label);
      else if (evt.type === "result") outcome = { estimate: evt.estimate, searchUsed: evt.searchUsed };
      else if (evt.type === "error") outcome = { error: evt.error };
    }
  }
  return outcome;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"];
const confidenceColor = { high: "text-accent", medium: "text-carbs", low: "text-fat" };

function todayParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SmartLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayParam();
  const [tab, setTab] = useState<"saved" | "search" | "ai" | "photo">("saved");

  // Day the meal is logged to — defaults to the day the user was viewing on the
  // nutrition page (?date=), else today. Capped at today.
  const [logDate, setLogDate] = useState(() => {
    const d = searchParams.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;
  });

  // Saved foods
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [savedQuery, setSavedQuery] = useState("");
  const [savedLoading, setSavedLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NutritionResult[]>([]);
  const [searching, setSearching] = useState(false);

  // AI estimate
  const [aiDescription, setAiDescription] = useState("");
  const [aiEstimate, setAiEstimate] = useState<NutritionResult | null>(null);
  const [aiSearchUsed, setAiSearchUsed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiStage, setAiStage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Photo
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoEstimate, setPhotoEstimate] = useState<NutritionResult | null>(null);
  const [photoSearchUsed, setPhotoSearchUsed] = useState(false);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoStage, setPhotoStage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Logging
  const [selected, setSelected] = useState<NutritionResult | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceTag | null>(null);
  const [mealType, setMealType] = useState("lunch");
  const [logging, setLoading] = useState(false);
  const [logged, setLogged] = useState(false);

  // Editable per-item breakdown of the currently-selected result.
  const [items, setItems] = useState<EditableItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setSavedLoading(true);
    fetch(`/api/saved-foods${savedQuery.trim() ? `?q=${encodeURIComponent(savedQuery.trim())}` : ""}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSavedFoods(d.foods ?? []); })
      .finally(() => { if (!cancelled) setSavedLoading(false); });
    return () => { cancelled = true; };
  }, [savedQuery]);

  async function deleteSaved(id: string) {
    if (!confirm("Remove this saved food?")) return;
    const res = await fetch(`/api/saved-foods?id=${id}`, { method: "DELETE" });
    if (res.ok) setSavedFoods((prev) => prev.filter((f) => f.id !== id));
  }

  function selectResult(item: NutritionResult, source: SourceTag) {
    setSelected(item);
    setSelectedSource(source);
    setItems(buildEditableItems(item));
  }

  async function handleSearch(q: string) {
    if (!q.trim() || q.length < 2) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function handleAIEstimate() {
    if (!aiDescription.trim()) return;
    setAnalyzing(true);
    setAiStage("Starting…");
    setAiEstimate(null);
    setAiError(null);
    try {
      const outcome = await streamAnalyze(
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: aiDescription }),
        },
        setAiStage,
      );
      if (outcome.estimate) {
        setAiEstimate(outcome.estimate);
        setAiSearchUsed(outcome.searchUsed ?? false);
      } else {
        setAiError(outcome.error ?? "Couldn't estimate nutrition. Try again.");
      }
    } catch {
      setAiError("Couldn't reach the AI. Check that LM Studio is running.");
    } finally {
      setAnalyzing(false);
      setAiStage(null);
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoEstimate(null);
  }

  async function handlePhotoAnalyze() {
    if (!photoFile) return;
    setPhotoAnalyzing(true);
    setPhotoStage("Starting…");
    setPhotoEstimate(null);
    setPhotoError(null);
    try {
      const formData = new FormData();
      formData.append("image", photoFile);
      const outcome = await streamAnalyze({ body: formData }, setPhotoStage);
      if (outcome.estimate) {
        setPhotoEstimate(outcome.estimate);
        setPhotoSearchUsed(outcome.searchUsed ?? false);
      } else {
        setPhotoError(outcome.error ?? "Couldn't estimate nutrition from that photo.");
      }
    } catch {
      setPhotoError("Couldn't reach the AI. Check that LM Studio is running.");
    } finally {
      setPhotoAnalyzing(false);
      setPhotoStage(null);
    }
  }

  async function handleLog() {
    if (!selected) return;
    setLoading(true);
    const totals = itemsTotal(items);
    // For autosave: anything from AI / photo / search becomes a SavedFood.
    // "saved" reuses an existing entry — the API just bumps useCount on POST.
    const saveSource: "ai" | "photo" | "search" | undefined =
      selectedSource === "ai" || selectedSource === "photo" || selectedSource === "search" || selectedSource === "saved"
        ? (selectedSource === "saved" ? "search" : selectedSource)
        : undefined;
    try {
      await fetch("/api/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType,
          name: selected.name,
          calories: totals.calories,
          proteinG: totals.proteinG,
          carbsG: totals.carbsG,
          fatG: totals.fatG,
          source: saveSource,
          servingDescription: selected.servingDescription,
          brand: selected.brand,
          date: logDate,
          perServing: totals,
          items: items.map((it) => ({
            name: it.name,
            calories: it.calories,
            proteinG: it.proteinG,
            carbsG: it.carbsG,
            fatG: it.fatG,
            servingAmount: it.servingAmount,
            servingUnit: it.servingUnit,
            servingGrams: it.servingGrams,
            baseCalories: it.baseCalories,
            baseProteinG: it.baseProteinG,
            baseCarbsG: it.baseCarbsG,
            baseFatG: it.baseFatG,
            baseServingAmount: it.baseServingAmount,
            baseServingGrams: it.baseServingGrams,
            savedFoodId: it.savedFoodId,
          })),
        }),
      });
      setLogged(true);
      const dest = logDate === today ? "/nutrition" : `/nutrition?date=${logDate}`;
      setTimeout(() => router.push(dest), 1200);
    } finally {
      setLoading(false);
    }
  }

  if (logged) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4"
      >
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <p className="text-xl font-black">Logged!</p>
        <p className="text-sm text-muted-foreground">Heading back to nutrition…</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/nutrition">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Nutrition</p>
          <h1 className="text-2xl font-black tracking-tight">Log Meal</h1>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-secondary">
        {([
          { key: "saved", label: "Saved", icon: Bookmark },
          { key: "search", label: "Search", icon: Search },
          { key: "ai", label: "Describe", icon: Sparkles },
          { key: "photo", label: "Photo", icon: Camera },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSelected(null); setSelectedSource(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all",
              tab === key ? "bg-white text-foreground shadow-sm shadow-black/8" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* SAVED TAB */}
        {tab === "saved" && (
          <motion.div key="saved" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter your saved foods…"
                value={savedQuery}
                onChange={(e) => setSavedQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {savedLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : savedFoods.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center space-y-2">
                <Bookmark className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="text-sm font-semibold">No saved foods yet</p>
                <p className="text-xs text-muted-foreground">Foods you log via Search, Describe, or Photo show up here.</p>
              </div>
            ) : !selected && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">{savedFoods.length} saved — tap to log again</p>
                {savedFoods.map((f) => (
                  <div key={f.id} className="group relative">
                    <button onClick={() => selectResult(f, "saved")} className="w-full text-left p-3.5 rounded-xl border border-border bg-white hover:border-primary/30 transition-colors shadow-sm shadow-black/4 pr-12">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate">{f.name}</p>
                          {f.brand && <p className="text-xs text-muted-foreground">{f.brand}</p>}
                          {f.servingDescription && (
                            <p className="text-[11px] text-muted-foreground">Per {f.servingDescription}</p>
                          )}
                        </div>
                        {f.useCount > 1 && (
                          <span className="text-[10px] font-bold text-muted-foreground tabular-nums">×{f.useCount}</span>
                        )}
                      </div>
                      <NutritionPills item={f} className="mt-2" />
                    </button>
                    <button
                      onClick={() => deleteSaved(f.id)}
                      aria-label="Delete saved food"
                      className="absolute right-2 top-2 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-fat hover:bg-fat/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* SEARCH TAB */}
        {tab === "search" && (
          <motion.div key="search" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search foods — web + database…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch(searchQuery)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => handleSearch(searchQuery)} disabled={searching} className="shrink-0">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2 flex items-center gap-1.5">
              <Globe className="h-3 w-3" /> Checks the web for name-brand labels alongside the food database.
            </p>
            {searching && (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">Searching web &amp; database…</span>
              </div>
            )}
            {!searching && searchResults.length > 0 && !selected && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">{searchResults.length} results — tap to select</p>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => selectResult(r, "search")} className="w-full text-left p-3.5 rounded-xl border border-border bg-white hover:border-primary/30 transition-colors shadow-sm shadow-black/4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm">{r.name}</p>
                        {r.brand && <p className="text-xs text-muted-foreground">{r.brand}</p>}
                        {r.servingDescription && (
                          <p className="text-[11px] text-muted-foreground">Per {r.servingDescription}</p>
                        )}
                      </div>
                      <SourceBadge source={r.source} confidence={r.confidence} />
                    </div>
                    <NutritionPills item={r} className="mt-2" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* AI DESCRIBE TAB */}
        {tab === "ai" && (
          <motion.div key="ai" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
            <div>
              <Label className="mb-1.5 block">Describe what you had</Label>
              <Input
                placeholder="e.g. big bowl of pasta with chicken and marinara sauce"
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAIEstimate()}
              />
              <p className="text-xs text-muted-foreground mt-1.5">Be descriptive — portions, cooking method, sauces all help.</p>
            </div>
            <Button onClick={handleAIEstimate} disabled={analyzing || !aiDescription.trim()} className="w-full">
              {analyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{aiStage ?? "Working…"}</> : <><Sparkles className="h-4 w-4 mr-2" />Estimate Nutrition</>}
            </Button>
            {aiError && (
              <p className="text-xs text-destructive font-medium">{aiError}</p>
            )}
            {aiEstimate && !selected && (
              <EstimateCard
                estimate={aiEstimate}
                searchUsed={aiSearchUsed}
                onSelect={() => selectResult(aiEstimate, "ai")}
              />
            )}
          </motion.div>
        )}

        {/* PHOTO TAB */}
        {tab === "photo" && (
          <motion.div key="photo" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />

            {!photoPreview ? (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Camera className="h-7 w-7 text-primary" />
                </div>
                <p className="font-bold text-sm">Take or choose a photo</p>
                <p className="text-xs text-muted-foreground">AI will identify the food and estimate nutrition</p>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-border">
                  <img src={photoPreview} alt="Food photo" className="w-full max-h-64 object-cover" />
                  <button
                    onClick={() => { setPhotoPreview(null); setPhotoFile(null); setPhotoEstimate(null); }}
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 flex items-center justify-center shadow"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {!photoEstimate && (
                  <Button onClick={handlePhotoAnalyze} disabled={photoAnalyzing} className="w-full">
                    {photoAnalyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{photoStage ?? "Working…"}</> : <><Sparkles className="h-4 w-4 mr-2" />Identify & Estimate</>}
                  </Button>
                )}
                {photoError && (
                  <p className="text-xs text-destructive font-medium">{photoError}</p>
                )}
                {photoEstimate && !selected && (
                  <EstimateCard estimate={photoEstimate} searchUsed={photoSearchUsed} onSelect={() => selectResult(photoEstimate, "photo")} />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm & Log panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-black text-base leading-snug">{selected.name}</p>
                {selected.servingDescription && (
                  <p className="text-xs text-muted-foreground mt-0.5">Per {selected.servingDescription}</p>
                )}
              </div>
              <button onClick={() => { setSelected(null); setSelectedSource(null); setItems([]); }} className="shrink-0 h-7 w-7 rounded-full bg-white border border-border flex items-center justify-center">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {items.length > 1 ? "Items — tap to fix" : "Tap to fix"}
              </p>
              <ItemsEditor items={items} onChange={setItems} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={logDate}
                max={today}
                onChange={(e) => setLogDate(e.target.value)}
                className="h-9"
              />
              {logDate !== today && (
                <p className="text-[11px] text-muted-foreground">Logging to a past day</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Meal type</Label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
                className="h-9 w-full rounded-xl border border-border bg-input px-3 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {MEAL_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>

            <Button onClick={handleLog} disabled={logging} className="w-full h-12 font-bold">
              {logging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Log {itemsTotal(items).calories} kcal
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SourceBadge({ source, confidence }: { source?: "database" | "web"; confidence?: "high" | "medium" | "low" }) {
  if (!source) return null;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {confidence && source === "web" && (
        <span className={cn("text-[10px] font-bold uppercase", confidenceColor[confidence])}>{confidence}</span>
      )}
      {source === "web" ? (
        <span className="flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/10 rounded-full px-2 py-0.5">
          <Globe className="h-2.5 w-2.5" />Web
        </span>
      ) : (
        <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded-full px-2 py-0.5">DB</span>
      )}
    </div>
  );
}

function NutritionPills({ item, servings = 1, className }: { item: NutritionResult; servings?: number; className?: string }) {
  const pills = [
    { label: "cal", value: Math.round(item.calories * servings), color: "bg-primary/10 text-primary" },
    { label: "protein", value: `${Math.round(item.proteinG * servings)}g`, color: "bg-accent/10 text-accent" },
    { label: "carbs", value: `${Math.round(item.carbsG * servings)}g`, color: "bg-carbs/10 text-carbs" },
    { label: "fat", value: `${Math.round(item.fatG * servings)}g`, color: "bg-fat/10 text-fat" },
  ];
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {pills.map((p) => (
        <span key={p.label} className={cn("px-2 py-0.5 rounded-full text-xs font-bold", p.color)}>
          {p.value} <span className="font-medium opacity-70">{p.label}</span>
        </span>
      ))}
    </div>
  );
}

function EstimateCard({ estimate, searchUsed, onSelect }: { estimate: NutritionResult; searchUsed?: boolean; onSelect: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-white p-4 shadow-sm shadow-black/4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm">{estimate.name}</p>
          {estimate.servingDescription && (
            <p className="text-xs text-muted-foreground">{estimate.servingDescription}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {searchUsed && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/10 rounded-full px-2 py-0.5">
              <Globe className="h-2.5 w-2.5" />Web
            </span>
          )}
          {estimate.confidence && (
            <span className={cn("text-[10px] font-bold uppercase", confidenceColor[estimate.confidence])}>
              {estimate.confidence}
            </span>
          )}
        </div>
      </div>
      <NutritionPills item={estimate} />
      {estimate.items && estimate.items.length > 1 && (
        <div className="space-y-1 rounded-xl bg-secondary/60 p-2.5">
          {estimate.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground truncate">{it.name}</span>
              <span className="font-semibold tabular-nums shrink-0">{Math.round(it.calories)} cal</span>
            </div>
          ))}
        </div>
      )}
      {estimate.notes && <p className="text-xs text-muted-foreground italic leading-relaxed">{estimate.notes}</p>}
      <Button onClick={onSelect} className="w-full h-10">Use &amp; adjust</Button>
    </motion.div>
  );
}
