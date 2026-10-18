"use client";
// TontiHelm — carnet public du cotisant (consultation par lien personnel, 2026-10).
// Le cotisant ouvre ce lien depuis WhatsApp ou son e-mail : il voit son LIVRET
// ANNUEL — 12 feuilles mensuelles (avance/reste, 31e mise entreprise) + la 13e
// feuille de récapitulatif — pour CHACUN de ses carnets, et l'évolution de ses
// versements en temps réel, sans compte ni code. Quand la structure a préparé
// la remise de fin de souscription, il signe ICI (numériquement) pour certifier
// qu'il a fini et pris son argent : le carnet est alors archivé automatiquement.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoMark } from "@/components/tontihelm/Logo";
import { LivretSheets } from "./LivretSheets";
import { SignaturePad } from "./SignaturePad";
import { get, post } from "@/lib/client";
import { PublicCarnetData, formatFCFA } from "@/lib/types";
import {
  AlertCircle, BadgeCheck, Building2, CheckCircle2, FileSignature, Landmark,
  Lock, RefreshCw, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PublicCarnet = PublicCarnetData["passbooks"][number];

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "late"
      ? "border-[#F5C6C0] bg-[#FDECEA] text-[#B3261E]"
      : status === "active"
        ? "border-[#B5E8E5] bg-[#DFF6F4] text-[#00806B]"
        : status === "closing"
          ? "border-[#F0D48A] bg-[#FFF4D6] text-[#A66A00]"
          : status === "completed"
            ? "border-[#9ED9D3] bg-[#DFF6F4] text-[#00806B]"
            : "border-line bg-[#EDF2F7] text-subtle";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", tone)}>
      {status === "closing" ? <FileSignature className="h-3.5 w-3.5" aria-hidden /> : null}
      {status === "completed" ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> : null}
      {label}
    </span>
  );
}

