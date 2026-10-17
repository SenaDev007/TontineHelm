"use client";
// TontiHelm — module Archive (2026-10) : catalogue des carnets archivés,
// année par année, par quartier et par client. Chaque entrée conserve le numéro
// et le surnom du carnet, les totaux (encaissé, part entreprise, part remise au
// client) et la signature numérique qui a certifié la fin de souscription.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { get } from "@/lib/client";
import { formatFCFA } from "@/lib/types";
import {
  Archive, BadgeCheck, Building2, Landmark, MapPin, Search, User,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ArchiveItem {
  id: string;
  number: string;
  label: string | null;
  dailyAmount: number;
  contributor: { id: string; fullName: string; neighborhood: string | null };
  agent: string;
  completedAt: string | null;
  year: number;
  totalEncaisse: number;
  payoutAmount: number | null;
  companyAmount: number | null;
  signature: { name: string | null; signedAt: string | null };
}

interface ArchiveData {
  years: number[];
  neighborhoods: string[];
  items: ArchiveItem[];
  totals: { count: number; totalEncaisse: number; payoutAmount: number; companyAmount: number };
}

export function ArchiveTab() {
  const [data, setData] = useState<ArchiveData | null>(null);
  const [year, setYear] = useState<string>("all");
  const [neighborhood, setNeighborhood] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (year !== "all") params.set("year", year);
    if (neighborhood !== "all") params.set("neighborhood", neighborhood);
    if (search.trim()) params.set("search", search.trim());
    get<ArchiveData>(`/api/manager/archive${params.size ? `?${params}` : ""}`)
      .then((d) => setData(d))
      .catch(() => toast({ title: "Archive indisponible", description: "Impossible de charger les carnets archivés." }));
  }, [year, neighborhood, search]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-line bg-white p-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-ink">
          <Archive className="h-4 w-4 text-primary" aria-hidden /> Carnets archivés — catalogue annuel
        </p>
        <p className="mt-1 text-xs leading-relaxed text-subtle">
          Chaque carnet dont la souscription est terminée et signée par le client est archivé ici,
          automatiquement : par année, par quartier et par client.
        </p>
        {data.totals.count > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Carnets archivés</p>
              <p className="amount text-sm font-bold text-ink">{data.totals.count}</p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Encaissé (filtré)</p>
              <p className="amount text-sm font-bold text-ink">{formatFCFA(data.totals.totalEncaisse)}</p>
            </div>
            <div className="rounded-lg bg-[#DFF6F4] px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#00806B]">
                <Landmark className="h-3 w-3" aria-hidden /> Remis aux clients
              </p>
              <p className="amount text-sm font-bold text-[#00806B]">{formatFCFA(data.totals.payoutAmount)}</p>
            </div>
            <div className="rounded-lg bg-[#EEF4FD] px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                <Building2 className="h-3 w-3" aria-hidden /> Part entreprise
              </p>
              <p className="amount text-sm font-bold text-primary">{formatFCFA(data.totals.companyAmount)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filtres : année, quartier, recherche */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-11 w-32 border-line" aria-label="Année">
              <SelectValue placeholder="Année" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les années</SelectItem>
              {data.years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={neighborhood} onValueChange={setNeighborhood}>
            <SelectTrigger className="h-11 w-44 border-line" aria-label="Quartier">
              <SelectValue placeholder="Quartier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les quartiers</SelectItem>
              {data.neighborhoods.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client, un numéro ou un surnom de carnet"
            className="h-11 border-line pl-9"
            aria-label="Rechercher dans l'archive"
          />
        </div>
      </div>

      {data.items.length === 0 ? (
        <Card className="border-dashed border-line bg-white">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF2F7] text-primary">
              <Archive className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-display font-bold text-ink">Aucun carnet archivé pour ces critères</p>
            <p className="max-w-md text-sm text-subtle">
              Les carnets apparaissent ici dès que leurs clients ont terminé leur souscription et signé
              la remise sur leur lien de carnet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {data.items.map((it) => (
            <Card key={it.id} className="border-line bg-white">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="amount text-sm font-bold text-ink">
                      Carnet {it.number}{it.label ? <span className="font-normal text-subtle"> · {it.label}</span> : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" aria-hidden /> {it.contributor.fullName}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden /> {it.contributor.neighborhood ?? "—"}</span>
                      <span>Mise {formatFCFA(it.dailyAmount)} · Agent : {it.agent}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Archivé</p>
                    <p className="amount text-sm font-bold text-ink">
                      {it.completedAt
                        ? new Date(it.completedAt).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  <div className="rounded-lg bg-[#F4F7FB] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Encaissé</p>
                    <p className="amount text-sm font-bold text-ink">{formatFCFA(it.totalEncaisse)}</p>
                  </div>
                  <div className="rounded-lg bg-[#DFF6F4] px-3 py-2">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#00806B]">
                      <Landmark className="h-3 w-3" aria-hidden /> Remis au client
                    </p>
                    <p className="amount text-sm font-bold text-[#00806B]">{formatFCFA(it.payoutAmount ?? 0)}</p>
                  </div>
                  <div className="rounded-lg bg-[#EEF4FD] px-3 py-2">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      <Building2 className="h-3 w-3" aria-hidden /> Entreprise
                    </p>
                    <p className="amount text-sm font-bold text-primary">{formatFCFA(it.companyAmount ?? 0)}</p>
                  </div>
                </div>
                {it.signature.name && (
                  <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#F6FDFB] px-3 py-2 text-xs text-[#00806B]">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                    Signé par <span className="font-semibold">{it.signature.name}</span>
                    {it.signature.signedAt
                      ? ` le ${new Date(it.signature.signedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
                      : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
