// TontiHelm — vérification locale des fichiers exportés (E2E sandbox).
// Usage : bun scripts/verify-export.ts xlsx|pdf <fichier>
// Imprime un résumé JSON (feuille, lignes, fusions, pages, titre…).
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "fs";

const [kind, path] = process.argv.slice(2);
if (!kind || !path) {
  console.error("usage: bun scripts/verify-export.ts xlsx|pdf <fichier>");
  process.exit(1);
}

if (kind === "xlsx") {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("aucune feuille");
  const merges = (ws.model.merges ?? []) as string[];
  const headerFooter = ws.headerFooter;
  console.log(
    JSON.stringify({
      kind: "xlsx",
      sheet: ws.name,
      rowCount: ws.rowCount,
      columnCount: ws.columnCount,
      merges: merges.length,
      mergeSamples: merges.slice(0, 4),
      a1: ws.getCell("A1").value,
      headerCell: ws.getCell("A6").value ?? ws.getCell("A5").value ?? null,
      hasPrintFooter: Boolean(headerFooter?.oddFooter),
      orientation: ws.pageSetup?.orientation ?? null,
      fitToWidth: ws.pageSetup?.fitToWidth ?? null,
    })
  );
} else if (kind === "pdf") {
  const bytes = readFileSync(path);
  const doc = await PDFDocument.load(new Uint8Array(bytes));
  console.log(
    JSON.stringify({
      kind: "pdf",
      bytes: bytes.byteLength,
      pages: doc.getPageCount(),
      title: doc.getTitle(),
      author: doc.getAuthor(),
      producer: doc.getProducer(),
    })
  );
} else {
  console.error("type inconnu : " + kind);
  process.exit(1);
}