/** Panneau de signature de fin de souscription (status « closing »). */
function SignaturePanel({
  token,
  pb,
  contributorName,
  onSigned,
}: {
  token: string;
  pb: PublicCarnet;
  contributorName: string;
  onSigned: () => void;
}) {
  const [name, setName] = useState(contributorName);
  const [drawing, setDrawing] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign() {
    if (name.trim().length < 2) {
      setError("Saisis ton nom complet pour certifier.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await post(`/api/public/carnets/${token}/sign`, {
        passbookId: pb.id,
        name: name.trim(),
        signature: drawing,
      });
      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature impossible. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mt-4 border-[#F0D48A] bg-[#FFFCF2]">
      <CardContent className="p-4 sm:p-5">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-[#A66A00]">
          <FileSignature className="h-4 w-4" aria-hidden /> Fin de souscription — à signer
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">
          Ta structure a préparé la remise de ton carnet {pb.number}
          {pb.label ? ` « ${pb.label} »` : ""}. En signant, tu certifies avoir <b>fini de cotiser</b> et
          <b> pris ton argent</b>. Le carnet sera alors archivé — ton lien reste ta preuve.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              <Landmark className="h-3 w-3" aria-hidden /> Tu reçois
            </p>
            <p className="amount mt-0.5 text-base font-bold text-[#00806B]">
              {formatFCFA(pb.completion.payoutAmount ?? 0)}
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              <Building2 className="h-3 w-3" aria-hidden /> Part entreprise
            </p>
            <p className="amount mt-0.5 text-base font-bold text-primary">
              {formatFCFA(pb.completion.companyAmount ?? 0)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <SignaturePad value={drawing} onChange={setDrawing} />
          <div className="space-y-1.5">
            <label htmlFor="sign-name" className="text-xs font-semibold text-ink">
              Ton nom complet (certification)
            </label>
            <Input
              id="sign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 border-line bg-white"
              placeholder="Prénom et nom"
              autoComplete="name"
            />
          </div>
          {error && <p className="text-xs font-medium text-danger" role="alert">{error}</p>}
          <Button
            onClick={sign}
            disabled={submitting}
            className="h-12 w-full bg-[#00806B] text-base font-semibold text-white hover:bg-[#006E5C]"
          >
            {submitting ? "Signature en cours…" : "Signer et archiver mon carnet"}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-subtle">
            <Lock className="h-3 w-3" aria-hidden /> Signature liée à ton lien personnel — horodatée par le système.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Carte « carnet signé et archivé ». */
function SignedCard({ pb }: { pb: PublicCarnet }) {
  return (
    <Card className="mt-4 border-[#9ED9D3] bg-[#F6FDFB]">
      <CardContent className="p-4 sm:p-5">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-[#00806B]">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Souscription terminée et signée
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Montant reçu</p>
            <p className="amount mt-0.5 text-base font-bold text-[#00806B]">
              {formatFCFA(pb.completion.payoutAmount ?? 0)}
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Part entreprise</p>
            <p className="amount mt-0.5 text-base font-bold text-primary">
              {formatFCFA(pb.completion.companyAmount ?? 0)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-subtle">
          Signé par <span className="font-semibold text-ink">{pb.completion.signatureName}</span>
          {pb.completion.signedAt
            ? ` le ${new Date(pb.completion.signedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${new Date(pb.completion.signedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
          {" · "}carnet archivé{pb.label ? ` « ${pb.label} »` : ""} — ce lien reste ta preuve.
        </p>
      </CardContent>
    </Card>
  );
}

export function PublicCarnetScreen({ token }: { token: string }) {
  const [data, setData] = useState<PublicCarnetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCarnet, setSelectedCarnet] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await get<PublicCarnetData>(`/api/public/carnets/${token}`);
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Carnet indisponible. Réessaie.");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    // Rafraîchissement périodique : le cotisant laisse l'onglet ouvert, les
    // encaissements de l'agent apparaissent sans rechargement manuel.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const carnetCount = data?.passbooks.length ?? 0;
  // Carnet affiché par défaut : celui choisi, sinon le premier ACTIF (plutôt
  // que le dernier créé) — le client retrouve d'abord sa tontine en cours.
  const active =
    data?.passbooks.find((p) => p.id === selectedCarnet) ??
    data?.passbooks.find((p) => p.status === "active" || p.status === "late" || p.status === "closing") ??
    data?.passbooks[0] ??
    null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* En-tête : structure + cotisant */}
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <LogoMark size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-ink">
              {data?.structure.name ?? "TontiHelm"}
            </p>
            <p className="truncate text-xs text-subtle">
              {data ? `Livret de ${data.contributor.fullName}` : "Carnet de tontine"}
              {data && carnetCount > 1 ? ` · ${carnetCount} carnets` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-line"
            onClick={load}
            disabled={refreshing}
            aria-label="Actualiser le carnet"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-16">
        {error ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FDECEA]">
              <AlertCircle className="h-7 w-7 text-danger" aria-hidden />
            </span>
            <h1 className="font-display mt-4 text-lg font-bold text-ink">Lien de carnet invalide</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-subtle">
              {error} Si tu as reçu ce lien par WhatsApp ou par e-mail, demande-en un nouveau à ton
              agent de collecte ou à ta structure.
            </p>
            <Button variant="outline" className="mt-5 border-line" onClick={load}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
            </Button>
          </div>
        ) : !data ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <>
            {data.passbooks.length === 0 && (
              <div className="rounded-xl border border-line bg-white p-8 text-center shadow-sm">
                <p className="font-display text-lg font-bold text-ink">Aucun carnet pour le moment</p>
                <p className="mt-2 text-sm text-subtle">
                  Ton livret annuel apparaîtra ici dès l&apos;ouverture de ta tontine par la structure.
                </p>
              </div>
            )}

            {/* Plusieurs carnets : sélection — tous regroupés sous le même client */}
            {carnetCount > 1 && (
              <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Mes carnets">
                {data.passbooks.map((p) => (
                  <button
                    key={p.id}
                    role="tab"
                    aria-selected={active?.id === p.id}
                    onClick={() => setSelectedCarnet(p.id)}
                    className={cn(
                      "flex shrink-0 flex-col items-start rounded-xl border px-3.5 py-2 text-left transition-colors",
                      active?.id === p.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-line bg-white text-ink hover:border-primary/40"
                    )}
                  >
                    <span className="amount text-sm font-bold">Carnet {p.number}</span>
                    <span className={cn("text-[11px]", active?.id === p.id ? "text-primary-foreground/80" : "text-subtle")}>
                      {p.label ?? p.statusLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {data.passbooks.map((pb) =>
              active?.id === pb.id ? (
                <section key={pb.id} className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5" aria-label={`Carnet ${pb.number}`}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="amount font-display text-base font-bold text-ink">
                        Carnet {pb.number}
                        {pb.label ? <span className="font-normal text-subtle"> · {pb.label}</span> : null}
                      </p>
                      <p className="text-xs text-subtle">
                        {pb.livret.months === 12
                          ? "Livret annuel · 12 feuilles mensuelles"
                          : `Cycle de ${pb.livret.cycleDays ?? pb.livret.months * 31} jours · ${pb.livret.months} feuille${pb.livret.months > 1 ? "s" : ""}`} · mise {formatFCFA(pb.dailyAmount)}
                      </p>
                    </div>
                    <StatusPill status={pb.status} label={pb.statusLabel} />
                  </div>

                  {/* 12 feuilles mensuelles + 13e feuille de récapitulatif */}
                  <LivretSheets livret={pb.livret} carnetTitle={undefined} />

                  {/* Signature de fin de souscription / carnet archivé */}
                  {pb.status === "closing" && (
                    <SignaturePanel
                      token={token}
                      pb={pb}
                      contributorName={data.contributor.fullName}
                      onSigned={load}
                    />
                  )}
                  {pb.status === "completed" && <SignedCard pb={pb} />}
                </section>
              ) : null
            )}

            <p className="mx-auto mt-6 max-w-md text-center text-[11px] leading-relaxed text-subtle">
              Mis à jour{" "}
              {data.generatedAt
                ? new Date(data.generatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                : ""}
              {" · "}
              actualisation automatique chaque minute.
              <span className="mt-1 flex items-center justify-center gap-1.5">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Ce lien est personnel : garde-le précieusement, il reste valable.
              </span>
            </p>
          </>
        )}
      </main>

      <footer className="border-t border-line bg-white py-4">
        <p className="mx-auto max-w-2xl px-4 text-center text-[11px] text-subtle">
          TontiHelm — la tontine journalière, claire pour tous. Une question ? Contacte ta structure
          de collecte.
        </p>
      </footer>
    </div>
  );
}
