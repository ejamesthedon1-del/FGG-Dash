import { useRef } from "react";
import { Link } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Printer, ExternalLink } from "lucide-react";
import { cn } from "./ui/utils";
import type { SOP } from "../lib/storage";
import { toast } from "sonner";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printTextSop(sop: SOP) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Allow pop-ups to print this SOP");
    return;
  }
  const body =
    sop.description.trim() ||
    (sop.pdfUrl ? "This SOP is attached as a PDF. Use Print from the PDF viewer if opened separately." : "No content.");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(sop.title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 40rem; margin: 0 auto; line-height: 1.6; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; }
  .meta { color: #666; font-size: 0.875rem; margin-bottom: 1.5rem; }
  .body { white-space: pre-wrap; }
</style></head><body>
<h1>${escapeHtml(sop.title)}</h1>
<p class="meta">Standard operating procedure</p>
<div class="body">${escapeHtml(body)}</div>
</body></html>`);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
  };
}

type Props = {
  sop: SOP | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SOPViewDialog({ sop, open, onOpenChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    if (!sop) return;
    if (sop.pdfUrl) {
      try {
        const win = iframeRef.current?.contentWindow;
        if (win) {
          win.focus();
          win.print();
          return;
        }
      } catch {
        /* fall through */
      }
      toast.info("Use “Open PDF”, then print from your browser’s PDF viewer.");
      return;
    }
    printTextSop(sop);
  };

  if (!sop) return null;

  const hasPdf = Boolean(sop.pdfUrl);
  const hasText = sop.description.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(90vh,900px)] w-[min(56rem,calc(100vw-2rem))] flex-col gap-4 overflow-hidden p-0 sm:max-w-[min(56rem,calc(100vw-2rem))]",
        )}
      >
        <div className="flex flex-col gap-2 border-b px-6 pt-6 pb-4 pr-14">
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl pr-2">{sop.title}</DialogTitle>
            <DialogDescription className="text-left">
              {hasPdf ? "View the PDF below. Use Print to send it to a printer or save as PDF." : "Print to save as PDF from your browser’s print dialog."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{sop.status ?? "Active"}</Badge>
            {(sop.tags ?? []).map((tag) => (
              <Badge key={tag} variant="secondary" className="capitalize">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="default" className="gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to={`/sops/edit/${sop.id}`} onClick={() => onOpenChange(false)}>
                Edit
              </Link>
            </Button>
            {hasPdf && sop.pdfUrl && (
              <Button type="button" variant="outline" className="gap-2" asChild>
                <a href={sop.pdfUrl} target="_blank" rel="noopener noreferrer" download={sop.pdfFileName}>
                  <ExternalLink className="h-4 w-4" />
                  Open PDF
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          {hasPdf && sop.pdfUrl ? (
            <iframe
              key={sop.id}
              ref={iframeRef}
              title={sop.title}
              src={`${sop.pdfUrl}#toolbar=1`}
              className="h-[min(65vh,640px)] w-full rounded-md border bg-gray-100"
            />
          ) : (
            <div className="rounded-md border bg-white p-6 shadow-sm">
              {hasText ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">{sop.description}</div>
              ) : (
                <p className="text-sm text-gray-500">No written steps — attach a PDF when creating this SOP to view it here.</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
