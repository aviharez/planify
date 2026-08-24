import { parseKrsText, type KrsParseResult } from "./parser";
import { loadPdfJs } from "./pdf";

export type ExtractionProgress = {
  stage: "reading" | "rendering" | "recognizing" | "parsing" | "done";
  progress: number;
  message: string;
};

export type OcrInput = {
  image: Blob | HTMLCanvasElement;
  page?: number;
};

export type OcrResult = {
  text: string;
  confidence: number;
};

export interface OcrProvider {
  extractText(
    input: OcrInput,
    onProgress?: (progress: number) => void,
  ): Promise<OcrResult>;
}

export class TesseractOcrProvider implements OcrProvider {
  async extractText(
    input: OcrInput,
    onProgress?: (progress: number) => void,
  ): Promise<OcrResult> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("ind", 1, {
      logger: (message) => onProgress?.(message.progress ?? 0),
    });
    try {
      const result = await worker.recognize(input.image);
      return { text: result.data.text, confidence: result.data.confidence / 100 };
    } finally {
      await worker.terminate();
    }
  }
}

type PdfTextResult = { text: string; pageCount: number };

type ImageVariant = Blob | HTMLCanvasElement;

function report(
  onProgress: ((progress: ExtractionProgress) => void) | undefined,
  value: ExtractionProgress,
) {
  onProgress?.(value);
}

export async function extractPdfText(
  file: Blob | Uint8Array,
  onProgress?: (progress: number) => void,
): Promise<PdfTextResult> {
  const pdfjs = await loadPdfJs();
  const data = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .filter(Boolean)
        .join(" "),
    );
    onProgress?.(pageNumber / document.numPages);
  }
  return { text: pages.join("\n"), pageCount: document.numPages };
}

export async function renderPdfPages(
  file: Blob,
  onProgress?: (progress: number) => void,
): Promise<HTMLCanvasElement[]> {
  if (typeof document === "undefined") throw new Error("PDF perlu diproses di browser.");
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const documentProxy = await pdfjs.getDocument({ data }).promise;
  const canvases: HTMLCanvasElement[] = [];
  for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
    const page = await documentProxy.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Dokumen belum bisa dirender.");
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    canvases.push(canvas);
    onProgress?.(pageNumber / documentProxy.numPages);
  }
  return canvases;
}

export type KrsExtractionResult = KrsParseResult & {
  source: "pdf-text" | "ocr";
  pageCount: number;
  rawTextLength: number;
  ocrConfidence?: number;
};

export class KrsExtractionService {
  constructor(private readonly ocrProvider?: OcrProvider) {}

  extract(
    file: File,
    options: { onProgress?: (progress: ExtractionProgress) => void } = {},
  ) {
    return extractKrsFile(file, { ...options, ocrProvider: this.ocrProvider });
  }
}

async function preprocessImage(image: ImageVariant): Promise<ImageVariant[]> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return [image];
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return [image];
  }
  try {
    const scale = bitmap.width < 1600 ? 2 : 1.35;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(bitmap.width * scale);
    canvas.height = Math.ceil(bitmap.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [image];
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = Math.round(
        pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114,
      );
      const contrast = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.25 + 128)));
      pixels.data[index] = contrast;
      pixels.data[index + 1] = contrast;
      pixels.data[index + 2] = contrast;
    }
    context.putImageData(pixels, 0, 0);
    return [image, canvas];
  } finally {
    bitmap.close();
  }
}

function parseQuality(parsed: KrsParseResult) {
  return parsed.candidates.length * 10 + parsed.confidence;
}

type ParsedOcrResult = OcrResult & { parsed: KrsParseResult };

export function selectBestOcrResult(results: ParsedOcrResult[]) {
  const best = results.reduce<ParsedOcrResult | null>((current, result) =>
    !current || parseQuality(result.parsed) > parseQuality(current.parsed) ? result : current,
  null);
  if (!best) throw new Error("OCR belum menghasilkan teks.");
  return best;
}

