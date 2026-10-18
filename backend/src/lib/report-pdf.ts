// TontiHelm — génération PDF des rapports cotisants / encaissements (2026-10).
// Fichier généré CÔTÉ SERVEUR avec pdf-lib (aucune dépendance native → Bun/Railway) :
//   · bandeau de marque (bleu TontiHelm + liseré jaune) en tête de première page,
//     bandeau continu sur les pages suivantes ;
//   · tableau dessiné à la main : en-tête bleu à texte blanc, sections quartier
//     sur fond bleu clair, identités de cotisants fusionnées verticalement au-dessus
//     de leurs carnets multiples, sous-lignes teintées, montants alignés à droite ;
//   · pied de page structuré sur CHAQUE page : structure · mention de génération ·
//     « Page X / N » (numérotation en seconde passe) ;
//   · texte nettoyé WinAnsi (accents français intégraux) et tronqué proprement.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import {
  AuditReport,
  CollectionsReport,
  ContributorsReport,
  formatDateTimeLong,
  formatDayShort,
  formatFcfa,
  formatNumberFr,
  formatTime,
} from "./report";

const PAGE = { w: 841.89, h: 595.28 }; // A4 paysage
const MARGIN = 34;
const FOOTER_LINE_Y = 26;
const BOTTOM_LIMIT = 40;

const B = {
  blue: rgb(0, 0.2196, 0.5294),
  blueSoft: rgb(0.9098, 0.9451, 0.9922),
  yellow: rgb(1, 0.7216, 0),
  ink: rgb(0.1176, 0.1608, 0.2314),
  subtle: rgb(0.3922, 0.4549, 0.5451),
  line: rgb(0.851, 0.8863, 0.9255),
  zebra: rgb(0.9725, 0.9804, 0.9882),
  white: rgb(1, 1, 1),
  teal: rgb(0, 0.502, 0.42),
  red: rgb(0.702, 0.149, 0.1178),
};

/* ── Texte WinAnsi sûr (accents français intégralement couverts) ── */
const WINANSI_EXTRA = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc,
  0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021,
  0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);

