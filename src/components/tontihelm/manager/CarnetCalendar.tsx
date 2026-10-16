"use client";
// TontiHelm — carnet de cotisation en calendrier réel (le cœur du métier).
// Le calendrier est intégralement reconstruit à partir des vraies règles calendaires :
// longueurs de mois réelles, années bissextiles, jours de semaine exacts, chevauchement
// d'années. Le marquage commence strictement à la date de début du cycle (startsOn),
// chaque encaissement se pose sur son jour calendaire réel, et la navigation marche
// de mois en mois et d'année en année — rien n'est codé en dur.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PassbookStatusBadge, MethodBadge } from "../StatusBadge";
import { CarnetData, CarnetCollection, formatFCFA } from "@/lib/types";
import { get } from "@/lib/client";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, CalendarDays, Check, Flag, CircleDashed,
  Ban, Wallet, TrendingUp, CalendarCheck, CalendarX, User, Phone, MapPin, BadgeCheck,
} from "lucide-react";

// ── Règles calendaires réelles (français) ──
const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTH_SHORT = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MS_DAY = 24 * 60 * 60 * 1000;

/** Parse une date ISO en date locale à minuit (la partie date ISO prime). */
function parseLocalDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Clé de jour « YYYY-MM-DD » en heure locale. */
function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Nombre réel de jours du mois (février bissextile inclus). */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** Colonne du premier jour du mois (0 = lundi, calqué sur le calendrier réel). */
function firstWeekdayCol(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

/** Écart en jours entre deux dates calendaires locales (arrondi, insensible à l'heure). */
function diffDays(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / MS_DAY);
}

function addMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