async function recognizeBest(
  image: ImageVariant,
  provider: OcrProvider,
  page: number | undefined,
  onProgress: (progress: number) => void,
): Promise<ParsedOcrResult> {
  const variants = await preprocessImage(image);
  const results: ParsedOcrResult[] = [];
  for (let index = 0; index < variants.length; index += 1) {
    const result = await provider.extractText({ image: variants[index], page }, (progress) =>
      onProgress((index + progress) / variants.length),
    );
    const parsed = parseKrsText(result.text);
    results.push({ ...result, parsed });
  }
  return selectBestOcrResult(results);
}

function hasMeaningfulText(_text: string, parsed: KrsParseResult) {
  return parsed.candidates.length > 0;
}

export async function extractKrsFile(
  file: File,
  options: {
    ocrProvider?: OcrProvider;
    onProgress?: (progress: ExtractionProgress) => void;
  } = {},
): Promise<KrsExtractionResult> {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
    throw new Error("Format KRS tidak didukung.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran KRS terlalu besar.");
  const onProgress = options.onProgress;
  let rawText = "";
  let pageCount = 1;
  let source: "pdf-text" | "ocr" = "ocr";
  const ocrConfidences: number[] = [];
  if (file.type === "application/pdf") {
    report(onProgress, { stage: "reading", progress: 0.1, message: "Membaca dokumen" });
    const embedded = await extractPdfText(file, (progress) =>
      report(onProgress, { stage: "reading", progress: 0.1 + progress * 0.35, message: "Membaca dokumen" }),
    );
    pageCount = embedded.pageCount;
    const embeddedResult = parseKrsText(embedded.text);
    if (hasMeaningfulText(embedded.text, embeddedResult)) {
      rawText = embedded.text;
      source = "pdf-text";
    } else {
      report(onProgress, { stage: "rendering", progress: 0.5, message: "Menyiapkan halaman dokumen" });
      const pages = await renderPdfPages(file, (progress) =>
        report(onProgress, { stage: "rendering", progress: 0.5 + progress * 0.2, message: "Menyiapkan halaman dokumen" }),
      );
      const provider = options.ocrProvider ?? new TesseractOcrProvider();
      const texts: string[] = [];
      for (let index = 0; index < pages.length; index += 1) {
        const result = await recognizeBest(pages[index], provider, index + 1, (progress) =>
          report(onProgress, {
            stage: "recognizing",
            progress: 0.7 + ((index + progress) / pages.length) * 0.2,
            message: "Mengenali isi dokumen",
          }),
        );
        texts.push(result.text);
        ocrConfidences.push(Math.max(0, Math.min(1, result.confidence)));
      }
      rawText = texts.join("\n");
    }
  } else {
    report(onProgress, { stage: "recognizing", progress: 0.2, message: "Mengenali isi dokumen" });
    const provider = options.ocrProvider ?? new TesseractOcrProvider();
    const result = await recognizeBest(file, provider, undefined, (progress) =>
      report(onProgress, { stage: "recognizing", progress: 0.2 + progress * 0.7, message: "Mengenali isi dokumen" }),
    );
    rawText = result.text;
    ocrConfidences.push(Math.max(0, Math.min(1, result.confidence)));
  }
  report(onProgress, { stage: "parsing", progress: 0.92, message: "Menyiapkan hasil" });
  const parsed = parseKrsText(rawText);
  const ocrConfidence = ocrConfidences.length
    ? ocrConfidences.reduce((sum, confidence) => sum + confidence, 0) / ocrConfidences.length
    : undefined;
  const needsVerification = parsed.needsVerification || (ocrConfidence !== undefined && ocrConfidence < 0.8);
  const candidates = ocrConfidence === undefined
    ? parsed.candidates
    : parsed.candidates.map((candidate) => ({
        ...candidate,
        needsVerification: candidate.needsVerification || ocrConfidence < 0.8,
      }));
  report(onProgress, { stage: "done", progress: 1, message: candidates.length ? "Dokumen berhasil dibaca" : "Tidak ada baris yang dapat dipastikan" });
  return {
    ...parsed,
    candidates,
    confidence: parsed.confidence,
    needsVerification,
    source,
    pageCount,
    rawTextLength: rawText.length,
    ocrConfidence,
  };
}