function sanitizeText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 10 || code === 13 || code === 9) {
      out += " ";
    } else if ((code >= 32 && code <= 255) || WINANSI_EXTRA.has(code)) {
      out += ch;
    }
    /* caractères hors WinAnsi (émoticônes, etc.) : ignorés */
  }
  return out;
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const t = sanitizeText(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  let cut = t;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

interface Column {
  header: string;
  w: number; // largeur relative
  align: "left" | "right" | "center";
}

interface PainterMeta {
  structure: string;
  city: string | null;
  title: string;
  subtitle: string;
  metaLine: string;
  generatedAt: Date;
}

/** Peintre de rapport : pagination, bandeaux, pieds de page numérotés. */
class PdfReport {
  doc!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  pages: PDFPage[] = [];
  y = 0;

  constructor(private meta: PainterMeta) {}

  async init(): Promise<void> {
    this.doc = await PDFDocument.create();
    this.doc.setTitle(`${this.meta.title} — ${this.meta.structure}`, { showInWindowTitleBar: false });
    this.doc.setAuthor("TontiHelm");
    this.doc.setCreator("TontiHelm (YEHI OR Tech)");
    this.doc.setSubject(this.meta.subtitle);
    this.doc.setProducer("TontiHelm");
    this.doc.setCreationDate(this.meta.generatedAt);
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
  }

  newPage(first: boolean): PDFPage {
    const page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.pages.push(page);
    if (first) {
      // ── Bandeau de marque complet (première page) ──
      page.drawRectangle({ x: 0, y: PAGE.h - 64, width: PAGE.w, height: 64, color: B.blue });
      page.drawRectangle({ x: 0, y: PAGE.h - 67, width: PAGE.w, height: 3, color: B.yellow });
      // Mot de marque + titre.
      page.drawRectangle({ x: MARGIN, y: PAGE.h - 34, width: 9, height: 9, color: B.yellow });
      page.drawText(sanitizeText("TONTIHELM"), {
        x: MARGIN + 16, y: PAGE.h - 33.5, size: 16, font: this.bold, color: B.white,
      });
      page.drawText(sanitizeText(this.meta.subtitle), {
        x: MARGIN, y: PAGE.h - 50, size: 10.5, font: this.font, color: rgb(0.85, 0.9, 0.98),
      });
      // Structure à droite.
      const nameText = fitText(this.meta.structure, this.bold, 11.5, 420);
      page.drawText(nameText, {
        x: PAGE.w - MARGIN - this.bold.widthOfTextAtSize(nameText, 11.5),
        y: PAGE.h - 30, size: 11.5, font: this.bold, color: B.white,
      });
      const cityLine = sanitizeText(
        `${this.meta.city ? `${this.meta.city} · ` : ""}Généré le ${formatDateTimeLong(this.meta.generatedAt)}`
      );
      const cityFitted = fitText(cityLine, this.font, 7.5, 460);
      page.drawText(cityFitted, {
        x: PAGE.w - MARGIN - this.font.widthOfTextAtSize(cityFitted, 7.5),
        y: PAGE.h - 44, size: 7.5, font: this.font, color: rgb(0.78, 0.85, 0.96),
      });
      // Ligne méta sous le bandeau.
      const metaFitted = fitText(sanitizeText(this.meta.metaLine), this.font, 8, PAGE.w - 2 * MARGIN);
      page.drawText(metaFitted, {
        x: MARGIN, y: PAGE.h - 84, size: 8, font: this.font, color: B.subtle,
      });
      this.y = PAGE.h - 96;
    } else {
      // ── Bandeau continu (pages suivantes) ──
      page.drawRectangle({ x: 0, y: PAGE.h - 28, width: PAGE.w, height: 28, color: B.blue });
      page.drawRectangle({ x: 0, y: PAGE.h - 30, width: PAGE.w, height: 2, color: B.yellow });
      const left = fitText(`TontiHelm — ${this.meta.subtitle}`, this.bold, 9, 500);
      page.drawText(sanitizeText(left), {
        x: MARGIN, y: PAGE.h - 18.5, size: 9, font: this.bold, color: B.white,
      });
      const right = fitText(this.meta.structure, this.font, 9, 260);
      page.drawText(sanitizeText(right), {
        x: PAGE.w - MARGIN - this.font.widthOfTextAtSize(sanitizeText(right), 9),
        y: PAGE.h - 18.5, size: 9, font: this.font, color: rgb(0.85, 0.9, 0.98),
      });
      this.y = PAGE.h - 42;
    }
    return page;
  }

  /** Garantit `h` points d'espace ; sinon nouvelle page + ré-en-tête du tableau. */
  ensure(h: number, redrawHeader: () => void): void {
    if (this.y - h < BOTTOM_LIMIT) {
      this.newPage(false);
      redrawHeader();
    }
  }

  text(
    page: PDFPage,
    raw: string,
    xLeft: number,
    width: number,
    baselineY: number,
    opts: { size: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center" },
  ): void {
    const font = opts.font ?? this.font;
    const text = fitText(raw, font, opts.size, Math.max(4, width - 8));
    const w = font.widthOfTextAtSize(text, opts.size);
    const x =
      opts.align === "right" ? xLeft + width - 4 - w
      : opts.align === "center" ? xLeft + (width - w) / 2
      : xLeft + 4;
    page.drawText(text, { x, y: baselineY, size: opts.size, font, color: opts.color ?? B.ink });
  }

  /** Cellule : fond + bordure + texte centré verticalement. */
  cell(
    page: PDFPage,
    x: number,
    cellBottom: number,
    w: number,
    h: number,
    value: string,
    opts: {
      size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center";
      bg?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; borderWidth?: number;
    } = {},
  ): void {
    page.drawRectangle({
      x, y: cellBottom, width: w, height: h,
      color: opts.bg ?? B.white,
      borderColor: opts.border ?? B.line,
      borderWidth: opts.borderWidth ?? 0.5,
    });
    const size = opts.size ?? 8;
    this.text(page, value, x, w, cellBottom + h / 2 - size * 0.36, {
      size, font: opts.font, color: opts.color, align: opts.align,
    });
  }

  /** En-tête du tableau (répété sur chaque page). */
  tableHeader(page: PDFPage, xs: number[], cols: Column[], height = 16): void {
    page.drawRectangle({ x: MARGIN, y: this.y - height, width: PAGE.w - 2 * MARGIN, height, color: B.blue });
    cols.forEach((c, i) => {
      this.text(page, c.header.toUpperCase(), xs[i], c.w, this.y - height / 2 - 3.6, {
        size: 6.6, font: this.bold, color: B.white, align: c.align,
      });
    });
    this.y -= height;
  }

  /** Seconde passe : pieds de page structurés + pagination sur TOUTES les pages. */
  async finish(): Promise<Uint8Array> {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      page.drawLine({
        start: { x: MARGIN, y: FOOTER_LINE_Y },
        end: { x: PAGE.w - MARGIN, y: FOOTER_LINE_Y },
        thickness: 0.5,
        color: B.line,
      });
      this.text(page, `TontiHelm — ${this.meta.structure}`, MARGIN, 320, 16, {
        size: 7, color: B.subtle, align: "left",
      });
      this.text(
        page,
        `Document généré automatiquement · ${formatDayShort(this.meta.generatedAt)}`,
        (PAGE.w - 300) / 2,
        300,
        16,
        { size: 7, color: B.subtle, align: "center" },
      );
      this.text(page, `Page ${i + 1} / ${total}`, PAGE.w - MARGIN - 90, 90, 16, {
        size: 7, font: this.bold, color: B.ink, align: "right",
      });
    });
    return this.doc.save();
  }
}

