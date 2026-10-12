import PptxGenJS from "pptxgenjs";
import type { SlideAnalysis } from "../analysis/schema";

/** The only slide coordinate system used by the PPTX writer: inches. */
export const SLIDE_SIZE = Object.freeze({ width: 13.333333, height: 7.5 });
export const SLIDE_WIDTH = SLIDE_SIZE.width;
export const SLIDE_HEIGHT = SLIDE_SIZE.height;

export type NormalizedRect = { x: number; y: number; width: number; height: number };
export type SlideInchRect = { x: number; y: number; w: number; h: number };
export type PixelDimensions = { width: number; height: number };

export type GeometryDiagnostic = {
  elementIndex: number;
  elementType: string;
  message: string;
};

export type PptxGenerationMode = "background" | "rebuild";

export type PptxSource = {
  filename: string;
  mimeType: "image/png" | "image/jpeg";
  dataUrl: string;
  /** Actual decoded input-image dimensions in pixels. */
  pixelWidth: number;
  pixelHeight: number;
  analysis: SlideAnalysis;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizedRectToSlideInches(value: NormalizedRect, label = "object", diagnostics?: GeometryDiagnostic[], elementIndex = -1): SlideInchRect | null {
  const invalid = ![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0;
  if (invalid) {
    diagnostics?.push({ elementIndex, elementType: label, message: "bbox has non-finite, zero, or negative geometry and was skipped." });
    return null;
  }

  const x = clamp(value.x, 0, 1);
  const y = clamp(value.y, 0, 1);
  const right = value.x + value.width;
  const bottom = value.y + value.height;
  const clippedWidth = Math.min(value.width, 1 - x);
  const clippedHeight = Math.min(value.height, 1 - y);
  if (value.x < 0 || value.y < 0 || value.x > 1 || value.y > 1 || right > 1 || bottom > 1) {
    diagnostics?.push({ elementIndex, elementType: label, message: `bbox exceeded the normalized slide boundary and was clipped: x=${value.x}, y=${value.y}, width=${value.width}, height=${value.height}.` });
  }
  if (clippedWidth <= 0 || clippedHeight <= 0) {
    diagnostics?.push({ elementIndex, elementType: label, message: "bbox is entirely outside the normalized slide and was skipped." });
    return null;
  }
  return { x: x * SLIDE_WIDTH, y: y * SLIDE_HEIGHT, w: clippedWidth * SLIDE_WIDTH, h: clippedHeight * SLIDE_HEIGHT };
}

function fitImageBox(image: PixelDimensions, target: SlideInchRect): SlideInchRect {
  if (image.width <= 0 || image.height <= 0) return target;
  const imageRatio = image.width / image.height;
  const targetRatio = target.w / target.h;
  if (Math.abs(imageRatio - targetRatio) < 0.01) return target;
  if (imageRatio > targetRatio) {
    const h = target.w / imageRatio;
    return { x: target.x, y: target.y + (target.h - h) / 2, w: target.w, h };
  }
  const w = target.h * imageRatio;
  return { x: target.x + (target.w - w) / 2, y: target.y, w, h: target.h };
}

function color(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace("#", "").trim();
  return normalized && /^[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function containsEmoji(value: string) {
  return /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value);
}

function addBackground(slide: PptxGenJS.Slide, source: PptxSource) {
  const target = fitImageBox({ width: source.pixelWidth, height: source.pixelHeight }, { x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT });
  slide.background = { color: "FFFFFF" };
  slide.addImage({ data: source.dataUrl, ...target });
}

function addAnalysisRegions(slide: PptxGenJS.Slide, analysis: SlideAnalysis, diagnostics: GeometryDiagnostic[]) {
  const regions = [...analysis.regions]
    .filter((region) => region.type !== "slide" && (region.backgroundColor || region.borderColor))
    .sort((left, right) => (right.bbox.width * right.bbox.height) - (left.bbox.width * left.bbox.height));

  for (const [index, region] of regions.entries()) {
    const box = normalizedRectToSlideInches(region.bbox, `region:${region.type}`, diagnostics, index);
    if (!box) continue;
    slide.addShape("rect", {
      ...box,
      fill: region.backgroundColor ? { color: color(region.backgroundColor, "FFFFFF") } : { color: "FFFFFF", transparency: 100 },
      line: region.borderColor ? { color: color(region.borderColor, "666666"), width: 1 } : { color: "FFFFFF", transparency: 100 },
    });
  }
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([length, body, checksum]);
}

function cropPngDataUrl(dataUrl: string, sourceWidth: number, sourceHeight: number, crop: NormalizedRect) {
  const encoded = dataUrl.split(",", 2)[1];
  if (!encoded) return { dataUrl, width: sourceWidth, height: sourceHeight };
  const input = Buffer.from(encoded, "base64");
  if (input.length < 26 || input.readUInt32BE(0) !== 0x89504e47 || input.readUInt32BE(4) !== 0x0d0a1a0a) return { dataUrl, width: sourceWidth, height: sourceHeight };
  let bitDepth = 0; let colorType = 0; const idat: Buffer[] = []; let offset = 8;
  while (offset + 12 <= input.length) { const length = input.readUInt32BE(offset); const type = input.toString("ascii", offset + 4, offset + 8); const data = input.subarray(offset + 8, offset + 8 + length); if (type === "IHDR") { bitDepth = data[8]; colorType = data[9]; } if (type === "IDAT") idat.push(data); offset += length + 12; }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return { dataUrl, width: sourceWidth, height: sourceHeight };
  const zlib = require("node:zlib") as typeof import("node:zlib"); const channels = colorType === 6 ? 4 : 3; const stride = sourceWidth * channels; const raw = zlib.inflateSync(Buffer.concat(idat)); const rows: Buffer[] = []; let cursor = 0; let previous = Buffer.alloc(stride);
  for (let row = 0; row < sourceHeight; row += 1) { const filter = raw[cursor++]; const current = Buffer.from(raw.subarray(cursor, cursor + stride)); cursor += stride; for (let index = 0; index < stride; index += 1) { const left = index >= channels ? current[index - channels] : 0; const above = previous[index] ?? 0; const upperLeft = index >= channels ? previous[index - channels] ?? 0 : 0; if (filter === 1) current[index] = (current[index] + left) & 255; else if (filter === 2) current[index] = (current[index] + above) & 255; else if (filter === 3) current[index] = (current[index] + Math.floor((left + above) / 2)) & 255; else if (filter === 4) { const estimate = left + above - upperLeft; const pa = Math.abs(estimate - left); const pb = Math.abs(estimate - above); const pc = Math.abs(estimate - upperLeft); current[index] = (current[index] + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)) & 255; } } rows.push(current); previous = current; }
  const x = Math.max(0, Math.min(sourceWidth - 1, Math.round(crop.x * sourceWidth))); const y = Math.max(0, Math.min(sourceHeight - 1, Math.round(crop.y * sourceHeight))); const width = Math.max(1, Math.min(sourceWidth - x, Math.round(crop.width * sourceWidth))); const height = Math.max(1, Math.min(sourceHeight - y, Math.round(crop.height * sourceHeight))); const outputRows = rows.slice(y, y + height).map((row) => Buffer.concat([Buffer.from([0]), row.subarray(x * channels, (x + width) * channels)]));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType;
  const output = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(Buffer.concat(outputRows))), pngChunk("IEND", Buffer.alloc(0))]);
  return { dataUrl: `data:image/png;base64,${output.toString("base64")}`, width, height };
}

