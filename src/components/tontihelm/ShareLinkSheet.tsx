"use client";
// TontiHelm — partage du lien de carnet d'un cotisant (WhatsApp, e-mail, copie).
// Remplace les reçus SMS : le cotisant reçoit UN lien personnel, une fois, et
// consulte son carnet (versements, évolution, statut) à tout moment.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy, ExternalLink, Link2, Mail, MessageCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function shareText(params: {
  contributorName: string;
  structureName: string;
  url: string;
}): string {
  return (
    `Bonjour ${params.contributorName}, ` +
    `voici le lien de ton carnet de tontine (${params.structureName}) : ${params.url} — ` +
    `consulte ton évolution et tes versements à tout moment. Garde ce lien.`
  );
}

export function whatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function mailUrl(email: string, structureName: string, message: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Ton carnet de tontine — ${structureName}`)}&body=${encodeURIComponent(message)}`;
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  url,
  contributorName,
  structureName,
  phone,
  email,
  passbookNumber,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string;
  contributorName: string;
  structureName: string;
  phone?: string | null;
  email?: string | null;
  passbookNumber?: string | null;
}) {
  const [emailInput, setEmailInput] = useState(email ?? "");
  const [copied, setCopied] = useState(false);
  const message = shareText({ contributorName, structureName, url });

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Lien copié.", description: "Colle-le où tu veux (WhatsApp, e-mail…)." });
    } catch {
      toast({ title: "Copie impossible", description: "Copie le lien affiché ci-dessus." });
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Link2 className="h-5 w-5 tontihelm-icon text-primary" aria-hidden />
            Lien du carnet de {contributorName}
          </DialogTitle>
          <DialogDescription>
            {passbookNumber ? `Carnet ${passbookNumber} · ` : ""}
            Envoie ce lien au cotisant : il ouvre son carnet à tout moment, voit chaque versement
            et l&apos;évolution de sa tontine — sans compte ni code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-[#F4F7FB] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Lien personnel</p>
            <p className="mt-1 break-all font-mono text-[13px] leading-relaxed text-ink">{url}</p>
          </div>

          <div className="grid gap-2.5">
            {phone ? (
              <Button
                asChild
                className="h-12 bg-[#128C4A] text-base text-white hover:bg-[#0F7A40]"
              >
                <a href={whatsappUrl(phone, message)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                  Envoyer par WhatsApp
                </a>
              </Button>
            ) : (
              <p className="rounded-md border border-line bg-[#FFF4D6] px-3 py-2 text-xs font-medium text-[#A66A00]">
                Aucun numéro WhatsApp enregistré pour ce cotisant. Copie le lien et envoie-le depuis
                ta propre application.
              </p>
            )}

            <div className="space-y-1.5">
              {phone && (
                <Label htmlFor="share-email" className="text-xs text-subtle">
                  Adresse e-mail (facultatif, pour l&apos;envoi par courriel)
                </Label>
              )}
              <div className="flex gap-2">
                <Input
                  id="share-email"
                  type="email"
                  inputMode="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="client@exemple.bj"
                  className="h-11 border-line"
                />
                <Button
                  asChild
                  variant="outline"
                  className="h-11 shrink-0 border-line"
                  aria-disabled={!emailValid}
                >
                  <a
                    href={
                      emailValid
                        ? mailUrl(emailInput.trim(), structureName, message)
                        : undefined
                    }
                    className={emailValid ? "" : "pointer-events-none opacity-50"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Mail className="h-4 w-4" aria-hidden /> Courriel
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="outline" onClick={copy} className="h-11 border-line">
                {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? "Copié" : "Copier le lien"}
              </Button>
              <Button asChild variant="outline" className="h-11 border-line">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden /> Voir le carnet
                </a>
              </Button>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-subtle">
            Le lien reste valable dans la durée : chaque encaissement de l&apos;agent y apparaît
            immédiatement, même quand le jour est marqué plus tard. Aucun reçu SMS n&apos;est envoyé.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
