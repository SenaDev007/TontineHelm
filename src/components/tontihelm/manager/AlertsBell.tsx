"use client";
// TontiHelm — cloche d'alertes dirigeants (2026-10) : montée en charge du palier.
// « Tu vas scaler » (approche des quotas) et « le plan a switché » (bascule
// automatique du palier supérieur) arrivent ici, avec les compteurs qui ont
// déclenché la décision. S'affiche dans l'en-tête du back-office.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { get, post } from "@/lib/client";
import { PlanEventRow, formatFCFA } from "@/lib/types";
import { Bell, BellRing, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlertsBell() {
  const [events, setEvents] = useState<PlanEventRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    get<{ events: PlanEventRow[]; unread: number }>("/api/manager/alerts")
      .then((d) => {
        setEvents(d.events);
        setUnread(d.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function markRead() {
    try {
      await post("/api/manager/alerts/read", {});
      setUnread(0);
    } catch {
      /* silencieux */
    }
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v && unread > 0) void markRead(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-10 w-10 shrink-0 border-line"
          aria-label={unread > 0 ? `${unread} alerte${unread > 1 ? "s" : ""} de palier non lue${unread > 1 ? "s" : ""}` : "Alertes de palier"}
        >
          {unread > 0 ? <BellRing className="h-4 w-4 text-primary" aria-hidden /> : <Bell className="h-4 w-4 text-subtle" aria-hidden />}
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 border-line bg-white p-0 sm:w-96">
        <div className="border-b border-line px-4 py-3">
          <p className="font-display text-sm font-bold text-ink">Alertes de montée en charge</p>
          <p className="text-xs text-subtle">Cotisants actifs, agents et argent suivi par le système.</p>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {events.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-subtle">
              Aucune alerte pour l&apos;instant. Le système surveille tes quotas et ton volume encaissé.
            </p>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "mb-1.5 rounded-lg border p-3",
                  e.kind === "plan_upgraded"
                    ? "border-[#B5E8E5] bg-[#F6FDFB]"
                    : "border-[#F0D48A]/60 bg-[#FFFCF2]"
                )}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                  <TrendingUp className={cn("h-3.5 w-3.5", e.kind === "plan_upgraded" ? "text-[#00806B]" : "text-[#A66A00]")} aria-hidden />
                  {e.kind === "plan_upgraded" ? "Palier supérieur activé automatiquement" : "Tu approches des limites"}
                  <span className="ml-auto font-normal text-subtle">
                    {new Date(e.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink">{e.message}</p>
                <p className="amount mt-1.5 text-[10px] text-subtle">
                  {e.contributors} cotisants · {e.agents} agents · {formatFCFA(e.volumeMonth)} / 30 j
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
