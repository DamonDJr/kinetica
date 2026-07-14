"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Loader2, Sparkles, Send, Dumbbell, Scale, Utensils, Moon, Feather } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  content: string;
  mood: number;
  energy: number | null;
  context: string;
  isWin: boolean;
  coachReply: string | null;
  loggedAt: string;
};

const MOODS = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "🤩", label: "Great" },
];

const CONTEXTS = [
  { value: "general", label: "General", icon: Feather },
  { value: "workout", label: "Workout", icon: Dumbbell },
  { value: "weigh-in", label: "Weigh-in", icon: Scale },
  { value: "meal", label: "Meal", icon: Utensils },
  { value: "sleep", label: "Sleep", icon: Moon },
];

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function JournalClient({
  displayName,
  initialEntries,
  initialContext,
}: {
  displayName: string;
  initialEntries: Entry[];
  initialContext?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [context, setContext] = useState(
    CONTEXTS.some((c) => c.value === initialContext) ? initialContext! : "general"
  );
  const [isWin, setIsWin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Snapshot "a week ago" once per mount so the render stays pure.
  const [weekAgo] = useState(() => Date.now() - 7 * 86400000);
  const winsThisWeek = entries.filter((e) => e.isWin && new Date(e.loggedAt).getTime() > weekAgo).length;

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), mood: mood ?? 3, context, isWin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save");
        return;
      }
      const { entry } = (await res.json()) as { entry: Entry };
      setEntries((es) => [entry, ...es]);
      setContent("");
      setMood(null);
      setIsWin(false);
      setSaving(false);

      // Fetch the coach reply in the background — the entry is already saved.
      setReplyingId(entry.id);
      try {
        const replyRes = await fetch("/api/journal/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId: entry.id }),
        });
        if (replyRes.ok) {
          const { entry: updated } = (await replyRes.json()) as { entry: Entry };
          setEntries((es) => es.map((e) => (e.id === updated.id ? { ...e, coachReply: updated.coachReply } : e)));
        }
      } finally {
        setReplyingId(null);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Journal</p>
        <h1 className="text-2xl font-black tracking-tight">How are you feeling, {displayName.split(" ")[0]}?</h1>
      </div>

      {/* Wins banner */}
      <div className="rounded-2xl border border-amber-300/40 bg-amber-500/5 p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <Trophy className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-bold">
            {winsThisWeek > 0 ? `${winsThisWeek} win${winsThisWeek === 1 ? "" : "s"} logged this week` : "Log the wins!"}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Small ones count — a good set, an honest weigh-in, saying no to the vending machine. Your coach builds on them.
          </p>
        </div>
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div>
          <Label className="mb-2 block text-xs">Mood</Label>
          <div className="flex gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(mood === m.value ? null : m.value)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border transition-all",
                  mood === m.value
                    ? "bg-primary/15 border-primary/50 scale-105"
                    : "bg-background border-border hover:border-primary/30"
                )}
              >
                <span className="text-xl leading-none">{m.emoji}</span>
                <span className={cn("text-[10px] font-semibold", mood === m.value ? "text-primary" : "text-muted-foreground")}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-xs">What&apos;s this about?</Label>
          <div className="flex flex-wrap gap-1.5">
            {CONTEXTS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setContext(value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                  context === value
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What happened? How did it feel? Wins big and small belong here."
          rows={4}
          className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />

        <button
          type="button"
          onClick={() => setIsWin((w) => !w)}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold transition-all",
            isWin
              ? "bg-amber-500/15 border-amber-400/60 text-amber-500"
              : "bg-background border-border text-muted-foreground hover:border-amber-400/40 hover:text-amber-500"
          )}
        >
          <Trophy className="h-4 w-4" />
          {isWin ? "Marked as a win!" : "This was a win"}
        </button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSave} disabled={saving || !content.trim()} className="w-full h-11 font-bold">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Log it <span className="ml-1.5 text-xs font-semibold opacity-70">+15 XP</span>
            </>
          )}
        </Button>
      </div>

      {/* Timeline */}
      {entries.length > 0 && (
        <div className="space-y-3">
          <Label className="block text-xs">Your entries</Label>
          <AnimatePresence initial={false}>
            {entries.map((e) => {
              const moodMeta = MOODS.find((m) => m.value === e.mood);
              const ctxMeta = CONTEXTS.find((c) => c.value === e.context);
              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "rounded-2xl border bg-card overflow-hidden",
                    e.isWin ? "border-amber-400/40" : "border-border"
                  )}
                >
                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {moodMeta && <span className="text-base leading-none">{moodMeta.emoji}</span>}
                      {ctxMeta && ctxMeta.value !== "general" && (
                        <span className="flex items-center gap-1 font-semibold">
                          <ctxMeta.icon className="h-3 w-3" />
                          {ctxMeta.label}
                        </span>
                      )}
                      {e.isWin && (
                        <span className="flex items-center gap-1 font-bold text-amber-500">
                          <Trophy className="h-3 w-3" /> Win
                        </span>
                      )}
                      <span className="ml-auto">{timeAgo(e.loggedAt)}</span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{e.content}</p>
                  </div>
                  {(e.coachReply || replyingId === e.id) && (
                    <div className="border-t border-border bg-primary/5 px-4 py-3 flex gap-2.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      {e.coachReply ? (
                        <p className="text-xs leading-relaxed text-muted-foreground">{e.coachReply}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" /> Coach is reading your entry…
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