function paddedImageCrop(value: NormalizedRect, pixelWidth: number, pixelHeight: number): NormalizedRect {
  const padX = Math.min(0.004, 4 / Math.max(1, pixelWidth));
  const padY = Math.min(0.004, 4 / Math.max(1, pixelHeight));
  const x = clamp(value.x - padX, 0, 1);
  const y = clamp(value.y - padY, 0, 1);
  const right = clamp(value.x + value.width + padX, 0, 1);
  const bottom = clamp(value.y + value.height + padY, 0, 1);
  return { x, y, width: Math.max(0.0001, right - x), height: Math.max(0.0001, bottom - y) };
}

async function addRebuiltElements(slide: PptxGenJS.Slide, source: PptxSource, diagnostics: GeometryDiagnostic[]) {
  for (const [elementIndex, element] of source.analysis.elements.entries()) {
    if (element.type === "text") {
      if (element.text === null) continue;
      const box = normalizedRectToSlideInches(element.bbox, "text", diagnostics, elementIndex);
      if (!box) continue;
      const ratio = element.style.fontSizeRatio ?? 0.035;
      const fontSize = clamp(ratio * SLIDE_HEIGHT * 72, 4, 96);
      slide.addText(element.text, {
        ...box,
        fontFace: element.style.fontFamily ?? (containsEmoji(element.text) ? "Segoe UI Emoji" : "Aptos"),
        fontSize,
        color: color(element.style.color, "222222"),
        bold: element.style.bold ?? false,
        italic: element.style.italic ?? false,
        align: element.style.alignment === "unknown" ? "left" : element.style.alignment,
        valign: "top",
        fit: "none",
        margin: 0,
        fill: element.style.backgroundColor ? { color: color(element.style.backgroundColor, "FFFFFF") } : { color: "FFFFFF", transparency: 100 },
      });
      continue;
    }

    if (element.type === "shape") {
      const shapeType = element.shapeType === "circle" || element.shapeType === "ellipse" ? "ellipse" : element.shapeType === "roundedRectangle" ? "roundRect" : "rect";
      const box = normalizedRectToSlideInches(element.bbox, "shape", diagnostics, elementIndex);
      if (!box) continue;
      slide.addShape(shapeType, {
        ...box,
        fill: element.fillColor ? { color: color(element.fillColor, "FFFFFF") } : { color: "FFFFFF", transparency: 100 },
        line: { color: color(element.strokeColor, "666666"), width: element.strokeWidthRatio ? clamp(element.strokeWidthRatio * 72, 0.5, 6) : 1 },
      });
      continue;
    }

    if (element.type === "line") {
      const startX = clamp(element.start.x, 0, 1) * SLIDE_WIDTH;
      const startY = clamp(element.start.y, 0, 1) * SLIDE_HEIGHT;
      const endX = clamp(element.end.x, 0, 1) * SLIDE_WIDTH;
      const endY = clamp(element.end.y, 0, 1) * SLIDE_HEIGHT;
      if (startX === endX && startY === endY) {
        diagnostics.push({ elementIndex, elementType: "line", message: "line has zero length and was skipped." });
        continue;
      }
      const startArrow = element.startArrow ?? "none";
      const endArrow = element.endArrow ?? "none";
      slide.addShape("line", {
        // Preserve signed width/height so diagonal and reverse-direction
        // connectors keep the original slope and arrow direction.
        x: startX, y: startY, w: endX - startX, h: endY - startY,
        line: { color: color(element.color, "666666"), width: element.widthRatio ? clamp(element.widthRatio * 72, 0.5, 6) : 1, beginArrowType: startArrow, endArrowType: endArrow },
      });
      continue;
    }

    if (element.type === "table") {
      const box = normalizedRectToSlideInches(element.bbox, "table", diagnostics, elementIndex);
      if (!box) continue;
      const rows = Array.from({ length: element.rows }, () => Array.from({ length: element.columns }, () => ({ text: "" })));
      slide.addTable(rows, { ...box, border: { type: "solid", color: "999999", pt: 1 }, margin: 0.02, fontSize: 10, color: "333333" });
      continue;
    }

    if (element.type === "image") {
      const box = normalizedRectToSlideInches(element.bbox, "image", diagnostics, elementIndex);
      if (!box) continue;
      const cropped = cropPngDataUrl(source.dataUrl, source.pixelWidth, source.pixelHeight, paddedImageCrop(element.bbox, source.pixelWidth, source.pixelHeight));
      slide.addImage({ data: cropped.dataUrl, ...fitImageBox({ width: cropped.width, height: cropped.height }, box) });
    }
  }
}

export async function generatePptx(sources: PptxSource[], mode: PptxGenerationMode) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Slide to PPTX";
  pptx.subject = "Editable slide reconstruction";
  pptx.title = sources.length === 1 ? sources[0].filename : "Slide to PPTX export";
  pptx.company = "Slide to PPTX";
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial" };

  const diagnostics: GeometryDiagnostic[] = [];
  for (const source of sources) {
    const slide = pptx.addSlide();
    if (mode === "background") addBackground(slide, source);
    else {
      addAnalysisRegions(slide, source.analysis, diagnostics);
      await addRebuiltElements(slide, source, diagnostics);
    }
  }

  if (diagnostics.length) console.warn("PPTX geometry diagnostics:", diagnostics);

  return await pptx.write({ outputType: "nodebuffer" }) as Buffer;
}
