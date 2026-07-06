"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Moon, Check, Sparkles, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Adjustment = { sessionName: string; summary: string; adjustment: string } | null;

interface SleepCardProps {
  lastNight: { hours: number; quality: number; forDate: string } | null;
}

const QUALITY_LABELS = ["Awful", "Poor", "Okay", "Good", "Great"];

export function SleepCard({ lastNight }: SleepCardProps) {
  const [hours, setHours] = useState(lastNight?.hours ?? 7.5);
  const [quality, setQuality] = useState(lastNight?.quality ?? 3);
  const [saved, setSaved] = useState(!!lastNight);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(!!lastNight);
  const [adjustment, setAdjustment] = useState<Adjustment>(null);

  async function save() {
    setSaving(true);
    setAdjustment(null);
    try {
      const res = await fetch("/api/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, quality }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(true);
        setCollapsed(true);
        if (data.adjustment) setAdjustment(data.adjustment);
      }
    } finally {
      setSaving(false);
    }
  }

  if (collapsed && saved) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 flex items-center gap-3">
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-indigo-100 text-indigo-600 shrink-0">
              <Moon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-black leading-none">
                {hours}h <span className="text-sm font-semibold text-muted-foreground">· {QUALITY_LABELS[quality - 1]}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">last night's sleep · tap to edit</p>
            </div>
            <Check className="h-4 w-4 text-emerald-600" />
          </button>
          <Link
            href="/sleep"
            className="h-9 px-2.5 rounded-lg flex items-center gap-0.5 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 shrink-0"
          >
            All <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {adjustment && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-primary uppercase tracking-widest">
                {adjustment.adjustment === "none" ? "Today's plan looks right" : `Today: ${adjustment.adjustment}`}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                <span className="font-semibold text-foreground">{adjustment.sessionName}.</span>{" "}
                {adjustment.summary}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-indigo-100 text-indigo-600 shrink-0">
          <Moon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold">How'd you sleep?</p>
          <p className="text-xs text-muted-foreground">Helps the coach tailor today</p>
        </div>
        <Link href="/sleep" className="text-xs font-semibold text-indigo-600 hover:underline shrink-0">All</Link>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Hours</span>
          <span className="text-2xl font-black tabular-nums">{hours.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(parseFloat(e.target.value))}
          className="w-full accent-indigo-500"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Quality</span>
          <span className="text-xs font-semibold text-foreground">{QUALITY_LABELS[quality - 1]}</span>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((q) => (
            <button
              key={q}
              onClick={() => setQuality(q)}
              className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition-colors ${
                quality === q
                  ? "bg-indigo-500 border-indigo-500 text-white"
                  : "bg-white border-border text-muted-foreground hover:border-indigo-300"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full" size="sm">
        {saving ? (<><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Adjusting today's workout…</>) : saved ? "Update" : "Log sleep"}
      </Button>
    </motion.div>
  );
}
