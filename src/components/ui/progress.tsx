import { cn } from "@/lib/cn";

export function Progress({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("progress-track", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <div className="progress-value" style={{ width: `${clamped}%` }} />
    </div>
  );
}
