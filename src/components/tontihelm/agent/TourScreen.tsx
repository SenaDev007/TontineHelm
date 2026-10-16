"use client";
// TontiHelm — écran Tournée du jour (§15.8) : liste des CollectionRow triée par quartier,
// filtre par quartier en haut. Deux volets en paysage tablette.
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PassbookStatusBadge } from "../StatusBadge";
import { OutboxEvent, TourData, TourStop, formatFCFA } from "@/lib/types";
import { ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollectionRow({
  stop,
  pendingLocal,
  onClick,
}: {
  stop: TourStop;
  pendingLocal: number;
  onClick: () => void;
}) {
  const done = stop.collectedToday !== null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors",
        done
          ? "border-[#B5E8E5] bg-[#E9FAF9]"
          : "border-line bg-surface hover:border-primary/40 hover:bg-[#F0F5FC]"
      )}
      aria-label={`Carnet ${stop.passbookNumber}, ${stop.contributorName}, ${done ? "encaissé" : "à encaisser"}`}
    >
      <span
        className={cn(
          "amount font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
          done ? "bg-success text-white" : "bg-[#EDF2F7] text-ink"
        )}
        aria-hidden
      >
        {done ? <Clock className="h-5 w-5 tontihelm-icon" aria-hidden /> : stop.passbookNumber}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-ink">{stop.contributorName}</p>
          <span className="amount shrink-0 text-[15px] font-bold text-ink">
            {formatFCFA(done ? stop.collectedToday!.amount : stop.dailyAmount)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 tontihelm-icon" aria-hidden />
            {stop.neighborhood}
          </span>
          <span>Jour {stop.dayIndex}/{stop.cycleDays}</span>
          <span>Solde {formatFCFA(stop.balance)}</span>
          {pendingLocal > 0 && (
            <span className="font-medium text-[#A66A00]">{pendingLocal} en attente</span>
          )}
        </div>
        <div className="mt-1.5">
          {done ? (
            <span className="text-xs font-semibold text-success">Encaissé aujourd'hui</span>
          ) : (
            <PassbookStatusBadge status={stop.status} />
          )}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
    </button>
  );
}

export function TourScreen({
  tour,
  loading,
  outbox,
  onOpenStop,
}: {
  tour: TourData | null;
  loading: boolean;
  outbox: OutboxEvent[];
  onOpenStop: (stop: TourStop) => void;
}) {
  const [area, setArea] = useState("all");

  const pendingByStop = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of outbox) map.set(e.passbookId, (map.get(e.passbookId) ?? 0) + 1);
    return map;
  }, [outbox]);

  const stops = useMemo(() => {
    if (!tour) return [];
    return area === "all" ? tour.stops : tour.stops.filter((s) => s.neighborhood === area);
  }, [tour, area]);

  if (loading && !tour) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-11 w-44" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (!tour) return null;

  return (
    <div>
      {/* Résumé du jour */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Card className="border-line"><CardContent className="p-3">
          <p className="text-xs text-subtle">Clients</p>
          <p className="amount font-display text-xl font-bold text-ink">{tour.summary.totalStops}</p>
        </CardContent></Card>
        <Card className="border-line"><CardContent className="p-3">
          <p className="text-xs text-subtle">Encaissés</p>
          <p className="amount font-display text-xl font-bold text-success">{tour.summary.collected}</p>
        </CardContent></Card>
        <Card className="border-line"><CardContent className="p-3">
          <p className="text-xs text-subtle">Restants</p>
          <p className="amount font-display text-xl font-bold text-warning">{tour.summary.remaining}</p>
        </CardContent></Card>
      </div>

      {/* Filtre par quartier */}
      <div className="mb-4">
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="h-12 w-full border-line text-base sm:w-64" aria-label="Filtrer par quartier">
            <SelectValue placeholder="Tous les quartiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-base">Tous les quartiers</SelectItem>
            {tour.neighborhoods.map((n) => (
              <SelectItem key={n} value={n} className="text-base">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <h2 className="font-display mb-3 text-lg font-bold text-ink">
        Tournée du {new Date(tour.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
      </h2>

      <div className="space-y-3">
        {stops.map((s) => (
          <CollectionRow
            key={s.passbookId}
            stop={s}
            pendingLocal={pendingByStop.get(s.passbookId) ?? 0}
            onClick={() => onOpenStop(s)}
          />
        ))}
        {stops.length === 0 && (
          <Card className="border-line">
            <CardContent className="p-8 text-center">
              <p className="text-sm text-subtle">Aucun client dans ce quartier aujourd'hui.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
