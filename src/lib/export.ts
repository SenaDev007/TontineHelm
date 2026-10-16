"use client";
// TontiHelm — exports réels du back-office : CSV compatible Excel (BOM + « ; »)
// et rapport PDF via la boîte de dialogue d'impression du navigateur
// (Enregistrer au format PDF). Aucune dépendance externe, fonctionne hors ligne.

/** Échappe une valeur pour le format CSV (séparateur « ; », standard Excel FR). */
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Télécharge un tableau 2D en CSV ouvrable directement dans Excel. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const csv = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  // BOM UTF-8 : garantit les accents corrects à l'ouverture dans Excel.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  // Délai court : laisse le toast d'export s'afficher avant que le démarrage du
  // téléchargement ne détourne le focus de la page (certains navigateurs ferment
  // une notification naissante au premier événement de téléchargement).
  setTimeout(() => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 250);
}

export interface ReportColumn {
  header: string;
  align?: "left" | "right";
}

export interface ReportMeta {
  structure: string;
  title: string;
  subtitle?: string;
  generatedBy?: string;
}

/**
 * Ouvre un rapport mis en page (en-tête TontiHelm, structure, tableau) dans une
 * fenêtre d'impression : « Enregistrer au format PDF » produit le PDF final.
 * Fonctionne hors ligne, sans bibliothèque externe.
 */
export function printReport(meta: ReportMeta, columns: ReportColumn[], rows: (string | number | null | undefined)[][]): void {
  const win = window.open("", "_blank", "width=980,height=720");
  if (!win) return;

  const th = columns
    .map((c) => `<th style="text-align:${c.align ?? "left"}">${escapeHtml(c.header)}</th>`)
    .join("");
  const tr = rows
    .map(
      (r) =>
        `<tr>${r
          .map((v, i) => `<td style="text-align:${columns[i]?.align ?? "left"}">${escapeHtml(v)}</td>`)
          .join("")}</tr>`
    )
    .join("");

  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  win.document.write(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.structure)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #172B4D; margin: 0; padding: 24px; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #003887; padding-bottom: 12px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand .mark { width: 34px; height: 34px; }
  .brand b { font-size: 19px; letter-spacing: .2px; }
  .brand small { display: block; color: #64748B; font-size: 11px; }
  h1 { font-size: 17px; margin: 18px 0 2px; }
  .sub { color: #64748B; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { background: #003887; color: #fff; padding: 7px 9px; font-weight: 600; }
  td { padding: 6px 9px; border-bottom: 1px solid #D9E2EC; }
  tr:nth-child(even) td { background: #F4F7FB; }
  tfoot { margin-top: 18px; }
  footer { position: fixed; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; color: #64748B; font-size: 10.5px; border-top: 1px solid #D9E2EC; padding-top: 6px; }
  .num { font-variant-numeric: tabular-nums; }
</style></head><body>
<header>
  <div class="brand">
    <svg class="mark" viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="18" fill="#003887"/>
      <text x="50" y="63" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="40" fill="#FFB800">TH</text>
    </svg>
    <div><b>TontiHelm</b><small>${escapeHtml(meta.structure)}</small></div>
  </div>
  <div style="text-align:right;font-size:11.5px;color:#64748B">Édité le ${today} à ${time}<br>${escapeHtml(meta.generatedBy ?? "Back-office TontiHelm")}</div>
</header>
<h1>${escapeHtml(meta.title)}</h1>
${meta.subtitle ? `<p class="sub">${escapeHtml(meta.subtitle)}</p>` : ""}
<table><thead><tr>${th}</tr></thead><tbody class="num">${tr}</tbody></table>
<footer><span>TontiHelm — un produit de YEHI OR Tech · Parakou, Bénin</span><span>${rows.length} ligne${rows.length > 1 ? "s" : ""}</span></footer>
</body></html>`);
  win.document.close();
  // Laisse le rendu se poser puis ouvre la boîte d'impression (Enregistrer en PDF).
  win.focus();
  setTimeout(() => win.print(), 350);
}

function escapeHtml(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
