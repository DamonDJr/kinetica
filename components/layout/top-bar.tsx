"use client";
import { Flame } from "lucide-react";
import { NotificationsPanel } from "./notifications-panel";

interface TopBarProps {
  name?: string;
  level?: number;
  streakDays?: number;
  unreadInsights?: number;
}

export function TopBar({ name, level = 1, streakDays = 0, unreadInsights = 0 }: TopBarProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/60">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          {name ? (
            <>
              <p className="text-xs text-muted-foreground font-medium tracking-widest uppercase">{greeting}</p>
              <h1 className="text-xl font-bold tracking-tight leading-none mt-0.5">{name}</h1>
            </>
          ) : (
            <span className="text-xl font-black tracking-tight gradient-text">Kinetica</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {streakDays > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
              <Flame className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
              <span className="text-xs font-bold text-amber-700 tabular-nums">{streakDays}</span>
            </div>
          )}

          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20">
            <span className="text-xs font-bold text-primary">LV {level}</span>
          </div>

          <NotificationsPanel unreadCount={unreadInsights} />
        </div>
      </div>
    </header>
  );
}