function sameMonth(a: { y: number; m: number }, y: number, m: number): boolean {
  return a.y === y && a.m === m;
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Cellule de jour ──
interface DayCell {
  date: Date;
  inMonth: boolean;
  inCycle: boolean;
  dayIndex: number | null; // jour du cycle (1..cycleDays), si dans le cycle
  isToday: boolean;
  isFuture: boolean;
  isStart: boolean;
  isEnd: boolean;
  net: number; // net encaissé ce jour-là (annulations déduites)
  items: CarnetCollection[];
  marked: boolean; // jour entièrement marqué (net >= mise)
  partial: boolean; // marquage partiel
  missed: boolean; // jour du cycle passé sans marquage
}

export function CarnetCalendar({ passbookId }: { passbookId: string }) {
  const [data, setData] = useState<CarnetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    get<CarnetData>(`/api/manager/passbooks/${passbookId}/carnet`)
      .then((d) => {
        setData(d);
        // Vue initiale : le mois courant réel s'il chevauche le cycle, sinon le mois du début.
        const today = new Date();
        const start = parseLocalDate(d.passbook.startsOn);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d.passbook.cycleDays - 1);
        const startM = { y: start.getFullYear(), m: start.getMonth() };
        const todayM = { y: today.getFullYear(), m: today.getMonth() };
        const coversToday =
          (todayM.y * 12 + todayM.m > startM.y * 12 + startM.m - 1) &&
          (todayM.y * 12 + todayM.m < (end.getFullYear() * 12 + end.getMonth()) + 1);
        setView(coversToday ? todayM : startM);
      })
      .catch(() => setError("Carnet indisponible. Réessaie dans un instant."));
  }, [passbookId]);

  // ── Registre des journées du cycle (multi-jours) : net par journée réelle ──
  const dayNet = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const d of data.days) map.set(d.date, d.net);
    return map;
  }, [data]);

  // ── Écritures indexées par leur journée effective (coversOn, sinon date d'encaissement) ──
  const byDay = useMemo(() => {
    const map = new Map<string, CarnetCollection[]>();
    if (!data) return map;
    for (const c of data.collections) {
      const day = c.coversOn ?? c.collectedAt.slice(0, 10);
      const key = day.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [data]);

  // ── Bornes réelles du cycle ──
  const bounds = useMemo(() => {
    if (!data) return null;
    const start = parseLocalDate(data.passbook.startsOn);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + data.passbook.cycleDays - 1);
    return { start, end };
  }, [data]);

  // ── Matrice calendrier du mois affiché (6 semaines × 7 jours, vraies dates) ──
  // Le marquage vient du registre des journées : chaque jour couvert par un
  // versement est marqué — rattrapage, jour courant comme journées payées d'avance.
  const cells = useMemo<DayCell[]>(() => {
    if (!data || !view || !bounds) return [];
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const first = new Date(view.y, view.m, 1);
    const lead = firstWeekdayCol(view.y, view.m);
    const total = daysInMonth(view.y, view.m);
    const out: DayCell[] = [];
    const dim = { dailyAmount: data.passbook.dailyAmount };
    const nbCells = Math.ceil((lead + total) / 7) * 7;
    for (let i = 0; i < nbCells; i++) {
      const date = new Date(view.y, view.m, 1 - lead + i);
      const key = dateKey(date);
      const items = byDay.get(key) ?? [];
      const net = dayNet.get(key) ?? 0;
      const offset = diffDays(date, bounds.start);
      const inCycle = offset >= 0 && offset < data.passbook.cycleDays;
      const isFuture = date > todayStart;
      const marked = inCycle && net >= dim.dailyAmount && net > 0;
      const partial = inCycle && net > 0 && net < dim.dailyAmount;
      out.push({
        date,
        inMonth: date.getMonth() === view.m,
        inCycle,
        dayIndex: inCycle ? offset + 1 : null,
        isToday: dateKey(todayStart) === key,
        isFuture,
        isStart: offset === 0,
        isEnd: offset === data.passbook.cycleDays - 1,
        net,
        items,
        marked,
        partial,
        missed: inCycle && !isFuture && net <= 0,
      });
    }
    return out;
  }, [data, view, byDay, dayNet, bounds]);

  // ── Statistiques du mois affiché ──
  const monthStats = useMemo(() => {
    const inMonth = cells.filter((c) => c.inMonth);
    const cycleInMonth = inMonth.filter((c) => c.inCycle);
    return {
      marked: cycleInMonth.filter((c) => c.marked).length,
      advance: cycleInMonth.filter((c) => c.marked && c.isFuture).length,
      partial: cycleInMonth.filter((c) => c.partial).length,
      missed: cycleInMonth.filter((c) => c.missed).length,
      upcoming: cycleInMonth.filter((c) => c.isFuture && !c.marked).length,
      collected: inMonth.reduce((s, c) => s + Math.max(0, c.net), 0),
      cycleDaysHere: cycleInMonth.length,
    };
  }, [cells]);

  // ── Onglets des mois couverts par le cycle (dynamique, chevauche les années) ──
  const cycleMonths = useMemo(() => {
    if (!data || !bounds) return [];
    const out: { y: number; m: number }[] = [];
    let cur = { y: bounds.start.getFullYear(), m: bounds.start.getMonth() };
    const last = { y: bounds.end.getFullYear(), m: bounds.end.getMonth() };
    while (cur.y * 12 + cur.m <= last.y * 12 + last.m && out.length < 24) {
      out.push(cur);
      cur = addMonth(cur.y, cur.m, 1);
    }
    return out;
  }, [data, bounds]);

  const selectedCell = useMemo(
    () => (selectedKey ? cells.find((c) => dateKey(c.date) === selectedKey) ?? null : null),
    [cells, selectedKey]
  );

  // Journées payées d'avance sur tout le cycle (marquées au-delà d'aujourd'hui).
  const cycleAdvance = useMemo(() => {
    if (!data) return 0;
    const tKey = dateKey(new Date());
    return data.days.filter((d) => d.date > tKey && d.net >= data.passbook.dailyAmount && d.net > 0).length;
  }, [data]);

  if (error) {
    return (
      <div className="rounded-lg border border-[#F5C6C0] bg-[#FDECEA] p-4 text-sm font-medium text-[#B3261E]" role="alert">
        {error}
      </div>
    );
  }
  if (!data || !view || !bounds) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const pb = data.passbook;
  const today = new Date();
  const commission = data.structure.commissionDays * pb.dailyAmount;
  const progress = Math.round((pb.paidDays / pb.cycleDays) * 100);

  const go = (delta: number) => setView((v) => (v ? addMonth(v.y, v.m, delta) : v));

  return (
    <div className="space-y-4">
      {/* ── En-tête du carnet : identité, règles du cycle, progression ── */}
      <Card className="border-line bg-white">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="amount rounded-md bg-[#EDF2F7] px-2 py-0.5 text-sm font-bold text-primary">
                  Carnet {pb.number}
                </span>
                <PassbookStatusBadge status={pb.status} />
              </div>
              <p className="font-display mt-1.5 text-lg font-bold text-ink">{pb.contributor.fullName}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden /> Agent {pb.agent}</span>
                {pb.contributor.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden /> {pb.contributor.phone}</span>}
                {pb.contributor.neighborhood && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {pb.contributor.neighborhood}</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-subtle">Aujourd&apos;hui</p>
              <p className="font-display text-sm font-bold text-ink">{formatLongDate(today)}</p>
              <p className="amount mt-1 text-sm font-bold text-primary">{formatFCFA(pb.balance)}</p>
              <p className="text-xs text-subtle">solde cumulé</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Mise journalière</p>
              <p className="amount text-sm font-bold text-ink">{formatFCFA(pb.dailyAmount)}</p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Cycle réel</p>
              <p className="text-sm font-bold text-ink">
                {bounds.start.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                {" → "}
                {bounds.end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Commission ({data.structure.commissionDays} j)</p>
              <p className="amount text-sm font-bold text-ink">{formatFCFA(commission)}</p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Restitué en fin de cycle</p>
              <p className="amount text-sm font-bold text-ink">{formatFCFA(pb.cycleTotal - commission)}</p>
            </div>
          </div>

          {/* Progression du marquage sur toute la durée du cycle */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">
                Marquage du cycle : {pb.paidDays}/{pb.cycleDays} jours
              </span>
              <span className="flex items-center gap-3 text-subtle">
                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5 text-primary" aria-hidden /> {pb.paidDays} marqués</span>
                {cycleAdvance > 0 && <span className="inline-flex items-center gap-1 font-medium text-primary/80"><TrendingUp className="h-3.5 w-3.5" aria-hidden /> {cycleAdvance} d&apos;avance</span>}
                {pb.missedDays > 0 && <span className="inline-flex items-center gap-1 font-medium text-danger"><CalendarX className="h-3.5 w-3.5" aria-hidden /> {pb.missedDays} manqués</span>}
              </span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-[#EDF2F7]"
              role="progressbar"
              aria-valuenow={pb.paidDays}
              aria-valuemin={0}
              aria-valuemax={pb.cycleDays}
              aria-label="Jours marqués sur la durée du cycle"
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Barre du mois affiché : navigation réelle, onglets du cycle ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-10 w-10 border-line" onClick={() => go(-1)} aria-label="Mois précédent">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="outline" size="icon" className="h-10 w-10 border-line" onClick={() => go(1)} aria-label="Mois suivant">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="flex-1 text-center">
            <p className="font-display text-lg font-bold text-ink" aria-live="polite">
              {MONTH_NAMES[view.m]} {view.y}
            </p>
            <p className="text-xs text-subtle">
              {monthStats.cycleDaysHere > 0
                ? `${monthStats.cycleDaysHere} jour${monthStats.cycleDaysHere > 1 ? "s" : ""} de cycle dans ce mois`
                : "Aucun jour de cycle dans ce mois"}
            </p>
          </div>
          <Button
            variant="outline"
            className="h-10 border-line px-3 text-xs"
            onClick={() => setView({ y: today.getFullYear(), m: today.getMonth() })}
          >
            <CalendarDays className="h-4 w-4" aria-hidden /> Aujourd&apos;hui
          </Button>
        </div>

        {/* Onglets des mois du cycle (chevauchement d'années géré) */}
        {cycleMonths.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Mois du cycle">
            {cycleMonths.map((cm) => (
              <button
                key={`${cm.y}-${cm.m}`}
                role="tab"
                aria-selected={sameMonth(view, cm.y, cm.m)}
                onClick={() => setView(cm)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  sameMonth(view, cm.y, cm.m)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-line bg-white text-subtle hover:border-primary/40 hover:text-ink"
                )}
              >
                {MONTH_SHORT[cm.m]} {cm.y !== cycleMonths[0].y ? String(cm.y).slice(2) : ""}
              </button>
            ))}
            {/* Raccourci vers le mois réel courant s'il est hors du cycle */}
            {cycleMonths.every((cm) => !sameMonth({ y: today.getFullYear(), m: today.getMonth() }, cm.y, cm.m)) && (
              <button
                onClick={() => setView({ y: today.getFullYear(), m: today.getMonth() })}
                className="rounded-full border border-dashed border-line px-3 py-1 text-xs font-medium text-subtle transition-colors hover:border-primary/40 hover:text-ink"
              >
                {MONTH_SHORT[today.getMonth()]} {String(today.getFullYear()).slice(2)} (aujourd&apos;hui)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Le calendrier réel ── */}
      <Card className="overflow-hidden border-line bg-white">
        <CardContent className="p-0">
          {/* Jours de semaine réels */}
          <div className="grid grid-cols-7 border-b border-line bg-[#F4F7FB]">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-subtle">
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{d.slice(0, 1)}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((c) => {
              const key = dateKey(c.date);
              const selected = selectedKey === key;
              const clickable = c.items.length > 0 || c.inCycle;
              const dayNum = c.date.getDate();
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => setSelectedKey(selected ? null : key)}
                  title={
                    c.marked
                      ? `Jour ${c.dayIndex} — marqué${c.isFuture ? " d'avance" : ""}, ${formatFCFA(c.net)}`
                      : c.missed
                        ? `Jour ${c.dayIndex} — manqué`
                        : c.inCycle
                          ? `Jour ${c.dayIndex}`
                          : "Hors cycle"
                  }
                  aria-label={`${formatLongDate(c.date)}${c.dayIndex ? `, jour ${c.dayIndex} du cycle` : ", hors cycle"}${c.marked ? (c.isFuture ? ", payé d'avance" : ", marqué") : c.missed ? ", manqué" : ""}`}
                  aria-pressed={selected}
                  className={cn(
                    "relative flex min-h-[64px] flex-col items-center justify-start border-b border-r border-line p-1.5 text-left transition-colors md:min-h-[84px] md:p-2",
                    "border-line",
                    !c.inMonth && "bg-[#F0F5FC]",
                    c.inMonth && !c.marked && !c.partial && !c.missed && "bg-white",
                    !c.inCycle && "cursor-default",
                    c.inCycle && !c.marked && !c.missed && "hover:bg-[#EEF4FD]",
                    c.marked && "bg-primary text-primary-foreground",
                    c.partial && "bg-[#DFF6F4]",
                    c.missed && "bg-[#FDECEA]",
                    !clickable && "opacity-60",
                    clickable && "cursor-pointer",
                    selected && "outline outline-2 outline-offset-[-2px] outline-[#FFB800]"
                  )}
                >
                  {/* Numéro du jour calendaire réel */}
                  <span
                    className={cn(
                      "amount flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      !c.inMonth && "text-subtle/40",
                      c.inMonth && !c.marked && "text-ink",
                      c.marked && "bg-white/20 text-primary-foreground",
                      c.isToday && !c.marked && "bg-[#FFB800] text-white"
                    )}
                  >
                    {dayNum}
                  </span>

                  {/* Jour courant (date réelle) */}
                  {c.isToday && (
                    <span className="absolute right-1 top-1 rounded-sm bg-[#FFB800] px-1 text-[9px] font-bold uppercase text-white md:right-1.5 md:top-1.5">
                      Auj.
                    </span>
                  )}

                  {/* Début / fin du cycle posés sur les dates exactes */}
                  {c.isStart && (
                    <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-sm bg-white px-1 text-[9px] font-bold uppercase text-primary shadow-sm md:left-1.5 md:top-1.5">
                      <Flag className="h-2.5 w-2.5" aria-hidden /> Début
                    </span>
                  )}
                  {c.isEnd && (
                    <span className="absolute left-1 bottom-1 rounded-sm bg-white px-1 text-[9px] font-bold uppercase text-danger shadow-sm md:left-1.5 md:bottom-1.5">
                      Fin
                    </span>
                  )}

                  {/* Marquage du jour */}
                  <span className="mt-auto flex w-full flex-col items-center gap-0.5">
                    {c.marked && (
                      <>
                        {c.isFuture && (
                          <span className="rounded-sm bg-white/25 px-1 text-[8px] font-bold uppercase leading-none text-primary-foreground">
                            d'avance
                          </span>
                        )}
                        <Check className="h-4 w-4 md:h-5 md:w-5" strokeWidth={3} aria-hidden />
                        <span className="amount text-[11px] font-bold leading-none md:text-xs">{formatFCFA(c.net).replace("\u00A0FCFA", "")}</span>
                      </>
                    )}
                    {c.partial && (
                      <>
                        <span className="amount text-[11px] font-bold leading-none text-primary md:text-xs">{formatFCFA(c.net).replace("\u00A0FCFA", "")}</span>
                        <span className="text-[9px] font-medium leading-none text-primary/70">partiel</span>
                      </>
                    )}
                    {c.missed && <Ban className="h-3.5 w-3.5 text-danger/70" aria-hidden />}
                    {c.inCycle && !c.marked && !c.partial && !c.missed && c.isFuture && (
                      <CircleDashed className="h-3.5 w-3.5 text-subtle/50" aria-hidden />
                    )}
                  </span>

                  {/* Numéro du jour de cycle, discret */}
                  {c.inCycle && c.dayIndex !== null && (
                    <span className={cn(
                      "absolute bottom-1 right-1 text-[9px] font-semibold leading-none md:bottom-1.5 md:right-1.5",
                      c.marked ? "text-white/80" : "text-subtle/60"
                    )}>
                      J{c.dayIndex}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Légende du marquage */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line bg-[#F4F7FB] px-3 py-2.5 text-[11px] text-subtle">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" aria-hidden /> Jour marqué</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#B5E8E5]" aria-hidden /> Marquage partiel</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary/60" aria-hidden /> Payé d&apos;avance</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#FDECEA]" aria-hidden /> Jour manqué</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-[#FFB800]" aria-hidden /> Aujourd&apos;hui</span>
            <span className="inline-flex items-center gap-1.5"><CircleDashed className="h-3 w-3 text-subtle/50" aria-hidden /> À venir</span>
            <span className="ml-auto hidden sm:inline">J&lt;n&gt; = jour du cycle</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Statistiques du mois affiché ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-white px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle"><CalendarCheck className="h-3.5 w-3.5" aria-hidden /> Marqués</p>
          <p className="amount text-sm font-bold text-ink">{monthStats.marked}<span className="text-subtle">/{monthStats.cycleDaysHere} j</span></p>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle"><Wallet className="h-3.5 w-3.5" aria-hidden /> Encaissé</p>
          <p className="amount text-sm font-bold text-ink">{formatFCFA(monthStats.collected)}</p>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle"><CalendarX className="h-3.5 w-3.5" aria-hidden /> Manqués</p>
          <p className={cn("amount text-sm font-bold", monthStats.missed > 0 ? "text-danger" : "text-ink")}>{monthStats.missed}</p>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle"><TrendingUp className="h-3.5 w-3.5" aria-hidden /> À venir</p>
          <p className="amount text-sm font-bold text-ink">{monthStats.upcoming}</p>
        </div>
      </div>

      {/* ── Détail du jour sélectionné ── */}
      {selectedCell && (
        <Card className="border-line bg-white">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold text-ink">{formatLongDate(selectedCell.date)}</p>
                <p className="text-xs text-subtle">
                  {selectedCell.inCycle
                    ? `Jour ${selectedCell.dayIndex} du cycle · net de la journée : ${formatFCFA(selectedCell.net)}`
                    : "Hors cycle de cotisation"}
                </p>
              </div>
              {selectedCell.marked && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#DFF6F4] px-2 py-1 text-xs font-bold text-primary">
                  <BadgeCheck className="h-4 w-4" aria-hidden />
                  {selectedCell.isFuture ? "Payé d'avance" : "Jour marqué"}
                </span>
              )}
              {selectedCell.missed && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#FDECEA] px-2 py-1 text-xs font-bold text-[#B3261E]">
                  <CalendarX className="h-4 w-4" aria-hidden /> Jour manqué
                </span>
              )}
            </div>

            <Separator className="my-3" />

            {selectedCell.items.length === 0 ? (
              <p className="text-sm text-subtle">
                {selectedCell.missed
                  ? "Aucun versement ce jour-là : la case reste vide dans le carnet."
                  : selectedCell.isFuture
                    ? "Ce jour n'est pas encore arrivé : il sera marqué au moment de l'encaissement."
                    : "Aucune écriture ce jour-là."}
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedCell.items.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F4F7FB] px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <MethodBadge method={it.method} />
                      <span className={cn("amount font-bold", it.amount < 0 ? "text-danger" : "text-ink")}>
                        {it.amount < 0 ? "−" : ""}{formatFCFA(Math.abs(it.amount))}
                      </span>
                      {it.reversesId && <span className="text-[11px] font-medium text-danger">annulation</span>}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-subtle">
                      <span>J{it.dayIndex}</span>
                      <span>encaissé le {new Date(it.collectedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à {new Date(it.collectedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
