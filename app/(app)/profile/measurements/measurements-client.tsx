"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { kgToLb, lbToKg, cmToIn, inToCm } from "@/lib/utils";

type Measurement = {
  id: string;
  takenAt: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
  notes: string | null;
};

type MetricKey = "weightKg" | "bodyFatPct" | "waistCm" | "chestCm" | "hipsCm" | "armCm" | "thighCm" | "neckCm";

type Conv = {
  toDisplay: (metric: number) => number;
  toMetric: (display: number) => number;
};
const WEIGHT: Conv = { toDisplay: (v) => kgToLb(v)!, toMetric: (v) => lbToKg(v)! };
const LENGTH: Conv = { toDisplay: (v) => cmToIn(v)!, toMetric: (v) => inToCm(v)! };
const PASS: Conv = { toDisplay: (v) => v, toMetric: (v) => v };

const METRICS: {
  key: MetricKey;
  label: string;
  unit: string;
  goalDirection: "down" | "up" | "neutral";
  conv: Conv;
}[] = [
  { key: "weightKg", label: "Weight", unit: "lb", goalDirection: "neutral", conv: WEIGHT },
  { key: "bodyFatPct", label: "Body Fat", unit: "%", goalDirection: "down", conv: PASS },
  { key: "waistCm", label: "Waist", unit: "in", goalDirection: "down", conv: LENGTH },
  { key: "chestCm", label: "Chest", unit: "in", goalDirection: "neutral", conv: LENGTH },
  { key: "hipsCm", label: "Hips", unit: "in", goalDirection: "neutral", conv: LENGTH },
  { key: "armCm", label: "Arm", unit: "in", goalDirection: "up", conv: LENGTH },
  { key: "thighCm", label: "Thigh", unit: "in", goalDirection: "up", conv: LENGTH },
  { key: "neckCm", label: "Neck", unit: "in", goalDirection: "neutral", conv: LENGTH },
];

interface Props {
  goalWeightKg: number | null;
  currentWeightKg: number | null;
  initialMeasurements: Measurement[];
}