/** Position x de chaque colonne, largeurs normalisées à la largeur utile. */
function layoutColumns(cols: Column[]): { xs: number[]; widths: number[] } {
  const usable = PAGE.w - 2 * MARGIN;
  const total = cols.reduce((s, c) => s + c.w, 0);
  const widths = cols.map((c) => (c.w / total) * usable);
  const xs: number[] = [];
  let x = MARGIN;
  for (const w of widths) {
    xs.push(x);
    x += w;
  }
  return { xs, widths };
}

/* ── Rapport des cotisants ── */

const CONTRIB_COLS: Column[] = [
  { header: "Nom complet", w: 158, align: "left" },
  { header: "Téléphone", w: 72, align: "left" },
  { header: "N° carnet", w: 44, align: "center" },
  { header: "Surnom", w: 66, align: "left" },
  { header: "Mise / jour", w: 60, align: "right" },
  { header: "Mises versées", w: 62, align: "right" },
  { header: "Solde cumulé", w: 76, align: "right" },
  { header: "Carnet créé le", w: 62, align: "center" },
  { header: "Compte créé le", w: 62, align: "center" },
  { header: "Statut", w: 72, align: "left" },
];

const ROW_H = 14.5;
const SECTION_H = 15;

export async function contributorsPdf(report: ContributorsReport): Promise<Uint8Array> {
  const painter = new PdfReport({
    structure: report.structure.name,
    city: report.structure.city,
    title: "Liste des cotisants",
    subtitle: "Liste des cotisants — groupés par quartier",
    metaLine:
      `${formatNumberFr(report.totals.cotisants)} cotisants · ${formatNumberFr(report.totals.carnets)} carnets (livrets) · ` +
      `${report.totals.quartiers} quartiers · Solde cumulé : ${formatFcfa(report.totals.solde)} · ` +
      `${formatNumberFr(report.totals.mises)} mises versées`,
    generatedAt: report.generatedAt,
  });
  await painter.init();
  painter.newPage(true);
  const { xs, widths } = layoutColumns(CONTRIB_COLS);
  const IDENTITY = [0, 1, 8]; // Nom, Téléphone, Compte créé — fusionnés par cotisant

  const cur = () => painter.pages[painter.pages.length - 1];
  const drawHeader = () => painter.tableHeader(cur(), xs, CONTRIB_COLS);

  drawHeader();

  for (const group of report.groups) {
    painter.ensure(SECTION_H, drawHeader);
    const p = cur();
    const label =
      `QUARTIER · ${group.neighborhood.toUpperCase()} — ${group.cotisants} cotisant${group.cotisants > 1 ? "s" : ""} · ` +
      `${formatNumberFr(group.carnets)} carnet${group.carnets > 1 ? "s" : ""} · ${formatNumberFr(group.mises)} mises versées · ` +
      `${formatFcfa(group.solde)} cumulés`;
    p.drawRectangle({
      x: MARGIN, y: painter.y - SECTION_H, width: PAGE.w - 2 * MARGIN, height: SECTION_H,
      color: B.blueSoft, borderColor: B.blueSoft, borderWidth: 0.5,
    });
    painter.text(p, label, MARGIN, PAGE.w - 2 * MARGIN, painter.y - SECTION_H / 2 - 3.4, {
      size: 7.4, font: painter.bold, color: B.blue, align: "left",
    });
    painter.y -= SECTION_H;

    for (const entry of group.entries) {
      const blockRows = Math.max(1, entry.carnets.length);
      const blockH = blockRows * ROW_H;
      painter.ensure(blockH, drawHeader);
      const p2 = cur();

      // Cellules d'identité : fusionnées verticalement sur tout le bloc.
      for (const colIdx of IDENTITY) {
        const value =
          colIdx === 0 ? entry.fullName
          : colIdx === 1 ? (entry.phone ?? "—")
          : formatDayShort(entry.createdAt);
        painter.cell(
          p2, xs[colIdx], painter.y - blockH, widths[colIdx], blockH, value,
          {
            size: colIdx === 0 ? 8.4 : 7.4,
            font: colIdx === 0 ? painter.bold : painter.font,
            color: colIdx === 0 ? B.ink : B.subtle,
            align: colIdx === 8 ? "center" : "left",
          },
        );
      }

      // Lignes carnet « sous » le cotisant.
      for (let k = 0; k < blockRows; k += 1) {
        const carnet = entry.carnets[k] ?? null;
        const rowBottom = painter.y - (k + 1) * ROW_H;
        const sub = k > 0;
        const values: { col: number; value: string; opts?: Parameters<PdfReport["cell"]>[6] }[] = [
          { col: 2, value: carnet?.number ?? "—", opts: { align: "center", size: 8, font: painter.bold } },
          { col: 3, value: carnet?.label ?? "", opts: { size: 7.6, color: B.subtle } },
          { col: 4, value: carnet ? formatFcfa(carnet.dailyAmount) : "", opts: { align: "right", size: 7.8 } },
          { col: 5, value: carnet ? `${formatNumberFr(carnet.coveredLines)}/372` : "", opts: { align: "right", size: 7.8 } },
          { col: 6, value: carnet ? formatFcfa(carnet.balance) : "", opts: { align: "right", size: 7.8, font: painter.bold } },
          { col: 7, value: carnet ? formatDayShort(carnet.createdAt) : "", opts: { align: "center", size: 7.4, color: B.subtle } },
          {
            col: 9,
            value: carnet?.statusLabel ?? (k === 0 ? "Aucun carnet" : ""),
            opts: {
              size: 7.2,
              color: carnet?.statusLabel === "En retard" ? B.red : carnet?.statusLabel === "À jour" ? B.teal : B.subtle,
            },
          },
        ];
        for (const v of values) {
          painter.cell(p2, xs[v.col], rowBottom, widths[v.col], ROW_H, v.value, {
            bg: sub ? B.zebra : B.white,
            ...(v.opts ?? {}),
          });
        }
      }
      painter.y -= blockH;
    }
  }

  // Totaux généraux.
  painter.ensure(SECTION_H + 4, drawHeader);
  const pt = cur();
  pt.drawRectangle({
    x: MARGIN, y: painter.y - SECTION_H - 4, width: PAGE.w - 2 * MARGIN, height: SECTION_H + 4,
    color: B.blueSoft, borderColor: B.blueSoft, borderWidth: 0.5,
  });
  painter.text(
    pt,
    `TOTAL GÉNÉRAL — ${formatNumberFr(report.totals.cotisants)} cotisants · ${formatNumberFr(report.totals.carnets)} carnets · ${formatNumberFr(report.totals.mises)} mises versées · ${formatFcfa(report.totals.solde)} cumulés`,
    MARGIN, PAGE.w - 2 * MARGIN, painter.y - (SECTION_H + 4) / 2 - 3.6,
    { size: 7.8, font: painter.bold, color: B.blue, align: "left" },
  );

  return painter.finish();
}

