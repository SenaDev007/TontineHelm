"use client";
// TontiHelm — inscription de la structure avec justificatif (M1, écran 10).
// Stepper maison : identité de la structure, puis dirigeant et code PIN.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoMark } from "../Logo";
import { post } from "@/lib/client";
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "sfd", label: "SFD — microfinance décentralisée (arrêté du ministre)" },
  { value: "groupement", label: "Groupement d'épargne (récépissé ou statut)" },
  { value: "pme", label: "PME collectrice (registre de commerce)" },
];

export function RegisterScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);

  const [form, setForm] = useState({
    structureName: "", kind: "", licenseRef: "", licenseDocName: "",
    city: "", ownerName: "", ownerPhone: "", pin: "", pinConfirm: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function next() {
    setError(null);
    if (step === 1) {
      if (form.structureName.trim().length < 2) return setError("Saisis le nom de ta structure.");
      if (!form.kind) return setError("Choisis le type de ta structure.");
      if (form.licenseRef.trim().length < 3) return setError("Saisis ton numéro d'agrément ou de récépissé.");
      if (!form.licenseDocName) return setError("Joins ton justificatif d'agrément.");
      if (form.city.trim().length < 2) return setError("Saisis ta ville.");
    }
    if (step === 2) {
      if (form.ownerName.trim().length < 2) return setError("Saisis ton nom complet.");
      if (form.ownerPhone.replace(/\s+/g, "").length < 8) return setError("Numéro invalide. Saisis ton numéro complet, sans espace.");
      if (!/^\d{6}$/.test(form.pin)) return setError("Le code PIN doit contenir 6 chiffres.");
      if (form.pin !== form.pinConfirm) return setError("Les deux codes PIN ne correspondent pas.");
    }
    setStep((s) => Math.min(3, s + 1));
  }

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await post<{ message: string }>("/api/structures/register", {
        structureName: form.structureName.trim(),
        kind: form.kind,
        licenseRef: form.licenseRef.trim(),
        licenseDocName: form.licenseDocName,
        city: form.city.trim(),
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.replace(/\s+/g, ""),
        pin: form.pin,
      });
      setFinished(true);
      if (res.message) setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inscription impossible. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 md:px-6 lg:px-8">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4 tontihelm-icon" aria-hidden /> Retour au site
          </button>
          <LogoMark size={40} priority />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 items-center justify-center px-4 py-10 md:px-6 lg:px-8">
        {finished ? (
          <Card className="w-full max-w-lg border-line text-center">
            <CardContent className="p-8">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#DFF6F4] text-success">
                <PartyPopper className="h-7 w-7 tontihelm-icon" aria-hidden />
              </span>
              <h1 className="font-display mt-5 text-2xl font-bold text-ink">Inscription envoyée</h1>
              <p className="mt-3 text-base leading-relaxed text-subtle">
                Demande reçue. Nous vérifions ton justificatif d'agrément et nous te répondons sous 24 heures ouvrées.
              </p>
              <Button onClick={onDone} className="mt-6 h-12 bg-primary px-6 text-primary-foreground hover:bg-primary-hover">
                Retour à l'accueil
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-xl animate-scale-in border-line">
            <CardHeader>
              <div className="mb-1 flex justify-center">
                <LogoMark size={64} priority />
              </div>
              <CardTitle className="font-display text-xl font-bold">Inscrire ma structure</CardTitle>
              <p className="text-sm text-subtle">
                Période d'essai de 60 jours activée à la validation de ton justificatif.
              </p>
              {/* Stepper */}
              <div className="mt-4 flex items-center gap-2" aria-hidden>
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex flex-1 items-center gap-2">
                    <span className={cn(
                      "font-display flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      s < step ? "bg-primary text-primary-foreground" : s === step ? "bg-primary text-primary-foreground" : "bg-[#EDF2F7] text-subtle"
                    )}>
                      {s < step ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : s}
                    </span>
                    {s < 3 && <span className={cn("h-px flex-1", s < step ? "bg-primary" : "bg-line")} />}
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sname">Nom de la structure</Label>
                    <Input id="sname" value={form.structureName} onChange={(e) => set("structureName", e.target.value)} className="h-12 border-line text-base" placeholder="Alafia Finance" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type de structure</Label>
                    <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                      <SelectTrigger className="h-12 border-line text-base" aria-label="Type de structure">
                        <SelectValue placeholder="Choisis le type" />
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value} className="text-base">{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lref">Numéro d'agrément, de récépissé ou de RC</Label>
                    <Input id="lref" value={form.licenseRef} onChange={(e) => set("licenseRef", e.target.value)} className="h-12 border-line text-base" placeholder="Arrêté MEF/DC/SG/SFD n° 2021-087" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc">Justificatif d'agrément</Label>
                    <label
                      htmlFor="doc"
                      className="flex h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-[#F4F7FB] px-4 text-sm text-subtle transition-colors hover:border-primary/50 hover:bg-[#EEF4FD]"
                    >
                      <FileUp className="h-5 w-5 tontihelm-icon text-primary" aria-hidden />
                      {form.licenseDocName || "Choisis le fichier PDF ou l'image du justificatif"}
                    </label>
                    <input
                      id="doc" type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only"
                      onChange={(e) => set("licenseDocName", e.target.files?.[0]?.name ?? "")}
                    />
                    <p className="text-xs text-subtle">Préproduction : seul le nom du fichier est conservé.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ville</Label>
                    <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} className="h-12 border-line text-base" placeholder="Parakou" />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="oname">Nom complet du dirigeant</Label>
                    <Input id="oname" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} className="h-12 border-line text-base" placeholder="Kossi Adjovi" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ophone">Numéro de téléphone du dirigeant</Label>
                    <Input id="ophone" inputMode="tel" value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} className="h-12 border-line text-base" placeholder="+229 97 00 00 00" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pin1">Code PIN (6 chiffres)</Label>
                      <Input id="pin1" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} className="amount h-12 border-line text-base" placeholder="••••••" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pin2">Confirme le code PIN</Label>
                      <Input id="pin2" inputMode="numeric" maxLength={6} value={form.pinConfirm} onChange={(e) => set("pinConfirm", e.target.value.replace(/\D/g, ""))} className="amount h-12 border-line text-base" placeholder="••••••" />
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <dl className="divide-y divide-line rounded-lg border border-line">
                    {[
                      ["Structure", form.structureName],
                      ["Type", KINDS.find((k) => k.value === form.kind)?.label ?? ""],
                      ["Agrément", form.licenseRef],
                      ["Justificatif", form.licenseDocName],
                      ["Ville", form.city],
                      ["Dirigeant", `${form.ownerName} · ${form.ownerPhone}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-4 px-4 py-3">
                        <dt className="text-sm text-subtle">{k}</dt>
                        <dd className="text-right text-sm font-medium text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-sm leading-relaxed text-subtle">
                    En envoyant cette demande, tu déclares détenir l'agrément affiché et rester responsable
                    des fonds collectés. TontiHelm ne détient ni ne redistribue aucun fonds.
                  </p>
                </div>
              )}

              {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}

              <div className="flex gap-3">
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="h-12 border-line text-base">
                    Retour
                  </Button>
                )}
                {step < 3 ? (
                  <Button onClick={next} className="h-12 flex-1 bg-primary text-base text-primary-foreground hover:bg-primary-hover">
                    Continuer <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <Button onClick={submit} disabled={loading} className="h-12 flex-1 bg-primary text-base text-primary-foreground hover:bg-primary-hover">
                    {loading ? "Envoi…" : "Envoyer ma demande"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
