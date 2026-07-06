"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogWaterButton({ ml, date }: { ml: number; date?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch("/api/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "water", amountMl: ml, ...(date && { date }) }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-colors disabled:opacity-50"
    >
      +{ml}ml
    </button>
  );
}
