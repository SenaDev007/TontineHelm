"use client";
// TontiHelm — écran Compte de l'agent : profil, appareil, synchronisation, simulation hors réseau.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { OutboxEvent, SessionUser, TourData, formatFCFA } from "@/lib/types";
import { LogOut, RefreshCw, Smartphone, WifiOff, Phone, UserCircle2, Building2 } from "lucide-react";

export function AccountScreen({
  user,
  tour,
  outbox,
  simOffline,
  onToggleSimOffline,
  onFlush,
  onLogout,
}: {
  user: SessionUser;
  tour: TourData | null;
  outbox: OutboxEvent[];
  simOffline: boolean;
  onToggleSimOffline: (value: boolean) => void;
  onFlush: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink">Mon compte</h2>

      <Card className="border-line">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF3EE] text-primary">
              <UserCircle2 className="h-6 w-6 tontihelm-icon" aria-hidden />
            </span>
            <div>
              <p className="text-base font-semibold text-ink">{user.fullName}</p>
              <p className="amount text-sm text-subtle">{user.phone}</p>
            </div>
          </div>
          <Separator className="my-4" />
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-subtle">
                <Building2 className="h-4 w-4 tontihelm-icon" aria-hidden /> Structure
              </dt>
              <dd className="font-medium text-ink">{user.structureName ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-subtle">
                <Smartphone className="h-4 w-4 tontihelm-icon" aria-hidden /> Appareil enregistré
              </dt>
              <dd className="font-medium text-ink">Android · ce téléphone</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-subtle">
                <Phone className="h-4 w-4 tontihelm-icon" aria-hidden /> Code PIN
              </dt>
              <dd className="font-medium text-ink">•••••• (6 chiffres)</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="border-line">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base font-bold">Synchronisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-[#F7F8F5] px-3 py-2.5 text-sm">
            <span className="text-subtle">Encaissements en attente d'envoi</span>
            <span className="amount font-semibold text-ink">{outbox.length}</span>
          </div>
          {outbox.length > 0 && (
            <ul className="space-y-1.5">
              {outbox.slice(0, 5).map((e) => (
                <li key={e.id} className="flex justify-between text-xs text-subtle">
                  <span>Carnet {e.passbookNumber} · {e.contributorName}</span>
                  <span className="amount">{formatFCFA(e.amount)}</span>
                </li>
              ))}
              {outbox.length > 5 && <li className="text-xs text-subtle">… et {outbox.length - 5} autres</li>}
            </ul>
          )}
          <Button
            variant="outline"
            onClick={onFlush}
            disabled={outbox.length === 0 || simOffline}
            className="w-full border-primary text-primary hover:bg-[#EDF3EE] hover:text-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Envoyer maintenant
          </Button>

          <div className="flex items-center justify-between rounded-lg border border-dashed border-line px-4 py-3">
            <div>
              <Label htmlFor="simoff" className="flex items-center gap-2 text-sm font-medium text-ink">
                <WifiOff className="h-4 w-4 tontihelm-icon text-warning" aria-hidden />
                Simuler l'absence de réseau
              </Label>
              <p className="mt-0.5 text-xs text-subtle">
                Démo : les encaissements restent sur le téléphone puis partent au retour.
              </p>
            </div>
            <Switch id="simoff" checked={simOffline} onCheckedChange={onToggleSimOffline} />
          </div>
        </CardContent>
      </Card>

      {tour && (
        <Card className="border-line">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-ink">Tournée du jour</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="amount font-display text-lg font-bold text-ink">{tour.summary.totalStops}</p>
                <p className="text-xs text-subtle">clients</p>
              </div>
              <div>
                <p className="amount font-display text-lg font-bold text-success">{tour.summary.collected}</p>
                <p className="text-xs text-subtle">encaissés</p>
              </div>
              <div>
                <p className="amount font-display text-lg font-bold text-ink">
                  {formatFCFA(tour.summary.expectedCash + tour.summary.mobileToday)}
                </p>
                <p className="text-xs text-subtle">collectés</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={onLogout} className="w-full border-line text-danger hover:bg-[#FBEAE7] hover:text-danger">
        <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
      </Button>
    </div>
  );
}
