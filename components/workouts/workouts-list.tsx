"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Dumbbell, ChevronRight, Clock, Trash2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Program = {
  id: string;
  name: string;
  goal: string;
  difficulty: string;
  weeks: number;
  daysPerWeek: number;
  aiGenerated: boolean;
  sessions: { id: string }[];
};

type Plan = {
  id: string;
  title: string;
  durationMin: number;
  category: string;
  aiGenerated: boolean;
  exercises: string;
};

function ConfirmDelete({ name, onConfirm, onCancel, loading }: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-0 z-10 rounded-2xl bg-destructive/5 border border-destructive/30 flex items-center gap-3 px-4"
    >
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <p className="text-sm font-semibold text-destructive flex-1 min-w-0 truncate">Delete "{name}"?</p>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 text-xs px-3 shrink-0"
        onClick={onConfirm}
        disabled={loading}
      >
        {loading ? "…" : "Delete"}
      </Button>
      <button onClick={onCancel} className="text-xs text-muted-foreground font-medium shrink-0">Cancel</button>
    </motion.div>
  );
}

export function ProgramsList({ programs }: { programs: Program[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/ai/program?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-3">
      {programs.map((prog) => (
        <div key={prog.id} className="relative rounded-2xl border border-border bg-white shadow-sm shadow-black/4 overflow-hidden">
          <AnimatePresence>
            {confirmId === prog.id && (
              <ConfirmDelete
                name={prog.name}
                onConfirm={() => handleDelete(prog.id)}
                onCancel={() => setConfirmId(null)}
                loading={deletingId === prog.id}
              />
            )}
          </AnimatePresence>
          <div className="flex items-start gap-3 p-4">
            <Link href={`/workouts/programs/${prog.id}`} className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/15 to-violet-100 flex items-center justify-center shrink-0">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{prog.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">{prog.weeks} weeks · {prog.daysPerWeek}×/week</span>
                  <span className="text-xs text-muted-foreground">· {prog.difficulty}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {prog.aiGenerated && <Badge variant="default" className="text-[10px]">AI</Badge>}
                  <Badge variant="outline" className="text-[10px] capitalize">{prog.goal}</Badge>
                  <span className="text-xs text-muted-foreground">{prog.sessions.length} sessions</span>
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setConfirmId(prog.id)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/8 transition-colors"
                aria-label="Delete program"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <Link href={`/workouts/programs/${prog.id}`}>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlansList({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/workouts?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {plans.map((plan) => {
        let mainCount = 0;
        try {
          const ex = JSON.parse(plan.exercises) as { type?: string }[];
          mainCount = ex.filter((e) => e.type === "main" || !e.type).length;
        } catch {}

        return (
          <div key={plan.id} className="relative rounded-2xl border border-border bg-white shadow-sm shadow-black/4 overflow-hidden">
            <AnimatePresence>
              {confirmId === plan.id && (
                <ConfirmDelete
                  name={plan.title}
                  onConfirm={() => handleDelete(plan.id)}
                  onCancel={() => setConfirmId(null)}
                  loading={deletingId === plan.id}
                />
              )}
            </AnimatePresence>
            <div className="flex items-center gap-3 p-4">
              <Link href={`/workouts/${plan.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <Dumbbell className="h-4 w-4 text-primary" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm truncate">{plan.title}</p>
                    {plan.aiGenerated && <Badge variant="default" className="text-[10px] shrink-0">AI</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{plan.durationMin}m</span>
                    <span className="text-xs text-muted-foreground">· {plan.category}</span>
                    {mainCount > 0 && <span className="text-xs text-muted-foreground">· {mainCount} exercises</span>}
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setConfirmId(plan.id)}
                  className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/8 transition-colors"
                  aria-label="Delete workout"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <Link href={`/workouts/${plan.id}`}>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