/* ── Rapport des encaissements ── */

const COLLECT_COLS: Column[] = [
  { header: "Date", w: 56, align: "center" },
  { header: "Heure", w: 42, align: "center" },
  { header: "Cotisant", w: 148, align: "left" },
  { header: "Carnet", w: 46, align: "center" },
  { header: "Agent", w: 96, align: "left" },
  { header: "Quartier", w: 88, align: "left" },
  { header: "Ligne", w: 38, align: "right" },
  { header: "Mode", w: 66, align: "left" },
  { header: "Montant", w: 82, align: "right" },
  { header: "Type", w: 60, align: "left" },
];

export async function collectionsPdf(report: CollectionsReport): Promise<Uint8Array> {
  const painter = new PdfReport({
    structure: report.structure.name,
    city: report.structure.city,
    title: "Historique des encaissements",
    subtitle: "Historique des encaissements",
    metaLine:
      `Période : ${report.period.label} · ${report.methodLabel} · ` +
      `${formatNumberFr(report.totals.versements)} versements · Espèces : ${formatFcfa(report.totals.cash)} · ` +
      `Mobile money : ${formatFcfa(report.totals.mobile)} · Net encaissé : ${formatFcfa(report.totals.net)}` +
      (report.totals.annulations > 0 ? ` · ${report.totals.annulations} annulation${report.totals.annulations > 1 ? "s" : ""}` : ""),
    generatedAt: report.generatedAt,
  });
  await painter.init();
  painter.newPage(true);
  const { xs, widths } = layoutColumns(COLLECT_COLS);
  const ROW_H = 13.5;

  const drawHeader = () => painter.tableHeader(painter.pages[painter.pages.length - 1], xs, COLLECT_COLS);
  drawHeader();

  if (report.rows.length === 0) {
    const p = painter.pages[painter.pages.length - 1];
    painter.cell(p, MARGIN, painter.y - 30, PAGE.w - 2 * MARGIN, 30, "Aucun encaissement sur cette période.", {
      size: 9, color: B.subtle, align: "center", bg: B.zebra,
    });
  }

  report.rows.forEach((row, idx) => {
    painter.ensure(ROW_H, drawHeader);
    const p = painter.pages[painter.pages.length - 1];
    const bottom = painter.y - ROW_H;
    const zebra = idx % 2 === 1 ? B.zebra : B.white;
    const values: { col: number; value: string; opts?: Parameters<PdfReport["cell"]>[6] }[] = [
      { col: 0, value: formatDayShort(row.at), opts: { align: "center", size: 7.6, color: B.subtle } },
      { col: 1, value: formatTime(row.at), opts: { align: "center", size: 7.6, color: B.subtle } },
      { col: 2, value: row.contributor, opts: { size: 8, font: row.reversal ? painter.font : painter.bold, color: row.reversal ? B.red : B.ink } },
      { col: 3, value: row.passbook, opts: { align: "center", size: 7.8 } },
      { col: 4, value: row.agent, opts: { size: 7.6, color: B.subtle } },
      { col: 5, value: row.neighborhood, opts: { size: 7.6, color: B.subtle } },
      { col: 6, value: String(row.line), opts: { align: "right", size: 7.6, color: B.subtle } },
      { col: 7, value: row.method === "cash" ? "Espèces" : "Mobile money", opts: { size: 7.6 } },
      { col: 8, value: formatFcfa(row.amount), opts: { align: "right", size: 8, font: painter.bold, color: row.reversal ? B.red : B.ink } },
      { col: 9, value: row.reversal ? "Annulation" : "Versement", opts: { size: 7.2, color: row.reversal ? B.red : B.subtle, font: row.reversal ? painter.bold : painter.font } },
    ];
    for (const v of values) {
      painter.cell(p, xs[v.col], bottom, widths[v.col], ROW_H, v.value, { bg: zebra, ...(v.opts ?? {}) });
    }
    painter.y -= ROW_H;
  });

  // Totaux de la période.
  painter.ensure(20, drawHeader);
  const p = painter.pages[painter.pages.length - 1];
  p.drawRectangle({
    x: MARGIN, y: painter.y - 20, width: PAGE.w - 2 * MARGIN, height: 20,
    color: B.blueSoft, borderColor: B.blueSoft, borderWidth: 0.5,
  });
  const totalLabel =
    `TOTAL DE LA PÉRIODE — ${formatNumberFr(report.totals.versements)} versements · ` +
    `Espèces : ${formatFcfa(report.totals.cash)} · Mobile money : ${formatFcfa(report.totals.mobile)} · ` +
    `Net encaissé : ${formatFcfa(report.totals.net)}`;
  painter.text(p, totalLabel, MARGIN, PAGE.w - 2 * MARGIN - 90, painter.y - 12.6, {
    size: 7.8, font: painter.bold, color: B.blue, align: "left",
  });
  painter.text(p, formatFcfa(report.totals.net), xs[8], widths[8], painter.y - 12.6, {
    size: 8, font: painter.bold, color: B.ink, align: "right",
  });

  return painter.finish();
}

