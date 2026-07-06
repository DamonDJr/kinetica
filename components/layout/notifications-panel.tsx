"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Sparkles, Camera, Dumbbell, Droplets, Flame, Star } from "lucide-react";

type Insight = {
  id: string;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
};

const typeConfig: Record<string, { icon: typeof Sparkles; color: string; bg: string; label: string }> = {
  workout: { icon: Dumbbell, color: "text-primary", bg: "bg-primary/10", label: "Workout" },
  nutrition: { icon: Flame, color: "text-accent", bg: "bg-accent/10", label: "Nutrition" },
  recovery: { icon: Droplets, color: "text-amber-600", bg: "bg-amber-100", label: "Recovery" },
  motivation: { icon: Star, color: "text-rose-500", bg: "bg-rose-50", label: "Motivation" },
  "progress-photo": { icon: Camera, color: "text-emerald-600", bg: "bg-emerald-50", label: "Progress" },
};

export function NotificationsPanel({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [localUnread, setLocalUnread] = useState(unreadCount);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function fetchInsights() {
    setLoading(true);
    try {
      const res = await fetch("/api/insights");
      const data = await res.json();
      setInsights(data.insights ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await fetch("/api/insights", { method: "PATCH" });
    setInsights((prev) => prev.map((i) => ({ ...i, read: true })));
    setLocalUnread(0);
  }

  function handleOpen() {
    setOpen(true);
    fetchInsights();
    if (localUnread > 0) markAllRead();
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative h-9 w-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
      >
        <Bell className="h-4 w-4" strokeWidth={1.8} />
        {localUnread > 0 && (
          <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold flex items-center justify-center text-white">
            {localUnread > 9 ? "9+" : localUnread}
          </span>
        )}
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />
              {/* Panel */}
              <motion.div
                initial={{ opacity: 0, y: "100%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl border-t border-border shadow-2xl max-h-[80vh] flex flex-col"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <h2 className="font-black text-base">Notifications</h2>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 p-4 space-y-3">
                  {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
                  ) : insights.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                      <p className="text-sm text-muted-foreground">No notifications yet</p>
                      <p className="text-xs text-muted-foreground">AI insights will appear here as you log workouts and meals</p>
                    </div>
                  ) : (
                    insights.map((insight) => {
                      let parsed: { headline?: string; body?: string; action?: string } = {};
                      try { parsed = JSON.parse(insight.content); } catch { parsed = { body: insight.content }; }
                      const cfg = typeConfig[insight.type] ?? typeConfig.motivation;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={insight.id}
                          className={`rounded-2xl p-4 border transition-opacity ${insight.read ? "opacity-60 border-border/60 bg-secondary/40" : "border-border bg-white shadow-sm shadow-black/4"}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-8 w-8 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                              <Icon className={`h-4 w-4 ${cfg.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{cfg.label}</span>
                                {!insight.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                              </div>
                              {parsed.headline && <p className="font-bold text-sm leading-snug">{parsed.headline}</p>}
                              {parsed.body && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{parsed.body}</p>}
                              {parsed.action && <p className="text-xs font-semibold text-primary mt-2">→ {parsed.action}</p>}
                              <p className="text-[10px] text-muted-foreground/60 mt-2">
                                {new Date(insight.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
