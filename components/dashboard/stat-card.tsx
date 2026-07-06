"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  color?: "purple" | "teal" | "amber" | "rose";
  className?: string;
}

const colorMap = {
  purple: "from-primary/10 to-primary/5 border-primary/20 text-primary",
  teal: "from-accent/10 to-accent/5 border-accent/20 text-accent",
  amber: "from-amber-400/10 to-amber-400/5 border-amber-400/20 text-amber-600",
  rose: "from-rose-400/10 to-rose-400/5 border-rose-400/20 text-rose-600",
};

export function StatCard({ label, value, unit, icon, color = "purple", className }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border bg-gradient-to-br p-4",
        colorMap[color],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-foreground">{value}</span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
        </div>
        {icon && (
          <div className={cn("p-2 rounded-xl", colorMap[color].split(" ").slice(0, 2).join(" "))}>
            {icon}
          </div>
        )}
      </div>
    </motion.div>
  );
}
