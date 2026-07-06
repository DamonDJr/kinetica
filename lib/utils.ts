import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseJsonField<T>(field: string, fallback: T): T {
  try {
    return JSON.parse(field) as T;
  } catch {
    return fallback;
  }
}

/** Convert total inches to display string e.g. 71 → 5'11" */
export function formatHeight(totalInches: number | null | undefined): string {
  if (!totalInches) return "—";
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${ft}'${inches}"`;
}

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;

export function kgToLb(kg: number | null | undefined): number | null {
  if (kg == null) return null;
  return Math.round((kg / KG_PER_LB) * 10) / 10;
}

export function lbToKg(lb: number | null | undefined): number | null {
  if (lb == null) return null;
  return Math.round(lb * KG_PER_LB * 100) / 100;
}

export function cmToIn(cm: number | null | undefined): number | null {
  if (cm == null) return null;
  return Math.round((cm / CM_PER_IN) * 10) / 10;
}

export function inToCm(inches: number | null | undefined): number | null {
  if (inches == null) return null;
  return Math.round(inches * CM_PER_IN * 100) / 100;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function xpForNextLevel(level: number): number {
  return level * 500;
}

export type FitnessGoal = { label: string; detail?: string };

/**
 * Parse fitnessGoals JSON. Accepts legacy string[] (just labels) and new
 * {label, detail}[] shapes; always returns the new shape.
 */
export function parseGoals(field: string): FitnessGoal[] {
  try {
    const raw = JSON.parse(field) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item): FitnessGoal | null => {
        if (typeof item === "string") return { label: item };
        if (item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string") {
          const obj = item as { label: string; detail?: unknown };
          const detail = typeof obj.detail === "string" && obj.detail.trim() ? obj.detail.trim() : undefined;
          return { label: obj.label, detail };
        }
        return null;
      })
      .filter((g): g is FitnessGoal => g !== null);
  } catch {
    return [];
  }
}

export function formatGoalsForPrompt(goals: FitnessGoal[]): string {
  if (!goals.length) return "general fitness";
  return goals
    .map((g) => (g.detail ? `${g.label} (${g.detail})` : g.label))
    .join(", ");
}

export function levelFromXp(xp: number): number {
  let level = 1;
  let threshold = 500;
  while (xp >= threshold) {
    xp -= threshold;
    level++;
    threshold = level * 500;
  }
  return level;
}