/* ── Journal d'audit (décision n° 10, PARITE.md §8.15) ── */

const AUDIT_COLS: Column[] = [
  { header: "N°", w: 30, align: "right" },
  { header: "Date", w: 52, align: "center" },
  { header: "Heure", w: 38, align: "center" },
  { header: "Auteur", w: 100, align: "left" },
  { header: "Rôle", w: 55, align: "left" },
  { header: "Action", w: 90, align: "left" },
  { header: "Entité", w: 65, align: "left" },
  { header: "Détail", w: 234, align: "left" },
  { header: "Hash", w: 100, align: "left" },
];

export async function auditPdf(report: AuditReport): Promise<Uint8Array> {
  const painter = new PdfReport({
    structure: report.structure.name,
    city: report.structure.city,
    title: "Journal d'audit",
    subtitle: "Journal d'audit",
    metaLine:
      `Période : ${report.period.label} · ${report.actionFilter ? `action « ${report.actionFilter} » · ` : ""}` +
      `${formatNumberFr(report.totals.rows)} lignes · ${report.totals.actions} type${report.totals.actions > 1 ? "s" : ""} d'action · ` +
      `chaîne ${report.chainOk ? "INTACTE" : "INTERROMPUE"}`,
    generatedAt: report.generatedAt,
  });
  await painter.init();
  painter.newPage(true);
  const { xs, widths } = layoutColumns(AUDIT_COLS);
  const ROW_H = 13.5;

  const drawHeader = () => painter.tableHeader(painter.pages[painter.pages.length - 1], xs, AUDIT_COLS);
  drawHeader();

  if (report.rows.length === 0) {
    const p = painter.pages[painter.pages.length - 1];
    painter.cell(p, MARGIN, painter.y - 30, PAGE.w - 2 * MARGIN, 30, "Aucune entrée pour ces filtres.", {
      size: 9, color: B.subtle, align: "center", bg: B.zebra,
    });
  }

  report.rows.forEach((row, idx) => {
    painter.ensure(ROW_H, drawHeader);
    const p = painter.pages[painter.pages.length - 1];
    const bottom = painter.y - ROW_H;
    const zebra = idx % 2 === 1 ? B.zebra : B.white;
    const values: { col: number; value: string; opts?: Parameters<PdfReport["cell"]>[6] }[] = [
      { col: 0, value: formatNumberFr(row.seq), opts: { align: "right", size: 7.6, color: B.subtle } },
      { col: 1, value: formatDayShort(row.at), opts: { align: "center", size: 7.6, color: B.subtle } },
      { col: 2, value: formatTime(row.at), opts: { align: "center", size: 7.6, color: B.subtle } },
      { col: 3, value: row.actor, opts: { size: 8, font: painter.bold } },
      { col: 4, value: roleLabel(row.actorRole), opts: { size: 7.2, color: B.subtle } },
      { col: 5, value: row.action, opts: { size: 7.6 } },
      { col: 6, value: row.entity, opts: { size: 7.6, color: B.subtle } },
      { col: 7, value: row.payload, opts: { size: 6.8, color: B.subtle } },
      { col: 8, value: `${row.hash.slice(0, 16)}…`, opts: { size: 6.8, color: B.subtle } },
    ];
    for (const v of values) {
      painter.cell(p, xs[v.col], bottom, widths[v.col], ROW_H, v.value, { bg: zebra, ...(v.opts ?? {}) });
    }
    painter.y -= ROW_H;
  });

  // Totaux + état de la chaîne.
  painter.ensure(20, drawHeader);
  const p = painter.pages[painter.pages.length - 1];
  p.drawRectangle({
    x: MARGIN, y: painter.y - 20, width: PAGE.w - 2 * MARGIN, height: 20,
    color: B.blueSoft, borderColor: B.blueSoft, borderWidth: 0.5,
  });
  const totalLabel =
    `TOTAL DU JOURNAL — ${formatNumberFr(report.totals.rows)} lignes · ${report.totals.actions} type${report.totals.actions > 1 ? "s" : ""} d'action · ` +
    `chaîne d'audit ${report.chainOk ? "intacte" : "INTERROMPUE"}`;
  painter.text(p, totalLabel, MARGIN, PAGE.w - 2 * MARGIN - 90, painter.y - 12.6, {
    size: 7.8, font: painter.bold, color: report.chainOk ? B.blue : B.red, align: "left",
  });
  painter.text(p, report.chainOk ? "Vérifiée" : "À inspecter", PAGE.w - MARGIN - 90, 90, painter.y - 12.6, {
    size: 8, font: painter.bold, color: report.chainOk ? B.teal : B.red, align: "right",
  });

  return painter.finish();
}

function roleLabel(role: string): string {
  switch (role) {
    case "owner": return "propriétaire";
    case "manager": return "gérante";
    case "agent": return "agent";
    case "controller": return "contrôleur";
    case "admin": return "admin";
    default: return "système";
  }
}
