"use client";
// TontiHelm — signature numérique du client (fin de souscription, 2026-10).
// Le cotisant trace sa signature au doigt (canvas tactile/souris) et saisit son
// nom : il certifie avoir fini de cotiser et avoir pris son argent. Le tracé est
// exporté en PNG léger (redimensionné) avec le nom et l'horodatage.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenLine, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F172A";
  }, []);

  useEffect(() => {
    setup();
    const onResize = () => {
      const had = hasInk;
      setup();
      if (had && value) restore(value);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  // Restitue un dataURL existant (re-render après redimensionnement).
  const restore = (dataUrl: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = dataUrl;
  };

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointOf(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const from = lastPoint.current;
    if (!ctx || !from) return;
    const to = pointOf(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    lastPoint.current = to;
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    exportCanvas();
  };

  /** Exporte le tracé en PNG compact (max 640×200). */
  const exportCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    const scale = Math.min(1, 640 / canvas.width);
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange("");
  };

  return (
    <div className="space-y-2">
      <Label>Ta signature</Label>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className={cn(
            "h-36 w-full touch-none rounded-xl border-2 border-dashed bg-white transition-colors",
            hasInk ? "border-primary/60" : "border-line hover:border-primary/40"
          )}
          role="img"
          aria-label="Zone de signature au doigt"
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-subtle">
            <PenLine className="h-6 w-6 opacity-60" aria-hidden />
            <p className="text-xs font-medium">Signe ici avec ton doigt</p>
          </div>
        )}
        {hasInk && (
          <button
            onClick={clear}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-line bg-white/95 px-2.5 py-1 text-[11px] font-medium text-subtle shadow-sm hover:text-ink"
          >
            <RotateCcw className="h-3 w-3" aria-hidden /> Effacer
          </button>
        )}
      </div>
    </div>
  );
}

/** Zone « nom du signataire » pré-remplie, réutilisable. */
export function SignerNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="signer-name">Ton nom complet (certification)</Label>
      <Input
        id="signer-name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 border-line"
        placeholder="Prénom et nom"
        autoComplete="name"
      />
    </div>
  );
}
