"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, X, ArrowRight, AlertTriangle } from "lucide-react";
import { useGeneration } from "@/components/generation-context";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function GenerationBanner() {
  const { state, dismiss } = useGeneration();
  const router = useRouter();
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null);

  const visible = state.status !== "idle";

  useEffect(() => {
    if (typeof Notification !== "undefined" && (state.status === "generating" || state.status === "done")) {
      setNotifPermission(Notification.permission);
    }
  }, [state.status]);

  async function handleEnableNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission !== "granted") return;

    try {
      const sw = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const keyBuffer = sub.getKey("p256dh")!;
      const authBuffer = sub.getKey("auth")!;
      const p256dh = btoa(String.fromCharCode(...new Uint8Array(keyBuffer)));
      const auth = btoa(String.fromCharCode(...new Uint8Array(authBuffer)));
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh, auth } }),
      });
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -48 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -48 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="sticky top-[60px] z-30 px-4 pt-2 pointer-events-none"
        >
          {state.status === "error" ? (
            <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-destructive/20 text-white">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold flex-1 min-w-0 leading-snug">{state.message}</p>
              <button
                onClick={dismiss}
                className="h-6 w-6 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : state.status === "generating" ? (
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-primary/20 text-white">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{state.programName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-white"
                      animate={{
                        width: `${((state.weekNum - 1 + (state.dayNum / (state.totalDays + 1))) / state.totalWeeks) * 100}%`
                      }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <span className="text-[10px] font-bold opacity-80 shrink-0 tabular-nums whitespace-nowrap">
                    {state.weekNum > 0
                      ? state.dayNum === 0
                        ? `Wk ${state.weekNum}/${state.totalWeeks} — planning`
                        : `Wk ${state.weekNum}/${state.totalWeeks} · Day ${state.dayNum}/${state.totalDays}`
                      : "Starting…"}
                  </span>
                </div>
              </div>
              {notifPermission === "default" && (
                <button
                  onClick={handleEnableNotifications}
                  className="flex items-center gap-1 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
                >
                  🔔 Enable alerts
                </button>
              )}
              <button
                onClick={dismiss}
                className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : state.status === "done" ? (
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-primary/20 text-white">
              <Sparkles className="h-4 w-4 shrink-0" />
              <p className="text-sm font-semibold flex-1 min-w-0 truncate">
                <span className="opacity-80">{state.programName}</span> is ready!
              </p>
              {notifPermission === "default" && (
                <button
                  onClick={handleEnableNotifications}
                  className="flex items-center gap-1 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
                >
                  🔔 Enable alerts
                </button>
              )}
              <button
                onClick={() => {
                  router.push(`/workouts/programs/${state.programId}`);
                  dismiss();
                }}
                className="flex items-center gap-1 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
              >
                View <ArrowRight className="h-3 w-3" />
              </button>
              <button
                onClick={dismiss}
                className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
