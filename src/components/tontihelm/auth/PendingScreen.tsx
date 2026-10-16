"use client";
// TontiHelm — écran d'attente : structure inscrite, en attente de validation manuelle (M1).
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoMark } from "../Logo";
import { SessionUser } from "@/lib/types";
import { Clock, LogOut, ShieldQuestion } from "lucide-react";

export function PendingScreen({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => void;
}) {
  const suspended = user.structureStatus === "suspended";
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-md animate-scale-in border-line text-center">
        <CardContent className="p-8">
          <div className="flex justify-center">
            <LogoMark size={56} priority />
          </div>
          <span className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF4D6] text-warning">
            {suspended ? <ShieldQuestion className="h-7 w-7 tontihelm-icon" aria-hidden /> : <Clock className="h-7 w-7 tontihelm-icon" aria-hidden />}
          </span>
          <h1 className="font-display mt-5 text-xl font-bold text-ink">
            {suspended ? "Compte suspendu" : "Vérification en cours"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-subtle">
            {suspended
              ? `Le compte de ${user.structureName} est suspendu. Contacte le support TontiHelm pour connaître le motif et régulariser la situation.`
              : "Demande reçue. Nous vérifions les informations de ta structure et nous te répondons sous 24 heures ouvrées."}
          </p>
          {!suspended && (
            <p className="mt-2 text-xs text-subtle">
              Structure : <span className="font-medium text-ink">{user.structureName}</span>. Ton espace
              s'active dès la validation de ta structure.
            </p>
          )}
          <Button variant="outline" onClick={onLogout} className="mt-6 border-line">
            <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
