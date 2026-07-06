import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  label: string;
  accent?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ label, accent, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between mb-4", className)}>
      <div>
        <h2 className="text-xl font-black tracking-tight leading-none">
          {label}
          {accent && <span className="text-primary ml-1.5">{accent}</span>}
        </h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
