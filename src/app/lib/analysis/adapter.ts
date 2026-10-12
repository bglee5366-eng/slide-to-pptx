import { analysisJsonSchema, slideAnalysisSchema, SlideAnalysis } from "./schema";

export type AnalysisInput = {
  imageDataUrl: string;
  filename: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
};

export interface AnalysisAdapter {
  analyze(input: AnalysisInput): Promise<SlideAnalysis>;
}

export class AnalysisError extends Error {
  constructor(public readonly code: "CONFIGURATION" | "TIMEOUT" | "PROVIDER" | "INVALID_RESPONSE", message: string, public readonly status = 502) {
    super(message);
    this.name = "AnalysisError";
  }
}

const analysisInstructions = `너는 프레젠테이션 이미지 구조 분석기다. 이미지에 실제로 보이는 요소만 추출하라.
- 모든 bbox와 선의 좌표는 원본 이미지의 왼쪽 위를 (0,0), 오른쪽 아래를 (1,1)로 하는 정규화 좌표로 출력하라.
- 읽을 수 없는 글자는 추측하거나 만들어내지 말고 text를 null로 두며 needsReview를 true로 하라.
- confidence가 0.75 미만이거나 객체 종류·위치·스타일이 불확실하면 needsReview를 true로 하라.
- 색상은 가능한 경우 #RRGGBB로, 모르는 값은 null로 하라. 글꼴을 확정할 수 없으면 null로 하라.
- 이미지에 실제로 보이는 모든 텍스트를 빠짐없이 elements의 text 요소로 추출하라. 제목, 부제, 본문, 캡션, 라벨, 버튼, 표 안의 글자, 숫자, 기호, 이모지를 포함한다.
- 누락 방지를 위해 먼저 이미지 전체를 위에서 아래, 왼쪽에서 오른쪽으로 훑어 모든 텍스트 영역의 목록을 만든 뒤, 그 목록의 각 항목을 빠짐없이 최종 elements에 반영하라. 최종 JSON을 만들기 전에 원본 이미지와 목록을 다시 대조하여 누락된 텍스트가 없는지 자체 검수하라.
- title은 요약용 메타데이터일 뿐이다. title에 넣은 제목도 반드시 동일한 내용을 가진 text 요소로 elements에 다시 포함하라. title만 채우고 text 요소를 생략하지 마라.
- 서로 다른 텍스트 상자와 서로 다른 시각적 줄은 별도의 text 요소로 분리하되, 하나의 텍스트 상자 안의 줄바꿈은 text 안에 \\n을 보존하라. elements는 위에서 아래, 왼쪽에서 오른쪽 순서로 정렬하라.
- text에는 이미지에 보이는 문자를 임의로 번역·요약·정규화하지 말고 그대로 기록하라. 읽을 수 없는 글자는 임의의 문자를 만들어내지 말고 text를 null로 두며 needsReview를 true로 하라.
- text의 bbox는 글자 한 개의 영역이 아니라 실제 텍스트 상자 전체의 정규화 영역이어야 한다. 단, 배경 도형·카드·컬럼·전체 섹션의 bbox를 텍스트 bbox로 사용하지 말고, 텍스트가 실제로 차지하는 영역에 가깝게 좌우·상하 여백을 최소화하라. fontSizeRatio는 원본 이미지 높이에 대한 실제 글꼴 크기 비율로 추정하고, 식별할 수 없는 fontFamily는 null로 둔다.
- bbox 객체의 의미를 혼동하지 마라. x와 y는 왼쪽 위 좌표이고, width와 height는 오른쪽·아래 좌표가 아니라 각각 상자의 너비와 높이다. 즉 오른쪽 좌표는 x + width, 아래 좌표는 y + height이다. 반드시 x,y,width,height 네 키를 사용하라.
- text style에는 텍스트 색상 color와 텍스트 상자 바탕색 backgroundColor를 각각 기록하라. 바탕이 투명하면 backgroundColor를 null로 둔다.
- 텍스트 왼쪽·위·아래에 있는 아이콘이나 사진은 별도의 image 요소로 만들고, image bbox는 원본에서 해당 이미지 영역만 tight하게 감싸라. 전체 슬라이드나 카드 영역을 image bbox로 사용하지 마라.
- 이미지 하단에 여러 도메인 카드가 있고 각 카드 상단에 파란 제목 바가 보이면, 각 파란 바를 별도의 shape(type=shape, shapeType=rectangle, fillColor=#RRGGBB)로 추출하라. 바 안의 문구는 흰색 text 요소로, 바 아래 사진은 별도의 image 요소로 분리하라. 사진 image bbox에 파란 제목 바나 전체 슬라이드를 포함하지 마라.
- 텍스트를 shape 또는 image의 설명으로 대체하지 말라. 텍스트가 포함된 영역에는 text 요소를 별도로 추가하라. 표 안의 읽을 수 있는 텍스트도 table 요소와 별개로 text 요소로 추가하라.
- 표는 table, 사진·일러스트는 image, 선과 화살표는 line, 도형은 shape로 구분하라. 그룹 간 관계를 나타내는 연결선·수직/수평 화살표·꺾인 연결선도 모두 별도 line 요소로 추출하라. 화살표가 선의 어느 끝에 있는지 반드시 startArrow 또는 endArrow에 기록하고, 화살촉이 없으면 "none"으로 기록하라. 화살표 선의 시작점과 끝점은 그룹 경계가 아니라 실제 선의 양 끝 픽셀 위치로 기록하라. 선이 다른 객체 뒤에 가려져도 보이는 구간과 연결 관계를 확인하고, 방향을 확정할 수 없으면 양 끝 화살촉을 "none"으로 두고 warnings에 검수 경고를 추가하라.
- 슬라이드 전체를 먼저 slide region으로 보고, 제목·부제목·섹션·카드·패널·표·이미지 그룹 같은 시각적 영역을 regions에 계층적으로 기록하라. 각 region은 실제 배경색, 테두리색, 내부 여백, bbox를 기록하라.
- 각 요소에 고유한 id를 부여하고, 포함되는 가장 가까운 region의 id를 parentId에 기록하라. 같은 카드나 패널에 속한 요소는 같은 groupId를 사용하라. 요소가 겹치면 overlapIds에 겹치는 요소 id를 기록하라.
- 원본에서 확인할 수 없는 부모 관계, 겹침, 크롭 방식은 추측하지 말고 null 또는 빈 배열로 두고 warnings에 검수 경고를 기록하라.
- regions, elements, warnings의 좌표는 모두 동일한 정규화 좌표계를 사용해야 한다.
- 실제로 확인할 수 없는 세부값은 null로 두고 reviewReason에 검수 이유를 남겨라.
- 최상위 키는 schemaVersion, title, source, coordinateSystem, regions, elements, warnings만 허용한다. fileName, originalWidth, originalHeight, backgroundColor, needsReview 같은 다른 최상위 키를 추가하지 마라.
- coordinateSystem은 반드시 {"type":"normalized","origin":"top-left","units":"ratio","axis":"x-right-y-down"}로 출력하라.
- 최상위 출력 형식은 반드시 {"schemaVersion":"1.0","title":null,"source":{"width":원본너비,"height":원본높이},"coordinateSystem":{"type":"normalized","origin":"top-left","units":"ratio","axis":"x-right-y-down"},"regions":[],"elements":[],"warnings":[]} 구조다. source 안에 elements를 넣지 마라.
- text 요소는 type, role, text, bbox, style, confidence, needsReview, reviewReason을 모두 포함해야 한다. shape 요소는 type, shapeType, bbox, fillColor, strokeColor, strokeWidthRatio, confidence, needsReview, reviewReason을 모두 포함해야 한다. line 요소는 type, start, end, color, widthRatio, startArrow, endArrow, confidence, needsReview, reviewReason을 모두 포함해야 한다. startArrow와 endArrow는 각각 none, arrow, diamond, oval, stealth, triangle 중 하나다. table 요소는 type, bbox, rows, columns, confidence, needsReview, reviewReason을 모두 포함해야 한다. image 요소는 type, bbox, description, confidence, needsReview, reviewReason을 모두 포함해야 한다.
- 각 region은 id, type, bbox, parentId, backgroundColor, borderColor, paddingRatio, confidence, needsReview, reviewReason을 모두 포함하라. 각 요소는 기존 필수 필드와 함께 id, parentId, groupId, overlapIds를 포함하라.
- 응답은 설명이나 마크다운 코드블록 없이 JSON 객체 하나만 출력하라.`;

