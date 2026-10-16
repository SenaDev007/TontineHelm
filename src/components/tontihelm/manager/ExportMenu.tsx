"use client";
// TontiHelm — menu d'export du back-office : Excel (CSV compatible, BOM + « ; »)
// ou rapport PDF via la boîte d'impression du navigateur.
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

export function ExportMenu({
  onCsv,
  onPdf,
  label = "Exporter",
  busy = false,
}: {
  onCsv: () => void;
  onPdf: () => void;
  label?: string;
  busy?: boolean;
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
        <DropdownMenuItem onClick={onCsv} aria-label="Exporter en Excel (CSV)">
          <FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPdf} aria-label="Exporter en rapport PDF">
          <FileText className="h-4 w-4" aria-hidden /> Rapport PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
