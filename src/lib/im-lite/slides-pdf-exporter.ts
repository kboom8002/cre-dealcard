"use client";

/**
 * Client-side 16:9 Landscape Slide PDF Exporter
 * - Renders /api/public/im-lite/[buildingId]/export?format=slides inside a hidden sandboxed iframe
 *   and exports every .im-slide-page to a crisp 13.333in × 7.5in landscape PDF via jsPDF + html2canvas.
 * - Dynamically imports jsPDF & html2canvas so SSR bundles stay clean.
 */

export interface ExportSlidesPdfParams {
  buildingId: string;
  docId?: string | null;
  filename?: string;
}

export interface ExportSlidesPdfResult {
  ok: boolean;
  pageCount: number;
  fallbackOpened?: boolean;
}

export function normalizePdfFilename(name?: string | null): string {
  const cleaned = String(name || "CREDEAL_IM")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
  return `${cleaned || "CREDEAL_IM"}_투자설명서.pdf`;
}

export async function exportSlidesToLandscapePdf({
  buildingId,
  docId,
  filename,
}: ExportSlidesPdfParams): Promise<ExportSlidesPdfResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, pageCount: 0 };
  }

  const docQuery = docId ? `&doc_id=${encodeURIComponent(docId)}` : "";
  const slidesUrl = `/api/public/im-lite/${encodeURIComponent(
    buildingId
  )}/export?format=slides${docQuery}`;

  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = (html2canvasMod as any).default ?? html2canvasMod;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  iframe.style.width = "1280px";
  iframe.style.height = "720px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.src = slidesUrl;

  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("SLIDES_IFRAME_TIMEOUT")), 15000);
      iframe.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      iframe.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("SLIDES_IFRAME_ERROR"));
      };
    });

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error("SLIDES_DOCUMENT_UNAVAILABLE");
    }

    const slideNodes = Array.from(iframeDoc.querySelectorAll<HTMLElement>(".im-slide-page"));
    if (slideNodes.length === 0) {
      throw new Error("NO_SLIDE_PAGES_FOUND");
    }

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "in",
      format: [13.333, 7.5],
      compress: true,
    });

    for (let i = 0; i < slideNodes.length; i += 1) {
      const node = slideNodes[i];
      const canvas = await html2canvas(node, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#FAF9F5",
        width: 1280,
        height: 720,
        windowWidth: 1280,
        windowHeight: 720,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) {
        pdf.addPage([13.333, 7.5], "landscape");
      }
      pdf.addImage(imgData, "JPEG", 0, 0, 13.333, 7.5, undefined, "FAST");
    }

    pdf.save(normalizePdfFilename(filename));
    return { ok: true, pageCount: slideNodes.length };
  } catch {
    if (typeof window !== "undefined") {
      window.open(slidesUrl, "_blank", "noopener,noreferrer");
    }
    return { ok: false, pageCount: 0, fallbackOpened: true };
  } finally {
    iframe.remove();
  }
}