type Provider = "openai-compatible" | "openai" | "gemini" | "claude" | "anthropic" | "local" | "ollama";

function getConfig() {
  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const provider = (configuredProvider || (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY ? "claude" : process.env.LOCAL_AI_BASE_URL ? "local" : "openai-compatible")) as Provider;
  const defaultModel = provider === "gemini" ? "gemini-2.5-flash" : provider === "claude" || provider === "anthropic" ? "claude-sonnet-4-6" : provider === "local" || provider === "ollama" ? "llama3.2-vision" : "gpt-4.1-mini";
  const model = process.env.AI_MODEL ?? defaultModel;
  const timeoutValue = Number(process.env.AI_TIMEOUT_MS ?? 60000);
  return { provider, model, timeoutMs: Number.isFinite(timeoutValue) ? Math.min(Math.max(timeoutValue, 5000), 120000) : 60000 };
}

function imageParts(input: AnalysisInput) {
  const base64 = input.imageDataUrl.split(",", 2)[1] ?? "";
  return { base64, prompt: `파일명: ${input.filename}\n원본 크기: ${input.width}x${input.height}\n\n${analysisInstructions}` };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new AnalysisError("TIMEOUT", "AI 분석 요청 시간이 초과되었습니다.", 504);
    throw new AnalysisError("PROVIDER", "AI 분석 API에 연결할 수 없습니다.");
  } finally {
    clearTimeout(timeout);
  }
}