export function MeasurementsClient({ goalWeightKg, currentWeightKg, initialMeasurements }: Props) {
  const [measurements, setMeasurements] = useState<Measurement[]>(initialMeasurements);
  const [showForm, setShowForm] = useState(initialMeasurements.length === 0);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("weightKg");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [insights, setInsights] = useState<Array<{ headline: string; body: string; action: string; priority: string }>>([]);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  async function generateInsights() {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const res = await fetch("/api/ai/insights/measurements", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setInsightError(data.error ?? "Failed to generate");
        return;
      }
      const parsed = (data.insights as Array<{ content: string }>).map((i) => {
        try { return JSON.parse(i.content); } catch { return null; }
      }).filter(Boolean);
      setInsights(parsed);
    } catch {
      setInsightError("Network error");
    } finally {
      setInsightLoading(false);
    }
  }

  const activeConv = METRICS.find((m) => m.key === activeMetric)!.conv;
  const series = useMemo(() => {
    return measurements
      .filter((m) => m[activeMetric] !== null)
      .map((m) => ({ t: new Date(m.takenAt).getTime(), v: activeConv.toDisplay(m[activeMetric] as number) }))
      .sort((a, b) => a.t - b.t);
  }, [measurements, activeMetric, activeConv]);

  const latest = measurements[0] ?? null;
  const prior = measurements[1] ?? null;

  async function save() {
    const payload: Record<string, unknown> = { notes: notes || undefined };
    let any = false;
    for (const m of METRICS) {
      const raw = draft[m.key];
      if (raw && raw.trim() !== "") {
        const display = parseFloat(raw);
        if (!Number.isFinite(display)) continue;
        payload[m.key] = m.conv.toMetric(display);
        any = true;
      }
    }
    if (!any) return;

    setSaving(true);
    try {
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.measurement) {
        setMeasurements((prev) => [data.measurement, ...prev]);
        setDraft({});
        setNotes("");
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    const res = await fetch(`/api/measurements?id=${id}`, { method: "DELETE" });
    if (res.ok) setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }

  const activeMeta = METRICS.find((m) => m.key === activeMetric)!;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
            <Link href="/profile"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Measurements</h1>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        )}
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-semibold">New entry</p>
              <p className="text-xs text-muted-foreground -mt-2">Fill in any or all — leave blanks to skip.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {METRICS.map((m) => (
                  <div key={m.key} className="space-y-1">
                    <Label htmlFor={m.key} className="text-xs">{m.label} ({m.unit})</Label>
                    <Input
                      id={m.key}
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={draft[m.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })}
                      placeholder={
                        m.key === "weightKg" && currentWeightKg ? String(currentWeightKg) : ""
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs">Notes (optional)</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Morning, post-workout, etc."
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={save} disabled={saving} className="flex-1" size="sm">
                  {saving ? "Saving..." : "Save"}
                </Button>
                {measurements.length > 0 && (
                  <Button variant="outline" onClick={() => setShowForm(false)} size="sm">Cancel</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Latest summary */}
      {latest && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Latest</p>
              <p className="text-xs text-muted-foreground">{new Date(latest.takenAt).toLocaleDateString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {METRICS.map((m) => {
                const rawV = latest[m.key];
                const rawP = prior?.[m.key];
                if (rawV === null) return null;
                const v = +m.conv.toDisplay(rawV).toFixed(1);
                const p = rawP !== null && rawP !== undefined ? m.conv.toDisplay(rawP) : null;
                const delta = p !== null ? +(v - p).toFixed(1) : null;
                const good =
                  delta === null || delta === 0
                    ? "neutral"
                    : m.goalDirection === "down"
                      ? delta < 0 ? "good" : "bad"
                      : m.goalDirection === "up"
                        ? delta > 0 ? "good" : "bad"
                        : "neutral";
                return (
                  <div key={m.key} className="rounded-xl border border-border p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{m.label}</p>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-lg font-black tabular-nums">{v}<span className="text-xs font-semibold text-muted-foreground ml-0.5">{m.unit}</span></p>
                      {delta !== null && delta !== 0 && (
                        <span className={`text-xs font-semibold tabular-nums flex items-center gap-0.5 ${
                          good === "good" ? "text-emerald-600" : good === "bad" ? "text-rose-500" : "text-muted-foreground"
                        }`}>
                          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {delta > 0 ? "+" : ""}{delta}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      {latest && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI Insights</p>
            <Button size="sm" variant="ghost" onClick={generateInsights} disabled={insightLoading} className="h-7 gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {insightLoading ? "Thinking..." : insights.length ? "Regenerate" : "Generate"}
            </Button>
          </div>
          {insightError && (
            <p className="text-xs text-rose-500">{insightError}</p>
          )}
          {insights.map((i, idx) => {
            const priorityStyles: Record<string, string> = {
              high: "border-rose-200 bg-gradient-to-br from-rose-50 to-white",
              medium: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
              low: "border-primary/20 bg-gradient-to-br from-primary/5 to-white",
            };
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`rounded-2xl border p-4 ${priorityStyles[i.priority] ?? priorityStyles.low}`}
              >
                <p className="font-bold text-sm leading-snug mb-1">{i.headline}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{i.body}</p>
                {i.action && <p className="text-xs font-semibold text-primary mt-2">→ {i.action}</p>}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Trend chart */}
      {series.length >= 2 && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{activeMeta.label} trend</p>
              <p className="text-xs text-muted-foreground">{series.length} entries</p>
            </div>
            <Sparkline series={series} unit={activeMeta.unit} goalLine={activeMetric === "weightKg" ? goalWeightKg : null} />
            <div className="flex flex-wrap gap-1.5">
              {METRICS.filter((m) => measurements.some((x) => x[m.key] !== null)).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setActiveMetric(m.key)}
                  className={`px-2.5 h-7 rounded-full text-xs font-semibold border transition-colors ${
                    activeMetric === m.key
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {measurements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">History</p>
          {measurements.map((m) => (
            <div key={m.id} className="rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold">{new Date(m.takenAt).toLocaleString()}</p>
                <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {METRICS.map((meta) => {
                  const raw = m[meta.key];
                  if (raw === null) return null;
                  const v = +meta.conv.toDisplay(raw).toFixed(1);
                  return (
                    <span key={meta.key} className="tabular-nums">
                      <span className="text-muted-foreground">{meta.label}:</span>{" "}
                      <span className="font-semibold">{v}{meta.unit}</span>
                    </span>
                  );
                })}
              </div>
              {m.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">{m.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {measurements.length === 0 && !showForm && (
        <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">No measurements yet</p>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add first entry
          </Button>
        </div>
      )}
    </div>
  );
}

function Sparkline({
  series,
  unit,
  goalLine,
}: {
  series: { t: number; v: number }[];
  unit: string;
  goalLine: number | null;
}) {
  const W = 320;
  const H = 100;
  const PAD = 8;
  const minT = series[0].t;
  const maxT = series[series.length - 1].t;
  const values = series.map((p) => p.v);
  if (goalLine !== null) values.push(goalLine);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rangeV = maxV - minV || 1;
  const rangeT = maxT - minT || 1;

  const points = series.map((p) => {
    const x = PAD + ((p.t - minT) / rangeT) * (W - PAD * 2);
    const y = H - PAD - ((p.v - minV) / rangeV) * (H - PAD * 2);
    return { x, y, v: p.v };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L${points[points.length - 1].x.toFixed(1)},${H - PAD} L${points[0].x.toFixed(1)},${H - PAD} Z`;

  const goalY = goalLine !== null ? H - PAD - ((goalLine - minV) / rangeV) * (H - PAD * 2) : null;
  const last = points[points.length - 1];

  return (
    <div className="rounded-xl border border-border bg-gradient-to-b from-primary/3 to-transparent p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c6af7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7c6af7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#spark)" />
        <path d={path} fill="none" stroke="#7c6af7" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        {goalY !== null && (
          <line x1={PAD} y1={goalY} x2={W - PAD} y2={goalY} stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" />
        )}
        <circle cx={last.x} cy={last.y} r="3" fill="#7c6af7" />
      </svg>
      <div className="flex items-baseline justify-between text-[10px] text-muted-foreground tabular-nums px-1 -mt-1">
        <span>{new Date(minT).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span className="font-semibold text-foreground">latest: {last.v}{unit}</span>
        <span>{new Date(maxT).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}
