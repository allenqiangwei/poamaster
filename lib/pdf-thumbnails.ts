// lib/pdf-thumbnails.ts
// Client-side PDF thumbnail rendering using pdfjs-dist

import * as pdfjsLib from 'pdfjs-dist';

// Use CDN worker to avoid Next.js/Turbopack bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const THUMBNAIL_WIDTH = 200;
const MAX_PREVIEW_PAGES = 10;

export interface ThumbnailResult {
  totalPages: number;
  thumbnails: { page: number; dataUrl: string }[];
  /** True if totalPages > MAX_PREVIEW_PAGES */
  truncated: boolean;
}

/**
 * Render PDF pages as thumbnail data URLs entirely in the browser.
 * Returns up to MAX_PREVIEW_PAGES thumbnails.
 */
export async function renderPdfThumbnails(
  file: File,
  maxPages: number = MAX_PREVIEW_PAGES,
): Promise<ThumbnailResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = pdf.numPages;
  const pagesToRender = Math.min(totalPages, maxPages);

  const thumbnails: { page: number; dataUrl: string }[] = [];

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = THUMBNAIL_WIDTH / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    thumbnails.push({
      page: i,
      dataUrl: canvas.toDataURL('image/png'),
    });
  }

  pdf.destroy();

  return {
    totalPages,
    thumbnails,
    truncated: totalPages > pagesToRender,
  };
}
