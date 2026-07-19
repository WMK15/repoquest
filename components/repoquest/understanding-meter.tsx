"use client";

export function UnderstandingMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3" aria-label={`System understanding ${value}%`}>
      <span className="rq-kicker whitespace-nowrap">System understanding</span>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-foreground/10 lg:w-40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky via-primary to-leaf transition-all duration-700 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-mono text-xs text-primary">{value}%</span>
    </div>
  );
}
