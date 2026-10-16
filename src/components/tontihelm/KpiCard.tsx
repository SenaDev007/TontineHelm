"use client";
// TontiHelm — KpiCard : carte de chiffres (§15.7). États : chargement, vide, normal.
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  delta,
  icon,
  loading,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  icon?: React.ReactNode;
  loading?: boolean;
  emphasis?: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-line">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className={cn("border-line", emphasis && "border-primary/40 bg-[#F2F7F4]")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-subtle">{label}</p>
          {icon && <span className="text-primary">{icon}</span>}
        </div>
        <p className={cn("amount font-display mt-2 text-2xl font-bold tracking-tight lg:text-[26px]", emphasis ? "text-primary" : "text-ink")}>
          {value}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          {typeof delta === "number" && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-subtle"
              )}
            >
              {delta > 0 ? <TrendingUp className="h-3.5 w-3.5 tontihelm-icon" aria-hidden /> : delta < 0 ? <TrendingDown className="h-3.5 w-3.5 tontihelm-icon" aria-hidden /> : <Minus className="h-3.5 w-3.5 tontihelm-icon" aria-hidden />}
              {delta > 0 ? "+" : ""}
              {delta} %
            </span>
          )}
          {hint && <p className="text-xs text-subtle">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
