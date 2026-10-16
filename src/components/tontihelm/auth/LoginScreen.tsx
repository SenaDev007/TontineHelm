"use client";
// TontiHelm — connexion par téléphone et code PIN (§14.8, écran 1).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { LogoWordmark } from "../Logo";
import { post, setToken } from "@/lib/client";
import { SessionUser } from "@/lib/types";
import { ArrowLeft, LogIn, ShieldCheck } from "lucide-react";

export function LoginScreen({
  onBack,
  onLoggedIn,
}: {
  onBack: () => void;
  onLoggedIn: (user: SessionUser) => void;
}) {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (phone.replace(/\s+/g, "").length < 8) {
      setError("Numéro invalide. Saisis ton numéro complet, sans espace.");
      return;
    }
    if (pin.length !== 6) {
      setError("Saisis ton code PIN à 6 chiffres.");
      return;
    }
    setLoading(true);
    try {
      const res = await post<{ user: SessionUser; token: string }>("/api/auth/login", { phone, pin });
      setToken(res.token);
      onLoggedIn(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 md:px-6 lg:px-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4 tontihelm-icon" aria-hidden /> Retour au site
          </button>
          <LogoWordmark size={28} />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-12 px-4 py-10 md:px-6 lg:px-8">
        <Card className="mx-auto w-full max-w-md border-line">
          <CardHeader>
            <CardTitle className="font-display text-xl font-bold">Connexion</CardTitle>
            <p className="text-sm text-subtle">Numéro de téléphone et code PIN à 6 chiffres.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="phone">Numéro de téléphone</Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+229 97 01 02 03"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 border-line text-base"
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">Code PIN</Label>
                <InputOTP maxLength={6} value={pin} onChange={setPin} id="pin" aria-label="Code PIN à 6 chiffres">
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <p id="login-error" role="alert" className="text-sm font-medium text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-[#0C5A3E]">
                {loading ? "Connexion…" : (<><LogIn className="h-4 w-4" aria-hidden /> Se connecter</>)}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-xl border border-line bg-white p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E7F3EB] text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="font-display text-lg font-bold text-ink">Ton compte est protégé</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-subtle">
              Le code PIN est chiffré côté serveur et chaque session est enregistrée dans le journal
              d&apos;audit de ta structure. Personne d&apos;autre que toi ne peut marquer tes carnets.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-subtle">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                Agents : applique-toi à ta tournée du jour, même hors réseau.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                Gérants : tableaux de bord, carnets et clôtures de caisse.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                Administrateurs : validation des structures et abonnements.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
