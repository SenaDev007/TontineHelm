// TontiHelm — export PDF / Excel des rapports (2026-10).
// Les fichiers sont générés CÔTÉ SERVEUR (design de marque : en-têtes, tableaux,
// sections par quartier, totaux, pieds de page paginés) :
//   · GET /api/manager/export/contributors?format=pdf|xlsx
//       Liste de TOUS les cotisants, groupée automatiquement par quartier —
//       nom, téléphone, quartier, numéro (et surnom) de chaque carnet sous le
//       cotisant, mises versées, solde, dates de création (compte et carnet).
//   · GET /api/manager/export/collections?format=pdf|xlsx&from=AAAA-MM-JJ&to=AAAA-MM-JJ[&method=]
//       Historique des paiements sur la période (bornes incluses).
//   · GET /api/manager/export/audit?format=pdf|xlsx[&action=&from=&to=]
//       Journal d'audit complet (décision n° 10, PARITE.md §8.15) : chaîne de
//       hash, filtre d'action et période, mêmes générateurs de marque.
import { Router } from "express";
import { requireUser, requireRole, requireTenant, ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { buildAuditReport, buildCollectionsReport, buildContributorsReport, parseDayParam } from "../lib/report";
import { auditXlsx, collectionsXlsx, contributorsXlsx } from "../lib/report-xlsx";
import { auditPdf, collectionsPdf, contributorsPdf } from "../lib/report-pdf";

const router = Router();

type Format = "pdf" | "xlsx";

function formatOf(req: { query: Record<string, unknown> }): Format {
  return req.query.format === "xlsx" ? "xlsx" : "pdf";
}

function stampDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Pose les en-têtes de téléchargement (nom ASCII + nom UTF-8 exact). */
function setDownloadHeaders(res: import("express").Response, filename: string, format: Format): void {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader("Content-Type",
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf"
  );
  res.setHeader("Cache-Control", "no-store");
}

// ── GET /api/manager/export/contributors — liste des cotisants (PDF / Excel). ──
router.get(
  "/contributors",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const format = formatOf(req);
    const report = await buildContributorsReport(tenantId);
    const slug = report.structure.slug ?? "structure";
    const filename = `cotisants-${slug}-${stampDay()}.${format}`;
    setDownloadHeaders(res, filename, format);

    if (format === "xlsx") {
      const buffer = await contributorsXlsx(report);
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.end(buffer);
    } else {
      const bytes = await contributorsPdf(report);
      const buffer = Buffer.from(bytes);
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.end(buffer);
    }

    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "report_exported",
      entity: "contributors",
      entityId: null,
      payload: {
        format,
        cotisants: report.totals.cotisants,
        carnets: report.totals.carnets,
        quartiers: report.totals.quartiers,
        filename,
      },
    });
  })
);

// ── GET /api/manager/export/collections — historique des encaissements (PDF / Excel). ──
router.get(
  "/collections",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const format = formatOf(req);
    // Période : bornes incluses. Défaut = mois en cours.
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const from = parseDayParam(req.query.from) ?? defaultFrom;
    let to = parseDayParam(req.query.to) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (to < from) {
      throw new ApiError("invalid_period", "La date de fin précède la date de début. Corrige la période.");
    }
    // Garde-fou : 5 ans maximum par export.
    if (to.getTime() - from.getTime() > 5 * 366 * 24 * 60 * 60 * 1000) {
      throw new ApiError("invalid_period", "Période trop longue : 5 ans maximum par export.");
    }
    const methodRaw = req.query.method;
    const method =
      methodRaw === "cash" || methodRaw === "mobile_money" ? (methodRaw as "cash" | "mobile_money") : undefined;

    const report = await buildCollectionsReport(tenantId, from, to, method);
    const slug = report.structure.slug ?? "structure";
    const filename = `encaissements-${slug}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.${format}`;
    setDownloadHeaders(res, filename, format);

    if (format === "xlsx") {
      const buffer = await collectionsXlsx(report);
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.end(buffer);
    } else {
      const bytes = await collectionsPdf(report);
      const buffer = Buffer.from(bytes);
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.end(buffer);
    }

    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "report_exported",
      entity: "collections",
      entityId: null,
      payload: {
        format,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        method: method ?? "all",
        rows: report.rows.length,
        net: report.totals.net,
        filename,
      },
    });
  })
);

export default router;

// ── GET /api/manager/export/audit — journal d'audit (décision n° 10, §8.15). ──
// Toutes les lignes de la chaîne (ordre de scellement), filtre d'action et
// période optionnels (bornes incluses). L'export lui-même est journalisé :
// la sortie du journal fait partie du journal (report_exported).
router.get(
  "/audit",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const format = formatOf(req);
    const actionRaw = req.query.action;
    const action = typeof actionRaw === "string" && actionRaw.trim() ? actionRaw.trim() : undefined;
    const from = parseDayParam(req.query.from) ?? undefined;
    const to = parseDayParam(req.query.to) ?? undefined;
    if (from && to && to < from) {
      throw new ApiError("invalid_period", "La date de fin précède la date de début. Corrige la période.");
    }
    // Garde-fou : 5 ans maximum par export (aligné sur l'export des encaissements).
    if (from && to && to.getTime() - from.getTime() > 5 * 366 * 24 * 60 * 60 * 1000) {
      throw new ApiError("invalid_period", "Période trop longue : 5 ans maximum par export.");
    }

    const report = await buildAuditReport(tenantId, { action, from, to });
    const slug = report.structure.slug ?? "structure";
    const periodPart = from || to ? `_${from?.toISOString().slice(0, 10) ?? "debut"}_${to?.toISOString().slice(0, 10) ?? "aujourdhui"}` : "";
    const filename = `journal-audit-${slug}${periodPart}${action ? `_${action}` : ""}.${format}`;

    // Journalisation AVANT l'envoi : la sortie du journal fait partie du journal
    // — l'écriture est scellée au moment exacte où le fichier part.
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "report_exported",
      entity: "audit",
      entityId: null,
      payload: {
        format,
        action: action ?? "all",
        from: from?.toISOString().slice(0, 10) ?? null,
        to: to?.toISOString().slice(0, 10) ?? null,
        rows: report.totals.rows,
        chainOk: report.chainOk,
        filename,
      },
    });

    setDownloadHeaders(res, filename, format);

    if (format === "xlsx") {
      const buffer = await auditXlsx(report);
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.end(buffer);
    } else {
      const bytes = await auditPdf(report);
      const buffer = Buffer.from(bytes);
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.end(buffer);
    }
  })
);
