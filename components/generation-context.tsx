"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";

type GenerationState =
  | { status: "idle" }
  | {
      status: "generating";
      programName: string;
      weekNum: number;
      totalWeeks: number;
      dayNum: number;
      totalDays: number;
    }
  | { status: "done"; programId: string; programName: string }
  | { status: "error"; message: string };

type GenerationOpts = {
  goal: string;
  weeks: number;
  daysPerWeek: number;
  difficulty: string;
  freeForm?: string;
};

type GenerationContextType = {
  state: GenerationState;
  generate: (opts: GenerationOpts) => Promise<{ programId: string } | null>;
  dismiss: () => void;
};

const GEN_KEY = "kinetica_gen";

const GenerationContext = createContext<GenerationContextType | null>(null);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GenerationState>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(programId: string, programName: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/program/status?id=${programId}`);
        if (!res.ok) return;
        const data = await res.json() as {
          status: string;
          progress: Record<string, unknown>;
          name: string;
          programId: string;
        };

        if (data.status === "generating") {
          const p = data.progress;
          setState({
            status: "generating",
            programName: data.name,
            weekNum: typeof p.weekNum === "number" ? p.weekNum : 0,
            totalWeeks: typeof p.totalWeeks === "number" ? p.totalWeeks : 1,
            dayNum: typeof p.dayNum === "number" ? p.dayNum : 0,
            totalDays: typeof p.totalDays === "number" ? p.totalDays : 1,
          });
        } else if (data.status === "done") {
          stopPolling();
          localStorage.removeItem(GEN_KEY);
          setState({ status: "done", programId: data.programId, programName: data.name });
        } else if (data.status === "error") {
          stopPolling();
          localStorage.removeItem(GEN_KEY);
          const p = data.progress;
          const msg = typeof p.error === "string" ? p.error : "Generation failed";
          setState({ status: "error", message: msg });
        }
      } catch {
        // transient fetch error — keep polling
      }
    }, 5000);
  }

  // On mount: resume polling if localStorage has an in-progress generation
  useEffect(() => {
    const stored = localStorage.getItem(GEN_KEY);
    if (!stored) return;
    try {
      const { programId, programName } = JSON.parse(stored) as { programId: string; programName: string };
      if (programId && programName) {
        setState({
          status: "generating",
          programName,
          weekNum: 0,
          totalWeeks: 1,
          dayNum: 0,
          totalDays: 1,
        });
        startPolling(programId, programName);
      }
    } catch {
      localStorage.removeItem(GEN_KEY);
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = useCallback(async (opts: GenerationOpts) => {
    const { goal, weeks, daysPerWeek, difficulty, freeForm } = opts;

    setState({
      status: "generating",
      programName: `${weeks}-week program`,
      weekNum: 0,
      totalWeeks: weeks,
      dayNum: 0,
      totalDays: daysPerWeek,
    });

    try {
      const res = await fetch("/api/ai/program/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, weeks, daysPerWeek, difficulty, freeForm }),
      });
      const data = await res.json() as { programId?: string; programName?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to start generation");

      const programId = data.programId!;
      const programName = data.programName!;

      localStorage.setItem(GEN_KEY, JSON.stringify({ programId, programName }));
      setState({
        status: "generating",
        programName,
        weekNum: 0,
        totalWeeks: weeks,
        dayNum: 0,
        totalDays: daysPerWeek,
      });

      startPolling(programId, programName);
      return { programId };
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Program creation failed" });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    stopPolling();
    localStorage.removeItem(GEN_KEY);
    setState({ status: "idle" });
  }, []);

  return (
    <GenerationContext.Provider value={{ state, generate, dismiss }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error("useGeneration must be used within GenerationProvider");
  return ctx;
}
