"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Loader2,
  AlertTriangle,
  ShieldX,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  vapidPublicKey: string;
  initial: {
    mealRemindersEnabled: boolean;
    workoutNudgesEnabled: boolean;
    notifyStartHour: number;
    notifyEndHour: number;
    subscribed: boolean;
  };
};

type PermState = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
function formatHour(h: number) {
  const period = h < 12 ? "am" : "pm";
  const display = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${display}${period}`;
}

export function NotificationSettings({ vapidPublicKey, initial }: Props) {
  const [perm, setPerm] = useState<PermState>("default");
  // Don't trust the server-passed initial.subscribed alone — verify against the actual browser state on mount.
  const [subscribed, setSubscribed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<null | "subscribe" | "unsubscribe" | "test">(null);
  const [testStatus, setTestStatus] = useState<"idle" | "sent" | "fail">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [meal, setMeal] = useState(initial.mealRemindersEnabled);
  const [workout, setWorkout] = useState(initial.workoutNudgesEnabled);
  const [startHour, setStartHour] = useState(initial.notifyStartHour);
  const [endHour, setEndHour] = useState(initial.notifyEndHour);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPerm("unsupported");
      setHydrated(true);
      return;
    }
    setPerm(Notification.permission as PermState);

    (async () => {
      try {
        // Make sure a service worker is actually registering — register-sw.js is gated on
        // window.load, and if the SW was cleared we'd otherwise wait forever on .ready.
        const existing = await navigator.serviceWorker.getRegistration();
        if (!existing) {
          await navigator.serviceWorker.register("/sw.js").catch((err) => {
            console.error("SW register failed:", err);
          });
        }

        // Race .ready against a 5s timeout so we never get stuck on "Checking…".
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (!reg) {
          setWarning("Service worker didn't activate. Try a hard reload (Ctrl+Shift+R) or reinstall the app.");
          setSubscribed(false);
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Browser has a subscription. If the server doesn't know about it (or has a stale endpoint),
          // sync silently so a test push will work.
          if (!initial.subscribed) {
            const keyBuffer = sub.getKey("p256dh");
            const authBuffer = sub.getKey("auth");
            if (keyBuffer && authBuffer) {
              const p256dh = btoa(String.fromCharCode(...new Uint8Array(keyBuffer)));
              const authStr = btoa(String.fromCharCode(...new Uint8Array(authBuffer)));
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh, auth: authStr } }),
              }).catch(() => {});
            }
          }
          setSubscribed(true);
        } else {
          // No browser subscription. If the server thinks we're subscribed, the record is stale.
          if (initial.subscribed) {
            await fetch("/api/push/subscribe", { method: "DELETE" }).catch(() => {});
            setWarning("Your previous subscription expired. Re-enable notifications to start receiving them again.");
          }
          setSubscribed(false);
        }
      } catch (err) {
        console.error("Subscription check failed:", err);
      } finally {
        setHydrated(true);
      }
    })();
  }, [initial.subscribed]);

  async function handleSubscribe() {
    if (!vapidPublicKey) {
      setError("Server is missing NEXT_PUBLIC_VAPID_PUBLIC_KEY. Check .env.local.");
      return;
    }
    setBusy("subscribe");
    setError(null);
    setWarning(null);
    try {
      const permission = await Notification.requestPermission();
      setPerm(permission as PermState);
      if (permission !== "granted") {
        setError("Permission not granted. You can re-enable it from your browser's site settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Drop any stale subscription so we get a fresh endpoint that matches our VAPID keys.
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe().catch(() => {});
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const keyBuffer = sub.getKey("p256dh")!;
      const authBuffer = sub.getKey("auth")!;
      const p256dh = btoa(String.fromCharCode(...new Uint8Array(keyBuffer)));
      const authStr = btoa(String.fromCharCode(...new Uint8Array(authBuffer)));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh, auth: authStr } }),
      });
      if (!res.ok) {
        setError("Failed to register subscription with the server.");
        return;
      }
      setSubscribed(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while subscribing.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUnsubscribe() {
    setBusy("unsubscribe");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await fetch("/api/push/subscribe", { method: "DELETE" });
      setSubscribed(false);
    } catch (err) {
      console.error(err);
      setError("Failed to unsubscribe cleanly. Server record was removed.");
      setSubscribed(false);
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    setBusy("test");
    setTestStatus("idle");
    setTestError(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestStatus("sent");
      } else {
        setTestStatus("fail");
        setTestError(data?.error ?? `HTTP ${res.status}`);
        if (data?.expired) setSubscribed(false);
      }
    } catch (err) {
      setTestStatus("fail");
      setTestError((err as Error).message ?? "Network error");
    } finally {
      setBusy(null);
      setTimeout(() => setTestStatus((s) => (s === "sent" ? "idle" : s)), 4000);
    }
  }

  async function savePref(patch: Record<string, unknown>) {
    setSavingPrefs(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) setError("Failed to save preference.");
    } finally {
      setSavingPrefs(false);
    }
  }

  function toggleMeal() {
    const next = !meal;
    setMeal(next);
    savePref({ mealRemindersEnabled: next });
  }
  function toggleWorkout() {
    const next = !workout;
    setWorkout(next);
    savePref({ workoutNudgesEnabled: next });
  }
  function changeStart(h: number) {
    setStartHour(h);
    savePref({ notifyStartHour: h });
  }
  function changeEnd(h: number) {
    setEndHour(h);
    savePref({ notifyEndHour: h });
  }

  const canSubscribe = perm !== "unsupported" && perm !== "denied";

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <Link href="/profile">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Profile</p>
          <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        </div>
      </div>

      {/* Permission + subscription card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <StatusRow perm={perm} subscribed={subscribed} />

          {perm === "unsupported" && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              This browser doesn't support push notifications. Try a recent Chrome, Edge, Firefox, or
              Safari (iOS 16.4+ requires installing the app to your home screen first).
            </p>
          )}

          {perm === "denied" && (
            <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
              Notifications are blocked at the browser level. Open your browser's site settings for
              this app and reset the notification permission, then come back.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!hydrated ? (
              <Button disabled variant="outline">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking…
              </Button>
            ) : !subscribed ? (
              <Button onClick={handleSubscribe} disabled={!canSubscribe || busy === "subscribe"}>
                {busy === "subscribe" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4 mr-2" />
                )}
                Enable notifications
              </Button>
            ) : (
              <>
                <Button onClick={handleTest} disabled={busy === "test"} variant="default">
                  {busy === "test" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : testStatus === "sent" ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <Bell className="h-4 w-4 mr-2" />
                  )}
                  {testStatus === "sent" ? "Test sent" : "Send test"}
                </Button>
                <Button onClick={handleUnsubscribe} disabled={busy === "unsubscribe"} variant="outline">
                  {busy === "unsubscribe" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <BellOff className="h-4 w-4 mr-2" />
                  )}
                  Disable
                </Button>
              </>
            )}
          </div>

          {testStatus === "fail" && (
            <p className="text-xs text-destructive">
              Test failed{testError ? `: ${testError}` : "."} Try Disable + Enable to refresh the subscription.
            </p>
          )}
          {warning && !error && (
            <p className="text-xs text-amber-700">{warning}</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Reminder toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What should we nudge you about?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <ToggleRow
            label="Meal reminders"
            description="Every ~2 hours during your active window. Quiet if you've already logged something."
            enabled={meal}
            onToggle={toggleMeal}
            disabled={!subscribed}
          />
          <ToggleRow
            label="Workout nudges"
            description="If you have an active program, you're behind your weekly target, and haven't trained today."
            enabled={workout}
            onToggle={toggleWorkout}
            disabled={!subscribed}
          />
        </CardContent>
      </Card>

      {/* Quiet hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Active hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            Notifications only fire between these hours. Default 9am–9pm.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start</Label>
              <HourSelect value={startHour} onChange={changeStart} disabled={!subscribed} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End</Label>
              <HourSelect value={endHour} onChange={changeEnd} disabled={!subscribed} />
            </div>
          </div>
          {savingPrefs && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> saving…
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ perm, subscribed }: { perm: PermState; subscribed: boolean }) {
  let icon = <Bell className="h-4 w-4 text-muted-foreground" />;
  let label = "Not enabled";
  let tone = "text-muted-foreground";
  if (perm === "denied") {
    icon = <ShieldX className="h-4 w-4 text-destructive" />;
    label = "Blocked by browser";
    tone = "text-destructive";
  } else if (perm === "unsupported") {
    icon = <AlertTriangle className="h-4 w-4 text-amber-600" />;
    label = "Browser doesn't support push";
    tone = "text-amber-700";
  } else if (perm === "granted" && subscribed) {
    icon = <Check className="h-4 w-4 text-emerald-600" />;
    label = "Active and subscribed";
    tone = "text-emerald-700";
  } else if (perm === "granted" && !subscribed) {
    icon = <AlertTriangle className="h-4 w-4 text-amber-600" />;
    label = "Permission granted but no subscription on file";
    tone = "text-amber-700";
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("flex items-center gap-2 text-sm font-semibold", tone)}
    >
      {icon}
      {label}
    </motion.div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-3", disabled && "opacity-50 pointer-events-none")}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "shrink-0 mt-1 h-6 w-11 rounded-full transition-colors relative",
          enabled ? "bg-primary" : "bg-secondary border border-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

function HourSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (h: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-10 w-full rounded-xl border border-border bg-input px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {formatHour(h)}
        </option>
      ))}
    </select>
  );
}