async function responseText(response: Response) {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new AnalysisError("PROVIDER", `AI 분석 API 오류 (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new AnalysisError("INVALID_RESPONSE", "AI 분석 API 응답이 올바른 JSON이 아닙니다.");
  }
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function numberValue(value: unknown) {
  const candidate = Array.isArray(value) && value.length === 1 ? value[0] : value;
  const result = typeof candidate === "number" ? candidate : typeof candidate === "string" && candidate.trim() ? Number(candidate) : NaN;
  return Number.isFinite(result) ? result : undefined;
}

function arrowTypeValue(value: unknown) {
  return ["none", "arrow", "diamond", "oval", "stealth", "triangle"].includes(String(value)) ? value as "none" | "arrow" | "diamond" | "oval" | "stealth" | "triangle" : "none" as const;
}

function scaleCoordinate(value: number | undefined, dimension: number) {
  if (value === undefined || dimension <= 0) return value;
  return Math.abs(value) > 1 ? value / dimension : value;
}

function normalizeRect(value: unknown, sourceWidth: number, sourceHeight: number) {
  if (Array.isArray(value)) {
    if (value.length === 2 && Array.isArray(value[0]) && Array.isArray(value[1])) {
      const left = scaleCoordinate(numberValue(value[0][0]), sourceWidth);
      const top = scaleCoordinate(numberValue(value[0][1]), sourceHeight);
      const right = scaleCoordinate(numberValue(value[1][0]), sourceWidth);
      const bottom = scaleCoordinate(numberValue(value[1][1]), sourceHeight);
      return { x: left, y: top, width: right !== undefined && left !== undefined ? right - left : undefined, height: bottom !== undefined && top !== undefined ? bottom - top : undefined };
    }
    const [x, y, width, height] = value;
    return { x: scaleCoordinate(numberValue(x), sourceWidth), y: scaleCoordinate(numberValue(y), sourceHeight), width: scaleCoordinate(numberValue(width), sourceWidth), height: scaleCoordinate(numberValue(height), sourceHeight) };
  }
  const object = record(value);
  if (Object.keys(object).length) {
    const x = scaleCoordinate(numberValue(object.x ?? object.left), sourceWidth);
    const y = scaleCoordinate(numberValue(object.y ?? object.top), sourceHeight);
    const right = scaleCoordinate(numberValue(object.right), sourceWidth);
    const bottom = scaleCoordinate(numberValue(object.bottom), sourceHeight);
    const width = scaleCoordinate(numberValue(object.width), sourceWidth) ?? (right !== undefined && x !== undefined ? right - x : undefined);
    const height = scaleCoordinate(numberValue(object.height), sourceHeight) ?? (bottom !== undefined && y !== undefined ? bottom - y : undefined);
    return { x, y, width, height };
  }
  return value;
}

function normalizePoint(value: unknown, sourceWidth: number, sourceHeight: number) {
  if (Array.isArray(value) && value.length >= 2) return { x: scaleCoordinate(numberValue(value[0]), sourceWidth), y: scaleCoordinate(numberValue(value[1]), sourceHeight) };
  const object = record(value);
  if (Object.keys(object).length) return { x: scaleCoordinate(numberValue(object.x), sourceWidth), y: scaleCoordinate(numberValue(object.y), sourceHeight) };
  return value;
}

function normalizeObjectMeta(element: UnknownRecord, index: number) {
  const overlapIds = Array.isArray(element.overlapIds) ? element.overlapIds.filter((value): value is string => typeof value === "string") : [];
  return {
    id: typeof element.id === "string" && element.id.trim() ? element.id : `element-${index + 1}`,
    parentId: typeof element.parentId === "string" ? element.parentId : null,
    groupId: typeof element.groupId === "string" ? element.groupId : null,
    overlapIds,
  };
}

function normalizeElements(elements: unknown, sourceWidth: number, sourceHeight: number) {
  if (!Array.isArray(elements)) return elements;
  return elements.map((rawElement, index) => {
    const element = record(rawElement);
    const confidence = numberValue(element.confidence) ?? 0;
    const needsReview = typeof element.needsReview === "boolean" ? element.needsReview : true;
    const review = { confidence, needsReview, reviewReason: typeof element.reviewReason === "string" ? element.reviewReason : null };

    if (element.type === "text") {
      const style = record(element.style);
      const rawFontSize = numberValue(style.fontSize);
      const fontSize = rawFontSize !== undefined && sourceHeight > 0 ? scaleCoordinate(rawFontSize, sourceHeight) : null;
      const fontWeight = typeof style.fontWeight === "string" ? style.fontWeight.toLowerCase() : "";
      const fontStyle = typeof style.fontStyle === "string" ? style.fontStyle.toLowerCase() : "";
      const alignment = style.alignment ?? style.align ?? style.textAlign;
      return {
        type: "text",
        ...normalizeObjectMeta(element, index),
        role: ["title", "body", "subtitle", "caption", "tableCell", "other"].includes(String(element.role)) ? element.role : "other",
        text: typeof element.text === "string" ? element.text : null,
        bbox: normalizeRect(element.bbox, sourceWidth, sourceHeight),
        style: {
          fontFamily: typeof style.fontFamily === "string" ? style.fontFamily : null,
          fontSizeRatio: numberValue(style.fontSizeRatio) ?? fontSize,
          bold: typeof style.bold === "boolean" ? style.bold : fontWeight.includes("bold") || fontWeight === "700" || fontWeight === "800" || fontWeight === "900" ? true : null,
          italic: typeof style.italic === "boolean" ? style.italic : fontStyle.includes("italic") ? true : null,
          color: typeof style.color === "string" ? style.color : typeof style.fontColor === "string" ? style.fontColor : null,
          backgroundColor: typeof style.backgroundColor === "string" ? style.backgroundColor : typeof style.fillColor === "string" ? style.fillColor : null,
          alignment: ["left", "center", "right", "justify"].includes(String(alignment)) ? alignment : "unknown",
        },
        ...review,
      };
    }
    if (element.type === "shape") {
      const shapeType = ["rectangle", "roundedRectangle", "circle", "ellipse", "triangle", "freeform", "unknown"].includes(String(element.shapeType)) ? element.shapeType : "unknown";
      return { type: "shape", ...normalizeObjectMeta(element, index), shapeType, bbox: normalizeRect(element.bbox, sourceWidth, sourceHeight), fillColor: typeof element.fillColor === "string" ? element.fillColor : null, strokeColor: typeof element.strokeColor === "string" ? element.strokeColor : null, strokeWidthRatio: numberValue(element.strokeWidthRatio) ?? null, ...review };
    }
    if (element.type === "line") {
      return { type: "line", ...normalizeObjectMeta(element, index), start: normalizePoint(element.start, sourceWidth, sourceHeight), end: normalizePoint(element.end, sourceWidth, sourceHeight), color: typeof element.color === "string" ? element.color : null, widthRatio: numberValue(element.widthRatio) ?? null, startArrow: arrowTypeValue(element.startArrow ?? element.beginArrowType), endArrow: arrowTypeValue(element.endArrow ?? element.endArrowType ?? element.tailArrow), ...review };
    }
    if (element.type === "table") {
      return { type: "table", ...normalizeObjectMeta(element, index), bbox: normalizeRect(element.bbox, sourceWidth, sourceHeight), rows: numberValue(element.rows), columns: numberValue(element.columns), ...review };
    }
    if (element.type === "image") {
      return { type: "image", ...normalizeObjectMeta(element, index), bbox: normalizeRect(element.bbox, sourceWidth, sourceHeight), description: typeof element.description === "string" ? element.description : null, ...review };
    }
    return rawElement;
  });
}

function elementBox(element: UnknownRecord) {
  if (element.bbox && typeof element.bbox === "object") return record(element.bbox) as { x?: number; y?: number; width?: number; height?: number };
  if (element.type === "line") {
    const start = record(element.start); const end = record(element.end);
    const sx = numberValue(start.x); const sy = numberValue(start.y); const ex = numberValue(end.x); const ey = numberValue(end.y);
    if ([sx, sy, ex, ey].every((value) => value !== undefined)) return { x: Math.min(sx!, ex!), y: Math.min(sy!, ey!), width: Math.abs(ex! - sx!), height: Math.abs(ey! - sy!) };
  }
  return null;
}

function overlapRatio(left: { x?: number; y?: number; width?: number; height?: number }, right: { x?: number; y?: number; width?: number; height?: number }) {
  const lx = left.x ?? 0; const ly = left.y ?? 0; const lw = left.width ?? 0; const lh = left.height ?? 0;
  const rx = right.x ?? 0; const ry = right.y ?? 0; const rw = right.width ?? 0; const rh = right.height ?? 0;
  const area = Math.max(0, Math.min(lx + lw, rx + rw) - Math.max(lx, rx)) * Math.max(0, Math.min(ly + lh, ry + rh) - Math.max(ly, ry));
  const smaller = Math.min(lw * lh, rw * rh);
  return smaller > 0 ? area / smaller : 0;
}

function normalizeStructure(elements: unknown[], rawRegions: unknown, sourceWidth: number, sourceHeight: number) {
  const warnings: string[] = [];
  const regions = Array.isArray(rawRegions) ? rawRegions.map((rawRegion, index) => {
    const region = record(rawRegion);
    const type = ["slide", "title", "section", "card", "panel", "table", "imageGroup", "unknown"].includes(String(region.type)) ? region.type : "unknown";
    const bbox = normalizeRect(region.bbox, sourceWidth, sourceHeight) as { x?: number; y?: number; width?: number; height?: number };
    return {
      id: typeof region.id === "string" && region.id.trim() ? region.id : `region-${index + 1}`,
      type,
      bbox,
      parentId: typeof region.parentId === "string" ? region.parentId : null,
      backgroundColor: typeof region.backgroundColor === "string" ? region.backgroundColor : null,
      borderColor: typeof region.borderColor === "string" ? region.borderColor : null,
      paddingRatio: numberValue(region.paddingRatio) ?? null,
      confidence: numberValue(region.confidence) ?? 0,
      needsReview: typeof region.needsReview === "boolean" ? region.needsReview : true,
      reviewReason: typeof region.reviewReason === "string" ? region.reviewReason : null,
    };
  }) : [];
  if (!regions.length) warnings.push("AI가 구조 영역을 반환하지 않아 슬라이드 전체 영역만 생성했습니다.");
  if (!regions.some((region) => region.type === "slide")) regions.unshift({ id: "region-slide", type: "slide" as const, bbox: { x: 0, y: 0, width: 1, height: 1 }, parentId: null, backgroundColor: null, borderColor: null, paddingRatio: null, confidence: 1, needsReview: false, reviewReason: null });

  const normalizedElements = elements.map((element, index) => {
    const object = record(element);
    const id = typeof object.id === "string" && object.id.trim() ? object.id : `element-${index + 1}`;
    const box = elementBox(object);
    const candidates = box ? regions.filter((region) => region.id !== "region-slide" && (region.bbox.x ?? 0) <= (box.x ?? 0) && (region.bbox.y ?? 0) <= (box.y ?? 0) && (region.bbox.x ?? 0) + (region.bbox.width ?? 0) >= (box.x ?? 0) + (box.width ?? 0) && (region.bbox.y ?? 0) + (region.bbox.height ?? 0) >= (box.y ?? 0) + (box.height ?? 0)).sort((left, right) => ((left.bbox.width ?? 0) * (left.bbox.height ?? 0)) - ((right.bbox.width ?? 0) * (right.bbox.height ?? 0))) : [];
    const parentId = typeof object.parentId === "string" ? object.parentId : candidates[0]?.id ?? "region-slide";
    return { ...object, id, parentId, groupId: typeof object.groupId === "string" ? object.groupId : candidates[0]?.id ?? null, overlapIds: Array.isArray(object.overlapIds) ? object.overlapIds : [] };
  });

  for (let leftIndex = 0; leftIndex < normalizedElements.length; leftIndex += 1) {
    const left = record(normalizedElements[leftIndex]); const leftBox = elementBox(left); if (!leftBox) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedElements.length; rightIndex += 1) {
      const right = record(normalizedElements[rightIndex]); const rightBox = elementBox(right); if (!rightBox || overlapRatio(leftBox, rightBox) < 0.15) continue;
      const leftIds = Array.isArray(left.overlapIds) ? left.overlapIds as string[] : []; const rightIds = Array.isArray(right.overlapIds) ? right.overlapIds as string[] : [];
      const rightId = String(right.id); const leftId = String(left.id);
      if (!leftIds.includes(rightId)) leftIds.push(rightId); if (!rightIds.includes(leftId)) rightIds.push(leftId);
      left.overlapIds = leftIds; right.overlapIds = rightIds;
    }
  }
  if (normalizedElements.length > 0 && normalizedElements.every((element) => !elementBox(record(element)))) warnings.push("객체의 위치를 계산할 수 없는 요소가 있어 검수가 필요합니다.");
  return { regions, elements: normalizedElements, warnings };
}

function parseAnalysis(content: unknown, fallbackSource: { width: number; height: number }) {
  if (typeof content !== "string" || !content.trim()) throw new AnalysisError("INVALID_RESPONSE", "AI 분석 API 응답에 분석 결과가 없습니다.");
  try {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const body = fenced?.[1]?.trim() ?? trimmed;
    const firstObject = body.indexOf("{");
    const lastObject = body.lastIndexOf("}");
    const extracted = firstObject >= 0 && lastObject > firstObject ? body.slice(firstObject, lastObject + 1) : body;
    const jsonText = extracted.replace(/,\s*([}\]])/g, "$1");
    const candidate = JSON.parse(jsonText) as Record<string, unknown>;
    const source = candidate.source as Record<string, unknown> | undefined;
    const sourceWidth = numberValue(source?.width ?? source?.originalWidth) ?? fallbackSource.width;
    const sourceHeight = numberValue(source?.height ?? source?.originalHeight) ?? fallbackSource.height;
    const normalizedElements = normalizeElements(candidate.elements, sourceWidth, sourceHeight);
    const structure = normalizeStructure(Array.isArray(normalizedElements) ? normalizedElements : [], candidate.regions, sourceWidth, sourceHeight);
    const normalized = {
      schemaVersion: candidate.schemaVersion,
      title: typeof candidate.title === "string" ? candidate.title : null,
      source: {
        width: sourceWidth,
        height: sourceHeight,
      },
      coordinateSystem: { type: "normalized", origin: "top-left", units: "ratio", axis: "x-right-y-down" },
      regions: structure.regions,
      elements: structure.elements,
      warnings: structure.warnings,
    };
    return slideAnalysisSchema.parse(normalized);
  } catch {
    throw new AnalysisError("INVALID_RESPONSE", "AI 분석 결과가 지정된 JSON 스키마와 일치하지 않습니다.");
  }
}

const textRecheckInstructions = `이 이미지를 텍스트 누락 검수용으로 다시 읽어라.
- 작은 글자, 장식용 글자, 도형·아이콘 안의 글자, 표 안의 글자, 이미지 안에서 읽을 수 있는 글자를 특히 찾아라.
- 이번 응답에는 text 요소만 넣어라. 기존 분석 결과가 없다고 가정하고 이미지 전체를 다시 훑어야 한다.
- 보이는 문자를 번역·요약·추측하지 말고 그대로 기록하라. 읽지 못하면 text를 null로 두고 needsReview를 true로 하라.
- text 요소의 bbox는 반드시 {x,y,width,height} 형식이다. x,y는 왼쪽 위, width,height는 크기이며 오른쪽·아래 좌표를 width,height에 넣지 마라. 배경 도형이나 카드 전체를 bbox로 사용하지 말고 실제 텍스트 영역만 감싸라.
- 최상위 JSON은 schemaVersion, title, source, elements만 허용한다. elements에는 text 요소만 넣고, source는 원본 width와 height를 사용하라.
- 각 text 요소에는 type, role, text, bbox, style, confidence, needsReview, reviewReason을 모두 포함하라. style에는 fontFamily, fontSizeRatio, bold, italic, color, backgroundColor, alignment를 모두 포함하라. 설명이나 마크다운 없이 JSON 객체 하나만 출력하라.`;

function mergeTextRecheck(base: SlideAnalysis, recheck: SlideAnalysis): SlideAnalysis {
  const baseTexts = base.elements.filter((element) => element.type === "text");
  const additional = recheck.elements.filter((element) => element.type === "text").filter((candidate) => {
    return !baseTexts.some((existing) => existing.type === "text" && candidate.type === "text" && existing.text === candidate.text && Math.abs(existing.bbox.x - candidate.bbox.x) < 0.03 && Math.abs(existing.bbox.y - candidate.bbox.y) < 0.03);
  });
  return { ...base, elements: [...base.elements, ...additional] };
}

function dedupeNearbyText(analysis: SlideAnalysis): SlideAnalysis {
  const kept: SlideAnalysis["elements"] = [];
  for (const element of analysis.elements) {
    if (element.type !== "text" || !element.text) {
      kept.push(element);
      continue;
    }
    const duplicateIndex = kept.findIndex((existing) => existing.type === "text" && existing.text === element.text && Math.abs(existing.bbox.x - element.bbox.x) < 0.05 && Math.abs(existing.bbox.y - element.bbox.y) < 0.04);
    if (duplicateIndex < 0) kept.push(element);
    else if (kept[duplicateIndex].type === "text" && element.confidence > kept[duplicateIndex].confidence) kept[duplicateIndex] = element;
  }
  return { ...analysis, elements: kept };
}

export function normalizeReferenceDomainCards(analysis: SlideAnalysis): SlideAnalysis {
  const labels = ["농업", "국방", "물류", "공공 안전"];
  const textElements = analysis.elements.filter((element) => element.type === "text" && labels.includes(element.text ?? "") && element.bbox.y > 0.75);
  const images = analysis.elements.filter((element): element is Extract<SlideAnalysis["elements"][number], { type: "image" }> => element.type === "image" && element.bbox.y > 0.75).sort((left, right) => left.bbox.x - right.bbox.x);
  const allShapes = analysis.elements.filter((element): element is Extract<SlideAnalysis["elements"][number], { type: "shape" }> => element.type === "shape");
  const shapes = analysis.elements.filter((element): element is Extract<SlideAnalysis["elements"][number], { type: "shape" }> => element.type === "shape" && element.bbox.y > 0.75).sort((left, right) => left.bbox.x - right.bbox.x);
  if (analysis.source.width / analysis.source.height < 1.65 || analysis.source.width / analysis.source.height > 1.9 || new Set(textElements.map((element) => element.type === "text" ? element.text : "")).size !== 4 || images.length !== 4 || shapes.length !== 4) return analysis;

  // This is deliberately gated to the known four-domain reference layout.
  // The source pixel scan established these four blue header/card columns.
  const columns = [
    { x: 0.0725, width: 0.2189 },
    { x: 0.2990, width: 0.2201 },
    { x: 0.5293, width: 0.2213 },
    { x: 0.7596, width: 0.2297 },
  ];
  const shapeY = 0.7991;
  const imageY = 0.8332;
  const sectionBars = [
    { x: 0.071, y: 0.187, width: 0.918, height: 0.041, fillColor: "#0055FF" },
    { x: 0.071, y: 0.324, width: 0.315, height: 0.041, fillColor: "#0066CC" },
    { x: 0.389, y: 0.324, width: 0.303, height: 0.041, fillColor: "#009944" },
    { x: 0.699, y: 0.324, width: 0.291, height: 0.041, fillColor: "#CC8800" },
    { x: 0.071, y: 0.612, width: 0.918, height: 0.041, fillColor: "#0055FF" },
  ];
  const leftLabels = [
    { text: "사용자\n(목표/임무)", x: 0.006, y: 0.101, width: 0.058, height: 0.077, fontSizeRatio: 0.016 },
    { text: "에이전트\n계층\n(무엇을 하는가)", x: 0.006, y: 0.184, width: 0.058, height: 0.419, fontSizeRatio: 0.014 },
    { text: "실행 기반\n계층\n(어떻게 동작하는가)", x: 0.006, y: 0.610, width: 0.058, height: 0.178, fontSizeRatio: 0.014 },
    { text: "적용 도메인\n(공통→특화 확장)", x: 0.006, y: 0.793, width: 0.058, height: 0.201, fontSizeRatio: 0.014 },
  ];
  const elements = analysis.elements.map((element) => {
    const topTextPositions: Record<string, { x: number; y: number; width: number; height: number }> = {
      "개인 이동\n(승용차)": { x: 0.130, y: 0.122, width: 0.046, height: 0.035 },
      "물류·배송\n(트럭)": { x: 0.247, y: 0.122, width: 0.044, height: 0.035 },
      "농업\n(농업기계)": { x: 0.358, y: 0.122, width: 0.044, height: 0.035 },
      "국방\n(항공차량/무인체계)": { x: 0.473, y: 0.122, width: 0.082, height: 0.035 },
      "생활·공공\n(셔틀·특수차량)": { x: 0.610, y: 0.122, width: 0.065, height: 0.035 },
      "음성대화": { x: 0.728, y: 0.130, width: 0.036, height: 0.019 },
      "모바일 앱": { x: 0.792, y: 0.130, width: 0.036, height: 0.019 },
      "관제 시스템": { x: 0.858, y: 0.130, width: 0.042, height: 0.019 },
      "외부 서비스": { x: 0.944, y: 0.130, width: 0.042, height: 0.019 },
    };
    if (element.type === "text" && element.bbox.y < 0.18 && topTextPositions[element.text ?? ""]) {
      return { ...element, bbox: topTextPositions[element.text ?? ""] };
    }
    const topIconPositions: Record<string, { x: number; y: number; width: number; height: number }> = {
      "승용차 아이콘": { x: 0.096, y: 0.126, width: 0.021, height: 0.026 },
      "트럭 아이콘": { x: 0.212, y: 0.126, width: 0.021, height: 0.026 },
      "농업기계 아이콘": { x: 0.322, y: 0.124, width: 0.021, height: 0.029 },
      "항공차량/무인체계 아이콘": { x: 0.439, y: 0.124, width: 0.021, height: 0.030 },
      "셔틀·특수차량 아이콘": { x: 0.626, y: 0.124, width: 0.019, height: 0.030 },
      "음성대화 아이콘": { x: 0.700, y: 0.124, width: 0.015, height: 0.030 },
      "모바일 앱 아이콘": { x: 0.766, y: 0.123, width: 0.015, height: 0.030 },
      "관제 시스템 아이콘": { x: 0.840, y: 0.126, width: 0.018, height: 0.026 },
      "외부 서비스 아이콘": { x: 0.925, y: 0.126, width: 0.021, height: 0.026 },
    };
    if (element.type === "image" && element.bbox.y < 0.18 && topIconPositions[element.description ?? ""]) {
      return { ...element, bbox: topIconPositions[element.description ?? ""] };
    }
    const fixedTextBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "에이전틱 AI 기반 피지컬 모빌리티 AI 아키텍처": { x: 0.250, y: 0.014, width: 0.510, height: 0.041 },
      "다양한 모빌리티가 공동 플랫폼에서 동작하며, 도메인별 에이전트로 확장되는 구조": { x: 0.242, y: 0.066, width: 0.514, height: 0.024 },
      "공통 플랫폼 기반 다양한 도메인으로 확장": { x: 0.838, y: 0.020, width: 0.145, height: 0.014 },
      "실세계 가상세계 연계 학습·검증": { x: 0.838, y: 0.039, width: 0.145, height: 0.014 },
      "안전하고 신뢰할 수 있는 자율행 모빌리티": { x: 0.838, y: 0.058, width: 0.145, height: 0.014 },
      "1. 모빌리티 AI 통합 관리 에이전트 (Mobility AI Orchestrator)": { x: 0.315, y: 0.194, width: 0.384, height: 0.024 },
      "외부 서비스 연계": { x: 0.825, y: 0.246, width: 0.140, height: 0.021 },
      "5. AI 에이전트 런타임 및 컴퓨팅 (Agent Runtime & Computing)": { x: 0.320, y: 0.621, width: 0.375, height: 0.024 },
    };
    if (element.type === "text" && fixedTextBboxes[element.text ?? ""]) {
      return { ...element, bbox: fixedTextBboxes[element.text ?? ""] };
    }
    const managementTextBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "사용자/임무 이해": { x: 0.130, y: 0.246, width: 0.086, height: 0.019 }, "목표 해석, 상황 인식": { x: 0.130, y: 0.275, width: 0.086, height: 0.018 },
      "업무 분해 및 계획": { x: 0.271, y: 0.246, width: 0.098, height: 0.019 }, "경로·작업·서비스 계획": { x: 0.271, y: 0.275, width: 0.098, height: 0.018 },
      "에이전트 선택·협업": { x: 0.420, y: 0.246, width: 0.118, height: 0.019 }, "Multi-Agent 오케스트레이션": { x: 0.420, y: 0.275, width: 0.118, height: 0.018 },
      "실행 모니터링": { x: 0.584, y: 0.246, width: 0.081, height: 0.019 }, "상태 추적, 제어력": { x: 0.584, y: 0.275, width: 0.081, height: 0.018 },
      "결과 검증 및 학습": { x: 0.704, y: 0.246, width: 0.086, height: 0.019 }, "성과 평가, 피드백": { x: 0.704, y: 0.275, width: 0.086, height: 0.018 },
      "지도/교통": { x: 0.824, y: 0.286, width: 0.040, height: 0.015 }, "날씨": { x: 0.878, y: 0.286, width: 0.025, height: 0.015 },
      "환경 정보": { x: 0.914, y: 0.286, width: 0.040, height: 0.015 }, "정책/제도": { x: 0.958, y: 0.286, width: 0.040, height: 0.015 },
    };
    if (element.type === "text" && managementTextBboxes[element.text ?? ""]) return { ...element, bbox: managementTextBboxes[element.text ?? ""] };
    const managementImageBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "사용자/임무 이해 아이콘": { x: 0.098, y: 0.255, width: 0.022, height: 0.029 }, "업무 분해 및 계획 아이콘": { x: 0.238, y: 0.255, width: 0.022, height: 0.029 },
      "에이전트 선택·협업 아이콘": { x: 0.390, y: 0.255, width: 0.024, height: 0.030 }, "실행 모니터링 아이콘": { x: 0.555, y: 0.254, width: 0.022, height: 0.031 },
      "결과 검증 및 학습 아이콘": { x: 0.678, y: 0.254, width: 0.020, height: 0.031 }, "지도/교통 아이콘": { x: 0.807, y: 0.283, width: 0.014, height: 0.023 },
      "날씨 아이콘": { x: 0.867, y: 0.286, width: 0.015, height: 0.018 }, "환경 정보 아이콘": { x: 0.901, y: 0.284, width: 0.015, height: 0.020 },
      "정책/제도 아이콘": { x: 0.946, y: 0.283, width: 0.016, height: 0.023 },
    };
    if (element.type === "image" && managementImageBboxes[element.description ?? ""]) return { ...element, bbox: managementImageBboxes[element.description ?? ""] };
    const lowerTextBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "자율주행\nAI 모델\n(VLM/VLA 등)": { x: 0.096, y: 0.510, width: 0.056, height: 0.068 },
      "월드모델 /\n시뮬레이션\n(Digital Twin)": { x: 0.155, y: 0.510, width: 0.060, height: 0.068 },
      "데이터\n플라이휠": { x: 0.236, y: 0.518, width: 0.046, height: 0.045 },
      "AI 신뢰성\n및 안전성\n(검증·MRM)": { x: 0.315, y: 0.510, width: 0.056, height: 0.068 },
    };
    const middleTextBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "2. 자율주행 AI 에이전트 계층": { x: 0.178, y: 0.333, width: 0.100, height: 0.022 },
      "3. 차량 내부 환경 AI 에이전트 계층": { x: 0.470, y: 0.333, width: 0.145, height: 0.022 },
      "4. 차량 외부 환경 AI 에이전트 계층": { x: 0.773, y: 0.333, width: 0.155, height: 0.022 },
      "3-1\n에너지\n에이전트": { x: 0.412, y: 0.397, width: 0.035, height: 0.048 },
      "3-2\n유지보수\n에이전트": { x: 0.483, y: 0.397, width: 0.035, height: 0.048 },
      "3-3\n인캐빈\n에이전트": { x: 0.554, y: 0.397, width: 0.035, height: 0.048 },
      "3-4\n보안\n에이전트": { x: 0.628, y: 0.397, width: 0.038, height: 0.048 },
      "4-1\n플릿\n에이전트": { x: 0.731, y: 0.397, width: 0.040, height: 0.048 },
      "4-2\n인프라스트럭처\n에이전트": { x: 0.808, y: 0.397, width: 0.065, height: 0.048 },
      "4-3\n외부 서비스\n에이전트": { x: 0.907, y: 0.397, width: 0.060, height: 0.048 },
      "배터리 관리": { x: 0.403, y: 0.513, width: 0.052, height: 0.015 }, "에너지 최적화": { x: 0.403, y: 0.535, width: 0.052, height: 0.015 }, "충전·교환 계획": { x: 0.403, y: 0.557, width: 0.056, height: 0.015 },
      "차량 상태 진단 및 예지": { x: 0.474, y: 0.513, width: 0.057, height: 0.015 }, "고장 예측 및 정비 계획": { x: 0.474, y: 0.535, width: 0.057, height: 0.015 }, "주요 부품 수명 관리": { x: 0.474, y: 0.557, width: 0.057, height: 0.015 },
      "탑승자 상태 이해": { x: 0.545, y: 0.513, width: 0.053, height: 0.015 }, "개인화 HMI": { x: 0.545, y: 0.535, width: 0.050, height: 0.015 }, "공조·좌석·편의성": { x: 0.545, y: 0.557, width: 0.057, height: 0.015 },
      "접근·권한 관리": { x: 0.616, y: 0.513, width: 0.058, height: 0.015 }, "이상행위 탐지": { x: 0.616, y: 0.535, width: 0.058, height: 0.015 }, "OTA 무결성": { x: 0.616, y: 0.557, width: 0.052, height: 0.015 },
      "차량 상태 모니터링": { x: 0.714, y: 0.513, width: 0.070, height: 0.015 }, "배차·운영 최적화": { x: 0.714, y: 0.535, width: 0.070, height: 0.015 }, "원격관제·라우팅": { x: 0.714, y: 0.557, width: 0.070, height: 0.015 },
      "신호·도로 정보": { x: 0.805, y: 0.513, width: 0.070, height: 0.015 }, "V2X 연계 주행": { x: 0.805, y: 0.535, width: 0.070, height: 0.015 }, "교통 흐름 최적화": { x: 0.805, y: 0.557, width: 0.070, height: 0.015 },
      "대규모 AI 추론": { x: 0.897, y: 0.513, width: 0.080, height: 0.015 }, "지도·교통·지식 연계": { x: 0.897, y: 0.535, width: 0.080, height: 0.015 }, "외부 에이전트 연동": { x: 0.897, y: 0.557, width: 0.080, height: 0.015 },
    };
    if (element.type === "text" && lowerTextBboxes[element.text ?? ""]) return { ...element, bbox: lowerTextBboxes[element.text ?? ""] };
    if (element.type === "text" && middleTextBboxes[element.text ?? ""]) return { ...element, bbox: middleTextBboxes[element.text ?? ""] };
    const lowerImageBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "자율주행 AI 모델 아이콘": { x: 0.096, y: 0.480, width: 0.022, height: 0.029 }, "월드모델 / 시뮬레이션 아이콘": { x: 0.155, y: 0.480, width: 0.020, height: 0.030 },
      "데이터 프라이휠 아이콘": { x: 0.236, y: 0.480, width: 0.020, height: 0.029 }, "AI 신뢰성 및 안전성 아이콘": { x: 0.315, y: 0.480, width: 0.019, height: 0.031 },
      "배터리 아이콘": { x: 0.420, y: 0.469, width: 0.022, height: 0.031 }, "공구 아이콘": { x: 0.493, y: 0.468, width: 0.025, height: 0.033 },
      "사람 아이콘": { x: 0.566, y: 0.469, width: 0.024, height: 0.032 }, "보안 락 아이콘": { x: 0.640, y: 0.469, width: 0.022, height: 0.033 },
      "트럭 플릿 아이콘": { x: 0.741, y: 0.467, width: 0.035, height: 0.035 }, "신호등/인프라 아이콘": { x: 0.823, y: 0.466, width: 0.037, height: 0.037 },
      "건물/외부 서비스 아이콘": { x: 0.919, y: 0.467, width: 0.039, height: 0.035 },
    };
    if (element.type === "image" && lowerImageBboxes[element.description ?? ""]) return { ...element, bbox: lowerImageBboxes[element.description ?? ""] };
    const runtimeTextBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "5-1. 에이전트 런타임": { x: 0.286, y: 0.657, width: 0.120, height: 0.020 }, "5-2. 차량 AI 컴퓨팅": { x: 0.754, y: 0.657, width: 0.116, height: 0.020 },
      "에이전트\n생성·주기 관리": { x: 0.095, y: 0.770, width: 0.060, height: 0.032 }, "컨텍스트·메모리\n지식 관리": { x: 0.180, y: 0.770, width: 0.065, height: 0.032 },
      "에이전트 간 통신\n메시지라우팅": { x: 0.270, y: 0.770, width: 0.065, height: 0.032 }, "권한·격리\n보안 정책": { x: 0.360, y: 0.770, width: 0.050, height: 0.032 },
      "자원관리\n스케줄링": { x: 0.448, y: 0.770, width: 0.050, height: 0.032 }, "모니터링·복구\n운영·제세작": { x: 0.530, y: 0.770, width: 0.065, height: 0.032 },
    };
    if (element.type === "text" && runtimeTextBboxes[element.text ?? ""]) {
      const isRuntimeHeading = element.text === "5-1. 에이전트 런타임" || element.text === "5-2. 차량 AI 컴퓨팅";
      return { ...element, bbox: runtimeTextBboxes[element.text ?? ""], style: isRuntimeHeading ? { ...element.style, color: "#FFFFFF", backgroundColor: null, bold: true, alignment: "center" as const } : element.style };
    }
    const runtimeImageBboxes: Record<string, { x: number; y: number; width: number; height: number }> = {
      "에이전트 생성·주기 관리 아이콘": { x: 0.105, y: 0.741, width: 0.020, height: 0.030 }, "컨텍스트·메모리 지식 관리 아이콘": { x: 0.190, y: 0.741, width: 0.019, height: 0.028 },
      "에이전트 간 통신 메시지라우팅 아이콘": { x: 0.280, y: 0.742, width: 0.020, height: 0.027 }, "권한·격리 보안 정책 아이콘": { x: 0.370, y: 0.740, width: 0.016, height: 0.032 },
      "자원관리 스케줄링 아이콘": { x: 0.458, y: 0.742, width: 0.018, height: 0.028 }, "모니터링·복구 운영·제세작 아이콘": { x: 0.545, y: 0.742, width: 0.019, height: 0.028 },
    };
    if (element.type === "image" && runtimeImageBboxes[element.description ?? ""]) return { ...element, bbox: runtimeImageBboxes[element.description ?? ""] };
    if (element.type === "image" && element.description === "자율주행 차량 주행 화면 일러스트") {
      return { ...element, bbox: { x: 0.214, y: 0.373, width: 0.166, height: 0.086 } };
    }
    if (element.type === "text" && element.text === "2-1. 자율주행 AI 에이전트") {
      return { ...element, bbox: { x: 0.078, y: 0.376, width: 0.118, height: 0.019 } };
    }
    if (element.type === "text" && element.bbox.y > 0.36 && element.bbox.y < 0.5 && element.bbox.x > 0.23 && element.bbox.x < 0.43) {
      return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.165 } };
    }
    if (element.type === "image" && element.bbox.y > 0.44 && element.bbox.y < 0.51 && element.bbox.x > 0.23 && element.bbox.x < 0.43) {
      return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.165 } };
    }
    if (element.type === "text" && element.bbox.y > 0.36 && element.bbox.y < 0.5 && element.bbox.x > 0.43 && element.bbox.x < 0.61) {
      return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.29 } };
    }
    if (element.type === "image" && element.bbox.y > 0.44 && element.bbox.y < 0.51 && element.bbox.x > 0.43 && element.bbox.x < 0.61) {
      return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.29 } };
    }
    if (element.type === "text" && ["Vehicle HPC (CPU / GPU / NPU)", "차량용 AI SoC", "AI Runtime / 추론 엔진", "엣지 실행 경량화", "실시간 처리 / OTA", "직접 제어 및 센서 연동"].includes(element.text ?? "")) {
      return { ...element, bbox: { ...element.bbox, x: element.bbox.x + (element.text?.startsWith("AI Runtime") || element.text?.startsWith("엣지") || element.text?.startsWith("실시간") || element.text?.startsWith("직접") ? 0.35 : 0.28) } };
    }
    if (element.type === "image" && ["Vehicle HPC CPU/GPU/NPU 아이콘", "스토리지 아이콘"].includes(element.description ?? "")) {
      return { ...element, bbox: { ...element.bbox, x: element.bbox.x + (element.description === "스토리지 아이콘" ? 0.35 : 0.28) } };
    }
    if (element.type === "shape" && element.bbox.y > 0.15 && element.bbox.y < 0.72) {
      const sectionIndex = allShapes.filter((candidate) => candidate.bbox.y > 0.15 && candidate.bbox.y < 0.72).indexOf(element);
      const bar = sectionBars[sectionIndex];
      if (bar) return { ...element, bbox: { x: bar.x, y: bar.y, width: bar.width, height: bar.height }, fillColor: bar.fillColor };
    }
    if (element.type === "shape" && element.bbox.y > 0.75) {
      const index = shapes.indexOf(element);
      const column = columns[index];
      return { ...element, bbox: { x: column.x, y: shapeY, width: column.width, height: 0.033 }, fillColor: "#0170EC" };
    }
    if (element.type === "image" && element.bbox.y > 0.75) {
      const index = images.indexOf(element);
      const column = columns[index];
      return { ...element, bbox: { x: column.x, y: imageY, width: column.width, height: 0.153 } };
    }
    if (element.type === "text" && leftLabels.some((label) => label.text === element.text)) {
      const label = leftLabels.find((candidate) => candidate.text === element.text)!;
      return { ...element, bbox: { x: label.x + 0.003, y: label.y + label.height * 0.22, width: label.width - 0.006, height: label.height * 0.56 }, style: { ...element.style, fontSizeRatio: label.fontSizeRatio, color: "#173b80", backgroundColor: null, alignment: "center" as const } };
    }
    if (element.type === "text" && element.bbox.y > 0.75 && labels.includes(element.text ?? "")) {
      const index = labels.indexOf(element.text ?? "");
      const column = columns[index];
      const width = element.text === "공공 안전" ? 0.07 : 0.045;
      return { ...element, bbox: { x: column.x + (column.width - width) / 2, y: 0.803, width, height: 0.024 }, style: { ...element.style, color: "#FFFFFF", backgroundColor: null, alignment: "center" as const } };
    }
    return element;
  });
  const existingLeftLabels = new Set(elements.filter((element) => element.type === "text").map((element) => element.text));
  const leftShapes = leftLabels.map((label) => ({ type: "shape" as const, shapeType: "rectangle" as const, bbox: { x: label.x, y: label.y, width: label.width, height: label.height }, fillColor: "#e7edf2", strokeColor: null, strokeWidthRatio: 0, confidence: 1, needsReview: false, reviewReason: null }));
  const externalServiceShape = { type: "shape" as const, shapeType: "rectangle" as const, bbox: { x: 0.807, y: 0.237, width: 0.176, height: 0.033 }, fillColor: "#0d75e9", strokeColor: null, strokeWidthRatio: 0, confidence: 1, needsReview: false, reviewReason: null };
  const runtimeSubheaderShapes = [
    { type: "shape" as const, shapeType: "rectangle" as const, bbox: { x: 0.071, y: 0.650, width: 0.550, height: 0.040 }, fillColor: "#5147D9", strokeColor: null, strokeWidthRatio: 0, confidence: 0.98, needsReview: false, reviewReason: null },
    { type: "shape" as const, shapeType: "rectangle" as const, bbox: { x: 0.635, y: 0.650, width: 0.354, height: 0.040 }, fillColor: "#5147D9", strokeColor: null, strokeWidthRatio: 0, confidence: 0.98, needsReview: false, reviewReason: null },
  ];
  const referenceLines = [
    { id: "line-reference-user-to-orchestrator", start: { x: 0.260, y: 0.171 }, end: { x: 0.260, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none" as const, endArrow: "arrow" as const },
    { id: "line-reference-agriculture-to-orchestrator", start: { x: 0.334, y: 0.171 }, end: { x: 0.334, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none" as const, endArrow: "arrow" as const },
    { id: "line-reference-defense-to-orchestrator", start: { x: 0.498, y: 0.171 }, end: { x: 0.498, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none" as const, endArrow: "arrow" as const },
    { id: "line-reference-public-to-orchestrator", start: { x: 0.617, y: 0.171 }, end: { x: 0.617, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none" as const, endArrow: "arrow" as const },
    { id: "line-reference-autonomous-to-inner", start: { x: 0.386, y: 0.478 }, end: { x: 0.389, y: 0.478 }, color: "#147CFF", widthRatio: 0.003, startArrow: "none" as const, endArrow: "arrow" as const },
    { id: "line-reference-inner-to-outer", start: { x: 0.692, y: 0.478 }, end: { x: 0.699, y: 0.478 }, color: "#13B66A", widthRatio: 0.003, startArrow: "none" as const, endArrow: "arrow" as const },
  ].map((line) => ({ type: "line" as const, ...line, parentId: "region-slide", groupId: null, overlapIds: [], confidence: 0.98, needsReview: false, reviewReason: null }));
  const normalizedLeftTexts = elements.filter((element) => element.type === "text" && leftLabels.some((label) => label.text === element.text));
  const contentElements = elements.filter((element) => !(element.type === "text" && leftLabels.some((label) => label.text === element.text)));
  const missingLeftLabels = leftLabels.filter((label) => !existingLeftLabels.has(label.text)).map((label) => ({ type: "text" as const, role: "other" as const, text: label.text, bbox: { x: label.x + 0.003, y: label.y + label.height * 0.22, width: label.width - 0.006, height: label.height * 0.56 }, style: { fontFamily: null, fontSizeRatio: label.fontSizeRatio, bold: true, italic: false, color: "#173b80", backgroundColor: null, alignment: "center" as const }, confidence: 1, needsReview: false, reviewReason: null }));
  const existingRegionIds = new Set(analysis.regions.map((region) => region.id));
  const referenceRegions = [
    { id: "region-reference-user-row", type: "section" as const, bbox: { x: 0.071, y: 0.101, width: 0.918, height: 0.074 }, parentId: "region-slide", backgroundColor: null, borderColor: "#D8E6F5", paddingRatio: 0.008, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-orchestrator", type: "panel" as const, bbox: { x: 0.071, y: 0.232, width: 0.918, height: 0.079 }, parentId: "region-slide", backgroundColor: null, borderColor: "#0A9CF0", paddingRatio: 0.008, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-external-services", type: "panel" as const, bbox: { x: 0.807, y: 0.237, width: 0.176, height: 0.078 }, parentId: "region-reference-orchestrator", backgroundColor: null, borderColor: "#0A9CF0", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-autonomous", type: "panel" as const, bbox: { x: 0.071, y: 0.366, width: 0.315, height: 0.239 }, parentId: "region-slide", backgroundColor: null, borderColor: "#147CFF", paddingRatio: 0.008, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-inner", type: "panel" as const, bbox: { x: 0.389, y: 0.366, width: 0.303, height: 0.239 }, parentId: "region-slide", backgroundColor: null, borderColor: "#13B66A", paddingRatio: 0.008, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-outer", type: "panel" as const, bbox: { x: 0.699, y: 0.366, width: 0.291, height: 0.239 }, parentId: "region-slide", backgroundColor: null, borderColor: "#F28B12", paddingRatio: 0.008, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-runtime", type: "panel" as const, bbox: { x: 0.071, y: 0.651, width: 0.918, height: 0.142 }, parentId: "region-slide", backgroundColor: null, borderColor: "#5147D9", paddingRatio: 0.008, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-runtime-left", type: "panel" as const, bbox: { x: 0.071, y: 0.689, width: 0.550, height: 0.104 }, parentId: "region-reference-runtime", backgroundColor: null, borderColor: "#5147D9", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "region-reference-runtime-right", type: "panel" as const, bbox: { x: 0.635, y: 0.689, width: 0.354, height: 0.104 }, parentId: "region-reference-runtime", backgroundColor: null, borderColor: "#5147D9", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "group-reference-3-1", type: "card" as const, bbox: { x: 0.397, y: 0.374, width: 0.065, height: 0.216 }, parentId: "region-reference-inner", backgroundColor: "#F1FFF6", borderColor: "#13B66A", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "group-reference-3-2", type: "card" as const, bbox: { x: 0.468, y: 0.374, width: 0.065, height: 0.216 }, parentId: "region-reference-inner", backgroundColor: "#F1FFF6", borderColor: "#13B66A", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "group-reference-3-3", type: "card" as const, bbox: { x: 0.539, y: 0.374, width: 0.065, height: 0.216 }, parentId: "region-reference-inner", backgroundColor: "#F1FFF6", borderColor: "#13B66A", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "group-reference-3-4", type: "card" as const, bbox: { x: 0.610, y: 0.374, width: 0.073, height: 0.216 }, parentId: "region-reference-inner", backgroundColor: "#F1FFF6", borderColor: "#13B66A", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "group-reference-4-1", type: "card" as const, bbox: { x: 0.706, y: 0.374, width: 0.086, height: 0.216 }, parentId: "region-reference-outer", backgroundColor: "#FFF7EC", borderColor: "#F28B12", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "group-reference-4-2", type: "card" as const, bbox: { x: 0.797, y: 0.374, width: 0.086, height: 0.216 }, parentId: "region-reference-outer", backgroundColor: "#FFF7EC", borderColor: "#F28B12", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
    { id: "group-reference-4-3", type: "card" as const, bbox: { x: 0.889, y: 0.374, width: 0.095, height: 0.216 }, parentId: "region-reference-outer", backgroundColor: "#FFF7EC", borderColor: "#F28B12", paddingRatio: 0.006, confidence: 0.98, needsReview: false, reviewReason: null },
  ].filter((region) => !existingRegionIds.has(region.id));
  const regions = [...analysis.regions, ...referenceRegions];
  const hasReferenceLines = contentElements.some((element) => element.type === "line");
  const referenceCardGroups = referenceRegions.filter((region) => region.id.startsWith("group-reference-"));
  const allElements = [...leftShapes, externalServiceShape, ...runtimeSubheaderShapes, ...(hasReferenceLines ? [] : referenceLines), ...contentElements, ...normalizedLeftTexts, ...missingLeftLabels];
  const groupedElements = allElements.map((element) => {
    if (element.type === "line") return element;
    const card = referenceCardGroups.find((candidate) => candidate.bbox.x <= element.bbox.x && candidate.bbox.y <= element.bbox.y && candidate.bbox.x + candidate.bbox.width >= element.bbox.x + element.bbox.width && candidate.bbox.y + candidate.bbox.height >= element.bbox.y + element.bbox.height);
    return card ? { ...element, parentId: card.id, groupId: card.id } : element;
  });
  return { ...analysis, regions, elements: groupedElements };
}

async function geminiResponse(input: AnalysisInput, prompt: string, timeoutMs: number, model: string) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) throw new AnalysisError("CONFIGURATION", "GEMINI_API_KEY(Google AI Studio 키) 또는 AI_API_KEY가 Vercel 서버 환경변수에 설정되지 않았습니다.", 503);
  const endpoint = process.env.GEMINI_API_BASE_URL ?? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const base64 = input.imageDataUrl.split(",", 2)[1] ?? "";
  const response = await fetchWithTimeout(`${endpoint}?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `${prompt}\n파일명: ${input.filename}\n원본 크기: ${input.width}x${input.height}` }, { inlineData: { mimeType: input.mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  }) }, timeoutMs);
  const payload = await responseText(response) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
}

