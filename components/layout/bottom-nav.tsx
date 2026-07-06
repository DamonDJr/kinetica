"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Dumbbell, Apple, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/workouts", label: "Train", icon: Dumbbell },
  { href: "/nutrition", label: "Fuel", icon: Apple },
  { href: "/profile", label: "You", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none">
      <nav className="pointer-events-auto flex items-center gap-1 px-2 py-2 rounded-full bg-card/90 backdrop-blur-xl border border-border shadow-xl shadow-black/10">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="relative">
              <div className={cn(
                "relative flex flex-col items-center gap-0.5 px-5 py-2.5 rounded-full transition-all duration-200",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}>
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-primary/10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon className="h-5 w-5 relative z-10" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={cn(
                  "text-[10px] font-semibold relative z-10 tracking-wide",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
