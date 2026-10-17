"use client";
// TontiHelm — menu d'export du back-office (2026-10) : Excel (.xlsx) et PDF
// générés par le BACKEND (design de marque : en-têtes, tableaux stylés, totaux,
// pieds de page paginés). Le composant déclenche le téléchargement authentifié.
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

export function ExportMenu({
  onExcel,
  onPdf,
  label = "Exporter",
  busy = false,
  excelLabel = "Excel (.xlsx)",
  pdfLabel = "PDF",
}: {
  onExcel: () => void;
  onPdf: () => void;
  label?: string;
  busy?: boolean;
  excelLabel?: string;
  pdfLabel?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-11 border-line" disabled={busy}>
          <Download className="h-4 w-4" aria-hidden />{" "}
          <span className="hidden sm:inline">{busy ? "Préparation…" : label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onExcel} aria-label={`Exporter en ${excelLabel}`}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden /> {excelLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPdf} aria-label={`Exporter en ${pdfLabel}`}>
          <FileText className="h-4 w-4" aria-hidden /> {pdfLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