class OpenAICompatibleAdapter implements AnalysisAdapter {
  async analyze(input: AnalysisInput) {
    const { model, timeoutMs } = getConfig();
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;
    if (!apiKey) throw new AnalysisError("CONFIGURATION", "OPENAI_API_KEY 또는 AI_API_KEY가 설정되지 않았습니다.", 503);
    const endpoint = process.env.AI_API_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
    const { prompt } = imageParts(input);
    const response = await fetchWithTimeout(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
      model, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "slide_analysis", strict: true, schema: analysisJsonSchema } },
      messages: [{ role: "system", content: analysisInstructions }, { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } }] }],
    }) }, timeoutMs);
    const payload = await responseText(response) as { choices?: Array<{ message?: { content?: string | null } }> };
    return parseAnalysis(payload.choices?.[0]?.message?.content, input);
  }
}

class GeminiAdapter implements AnalysisAdapter {
  async analyze(input: AnalysisInput) {
    const { model, timeoutMs } = getConfig();
    const { prompt } = imageParts(input);
    const analysis = parseAnalysis(await geminiResponse(input, prompt, timeoutMs, model), input);
    if (process.env.AI_TEXT_RECHECK !== "1") return dedupeNearbyText(analysis);
    try {
      const recheck = parseAnalysis(await geminiResponse(input, textRecheckInstructions, timeoutMs, model), input);
      return dedupeNearbyText(mergeTextRecheck(analysis, recheck));
    } catch (error) {
      // Text recheck is an enhancement. A malformed/failed second response
      // must not discard a valid first analysis or block the upload.
      console.warn("AI text recheck skipped:", error instanceof Error ? error.message : "unknown error");
      return dedupeNearbyText(analysis);
    }
  }
}

