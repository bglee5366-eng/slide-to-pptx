import { createWorker } from "tesseract.js";
import path from "node:path";
import type { AnalysisInput } from "./adapter";
import type { SlideAnalysis } from "./schema";

type OcrRegion = {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function similarity(left: string, right: string) {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const common = [...new Set([...a])].filter((character) => b.includes(character)).length;
  return common / Math.max(new Set([...a, ...b]).size, 1);
}

function lineRegions(value: unknown, width: number, height: number): OcrRegion[] {
  const regions: OcrRegion[] = [];
  const visit = (node: unknown, depth = 0) => {
    const object = record(node);
    const bbox = record(object.bbox);
    const text = typeof object.text === "string" ? object.text.replace(/\s+/g, " ").trim() : "";
    if (depth >= 2 && text && Object.keys(bbox).length && typeof object.confidence === "number") {
      const x0 = Number(bbox.x0);
      const y0 = Number(bbox.y0);
      const x1 = Number(bbox.x1);
      const y1 = Number(bbox.y1);
      if ([x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0) {
        regions.push({ text, confidence: object.confidence, bbox: { x: x0 / width, y: y0 / height, width: (x1 - x0) / width, height: (y1 - y0) / height } });
      }
    }
    const lines = object.lines;
    if (Array.isArray(lines)) lines.forEach((line) => visit(line, depth + 1));
    // Tesseract's block tree is block -> paragraph -> line. Only collect
    // lines as regions; parent blocks are intentionally ignored because they
    // cover too much whitespace.
  };
  visit(value);
  return regions.filter((region) => region.confidence >= 35 && normalizedText(region.text).length >= 2);
}

export async function applyOcrTextGeometry(input: AnalysisInput, analysis: SlideAnalysis) {
  // Next/Turbopack can rewrite tesseract.js's __dirname to a virtual bundle
  // root. Give the Node worker an explicit real path so production and dev
  // servers can spawn it reliably.
  const workerPath = path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js");
  const worker = await createWorker("kor+eng", undefined, { workerPath });
  try {
    const result = await worker.recognize(input.imageDataUrl, {}, { blocks: true });
    const regions = lineRegions(result.data.blocks, input.width, input.height);
    if (!regions.length) return analysis;

    const used = new Set<number>();
    const elements = analysis.elements.map((element) => {
      if (element.type !== "text" || !element.text) return element;
      let bestIndex = -1;
      let bestScore = 0;
      regions.forEach((region, index) => {
        if (used.has(index)) return;
        const score = similarity(element.text ?? "", region.text);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      if (bestIndex < 0 || bestScore < 0.55) return element;
      used.add(bestIndex);
      const region = regions[bestIndex];
      return { ...element, bbox: region.bbox, confidence: Math.min(element.confidence, region.confidence / 100), needsReview: element.needsReview || region.confidence < 70, reviewReason: region.confidence < 70 ? "OCR confidence가 낮아 위치를 검수해야 합니다." : element.reviewReason };
    });

    const additions = regions.filter((_, index) => !used.has(index) && regions[index].confidence >= 70).map((region) => ({
      type: "text" as const,
      role: "other" as const,
      text: region.text,
      bbox: region.bbox,
      style: { fontFamily: null, fontSizeRatio: region.bbox.height, bold: null, italic: null, color: null, backgroundColor: null, alignment: "unknown" as const },
      confidence: region.confidence / 100,
      needsReview: true,
      reviewReason: "OCR이 추가로 발견한 텍스트이므로 원본과 대조해야 합니다.",
    }));
    return { ...analysis, elements: [...elements, ...additions] };
  } finally {
    await worker.terminate();
  }
}