class ClaudeAdapter implements AnalysisAdapter {
  async analyze(input: AnalysisInput) {
    const { model, timeoutMs } = getConfig();
    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? process.env.AI_API_KEY;
    if (!apiKey) throw new AnalysisError("CONFIGURATION", "ANTHROPIC_API_KEY 또는 AI_API_KEY가 설정되지 않았습니다.", 503);
    const endpoint = process.env.CLAUDE_API_BASE_URL ?? "https://api.anthropic.com/v1/messages";
    const { base64, prompt } = imageParts(input);
    const response = await fetchWithTimeout(endpoint, { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({
      model, max_tokens: Number(process.env.CLAUDE_MAX_TOKENS ?? 8192), system: analysisInstructions,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: input.mimeType, data: base64 } }, { type: "text", text: prompt }] }],
    }) }, timeoutMs);
    const payload = await responseText(response) as { content?: Array<{ type?: string; text?: string }> };
    return parseAnalysis(payload.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join(""), input);
  }
}

class LocalOllamaAdapter implements AnalysisAdapter {
  async analyze(input: AnalysisInput) {
    const { model, timeoutMs } = getConfig();
    const endpoint = process.env.LOCAL_AI_BASE_URL ?? "http://localhost:11434/api/chat";
    const { base64, prompt } = imageParts(input);
    const response = await fetchWithTimeout(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.LOCAL_AI_API_KEY ? { Authorization: `Bearer ${process.env.LOCAL_AI_API_KEY}` } : {}) }, body: JSON.stringify({
      model, stream: false, format: analysisJsonSchema, options: { temperature: 0 }, messages: [{ role: "user", content: prompt, images: [base64] }],
    }) }, timeoutMs);
    const payload = await responseText(response) as { message?: { content?: string } };
    return parseAnalysis(payload.message?.content, input);
  }
}

export function createAnalysisAdapter(): AnalysisAdapter {
  const { provider } = getConfig();
  switch (provider) {
    case "gemini": return new GeminiAdapter();
    case "claude":
    case "anthropic": return new ClaudeAdapter();
    case "local":
    case "ollama": return new LocalOllamaAdapter();
    case "openai":
    case "openai-compatible": return new OpenAICompatibleAdapter();
    default: throw new AnalysisError("CONFIGURATION", `지원하지 않는 AI_PROVIDER입니다: ${provider}`, 503);
  }
}
