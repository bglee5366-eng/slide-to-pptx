"use client";

import Image from "next/image";
import { ChangeEvent, DragEvent, PointerEvent, useRef, useState } from "react";
import type { SlideAnalysis } from "./lib/analysis/schema";

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 20;
const MAX_TOTAL_SIZE_MB = 100;
const MAX_JSON_FILE_SIZE_MB = 30;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_SIZE = MAX_TOTAL_SIZE_MB * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g)$/i;
const JSON_AI_PROMPT = `첨부한 슬라이드 이미지를 편집 가능한 PowerPoint용 JSON으로 변환해줘.

중요: 아래 규칙을 모두 지키고, 설명·주석·마크다운 코드블록 없이 JSON 객체 하나만 반환해줘.

1) 최상위 구조는 반드시 다음과 같아야 해.
{
  "schemaVersion": "1.0",
  "mode": "rebuild",
  "sources": [{
    "filename": "slide-1.png",
    "mimeType": "image/png",
    "pixelWidth": 원본이미지_픽셀_가로,
    "pixelHeight": 원본이미지_픽셀_세로,
    "analysis": {
      "schemaVersion": "1.0",
      "title": null,
      "source": { "width": 원본이미지_픽셀_가로, "height": 원본이미지_픽셀_세로 },
      "coordinateSystem": { "type": "normalized", "origin": "top-left", "units": "ratio", "axis": "x-right-y-down" },
      "regions": [],
      "elements": [],
      "warnings": []
    }
  }]
}

2) sources는 반드시 배열이고, 이미지 한 장당 source 하나를 만들어줘. filename은 문자열, mimeType은 반드시 image/png 또는 image/jpeg, pixelWidth·pixelHeight는 양의 정수로 작성해줘.
3) 모든 좌표는 원본 이미지 기준 0~1 정규화 좌표야. bbox는 반드시 {"x": 숫자, "y": 숫자, "width": 숫자, "height": 숫자} 형식이고 x,y는 왼쪽 위, width,height는 크기야. 모든 좌표와 크기는 0 이상 1 이하여야 해.
4) analysis에는 위에 적힌 키 외의 키를 추가하지 마. regions의 각 항목은 id,type,bbox,parentId,backgroundColor,borderColor,paddingRatio,confidence,needsReview,reviewReason을 모두 포함해줘. region.type은 반드시 slide, title, section, card, panel, table, imageGroup, unknown 중 하나만 사용해. 그룹·컨테이너·배경·header·footer 같은 다른 단어는 사용하지 말고, 해당하지 않으면 panel 또는 unknown을 사용해.
5) elements는 실제 보이는 모든 텍스트·도형·선·표·이미지를 분리해. 모든 요소에 confidence,needsReview,reviewReason을 포함해.
6) text 요소는 type,role,text,bbox,style,confidence,needsReview,reviewReason을 모두 포함하고, style에는 fontFamily,fontSizeRatio,bold,italic,color,backgroundColor,alignment를 모두 포함해. 읽을 수 없는 글자는 추측하지 말고 text=null, needsReview=true로 남겨줘.
7) shape 요소는 type,shapeType,bbox,fillColor,strokeColor,strokeWidthRatio,confidence,needsReview,reviewReason을 모두 포함해. shapeType은 rectangle, roundedRectangle, circle, ellipse, triangle, freeform, unknown 중 하나만 사용해.
8) line 요소는 type,start,end,color,widthRatio,startArrow,endArrow,confidence,needsReview,reviewReason을 모두 포함해. startArrow와 endArrow는 none,arrow,diamond,oval,stealth,triangle 중 하나로 작성해.
9) table 요소는 type,bbox,rows,columns,confidence,needsReview,reviewReason을 모두 포함해. text.role은 title, body, subtitle, caption, tableCell, other 중 하나만 사용해.
10) image 요소는 type,bbox,description,confidence,needsReview,reviewReason을 모두 포함해. 원본 이미지를 JSON에 삽입하지 않아도 되지만, 이미지 영역의 위치와 크기는 반드시 기록해.
11) 텍스트·도형·선·표·이미지 요소를 생략하지 말고, 원본을 위에서 아래·왼쪽에서 오른쪽으로 다시 대조해 누락 여부를 검수해. 확실하지 않은 값은 추측하지 말고 null과 needsReview=true를 사용해.
12) 최종 응답은 반드시 JSON.parse()가 바로 성공하는 순수 JSON이어야 해. 백틱 3개로 감싼 json 코드펜스, 설명 문장, trailing comma를 절대 넣지 마.
13) 이 응답을 그대로 파일로 저장할 수 있도록 JSON 객체만 반환해줘. ChatGPT의 답변을 복사해 파일 이름을 slide-to-pptx.json으로 저장하면 유효한 JSON 파일이 되어야 해. 파일 확장자는 .json이고 UTF-8 텍스트로 저장할 수 있어야 해.`;

type UploadItem = { id: string; file: File; previewUrl: string; width: number; height: number };
type UploadStatus = "idle" | "validating" | "ready";
type AnalysisStatus = "idle" | "analyzing" | "complete";
type GenerationStatus = "idle" | "generating" | "complete";
type PreviewMode = "rebuild" | "background";
type Interaction = { index: number; kind: "move" | "resize"; startX: number; startY: number; before: SlideAnalysis };

function cloneAnalysis(analysis: SlideAnalysis): SlideAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as SlideAnalysis;
}

function isSupportedFile(file: File) { return ACCEPTED_MIME_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.test(file.name); }

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지 데이터를 읽을 수 없습니다.")); };
    image.src = url;
  });
}

async function validateImage(file: File) {
  if (!isSupportedFile(file)) throw new Error(`${file.name}: PNG, JPG, JPEG 파일만 지원합니다.`);
  if (file.size === 0 || file.size > MAX_FILE_SIZE) throw new Error(`${file.name}: 파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`);
  try {
    const { width, height } = await readImageSize(file);
    return { file, previewUrl: URL.createObjectURL(file), width, height };
  } catch {
    throw new Error(`${file.name}: 손상되었거나 읽을 수 없는 이미지입니다.`);
  }
}

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`; }
function clamp(value: number, min = 0, max = 1) { return Math.min(Math.max(value, min), max); }
function colorValue(value: string | null | undefined) { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#666666"; }

function parsePptxJsonInput(value: string): unknown {
  const trimmed = value.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1]?.trim() ?? trimmed);
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [selectedElementIndex, setSelectedElementIndex] = useState<number | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisResults, setAnalysisResults] = useState<Record<string, SlideAnalysis>>({});
  const [editedSlides, setEditedSlides] = useState<Record<string, SlideAnalysis>>({});
  const [history, setHistory] = useState<Record<string, SlideAnalysis[]>>({});
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // AI가 인식하지 못한 영역 때문에 재구성 모드에서 빈 공간이 보이지 않도록
  // 원본 배경 유지 모드를 기본으로 한다. 객체 재구성은 명시적으로 선택할 수 있다.
  const [generationMode, setGenerationMode] = useState<"background" | "rebuild">("background");
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonInputError, setJsonInputError] = useState<string | null>(null);
  const [jsonPromptCopied, setJsonPromptCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rebuild");
  const [showAnalysisBounds, setShowAnalysisBounds] = useState(false);
  const [interaction, setInteraction] = useState<Interaction | null>(null);

  const selectedAnalysis = selectedSlideId ? (editedSlides[selectedSlideId] ?? analysisResults[selectedSlideId]) : undefined;
  const selectedElement = selectedAnalysis && selectedElementIndex !== null ? selectedAnalysis.elements[selectedElementIndex] : undefined;

  const addFiles = async (files: File[]) => {
    if (!files.length || status === "validating") return;
    setStatus("validating"); setError(null);
    const available = MAX_FILES - items.length;
    const rejected: string[] = [];
    const accepted: Array<{ file: File; previewUrl: string; width: number; height: number }> = [];
    let total = items.reduce((sum, item) => sum + item.file.size, 0);
    if (available <= 0) { setError(`이미지는 최대 ${MAX_FILES}장까지 업로드할 수 있습니다.`); setStatus("ready"); return; }
    for (const file of files.slice(0, available)) {
      if (items.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) { rejected.push(`${file.name}: 이미 추가된 파일입니다.`); continue; }
      if (total + file.size > MAX_TOTAL_SIZE) { rejected.push(`${file.name}: 전체 업로드 용량 ${MAX_TOTAL_SIZE_MB}MB를 초과합니다.`); continue; }
      try { const image = await validateImage(file); accepted.push(image); total += file.size; } catch (validationError) { rejected.push(validationError instanceof Error ? validationError.message : `${file.name}: 업로드할 수 없습니다.`); }
    }
    if (files.length > available) rejected.push(`이미지는 최대 ${MAX_FILES}장까지 업로드할 수 있습니다.`);
    if (accepted.length) {
      const newItems = accepted.map((image) => ({ ...image, id: `${image.file.name}-${image.file.lastModified}-${crypto.randomUUID()}` }));
      setItems((current) => [...current, ...newItems]);
      setSelectedSlideId((current) => current ?? newItems[0].id);
      setAnalysisStatus("idle"); setAnalysisResults({}); setEditedSlides({}); setHistory({}); setGenerationStatus("idle");
    }
    setStatus("ready");
    if (rejected.length) setError(rejected.slice(0, 3).join(" ") + (rejected.length > 3 ? ` 외 ${rejected.length - 3}건` : ""));
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); void addFiles(Array.from(event.dataTransfer.files)); };

  const analyzeSlides = async () => {
    if (!items.length || analysisStatus === "analyzing") return;
    setAnalysisStatus("analyzing"); setAnalysisError(null);
    const formData = new FormData();
    items.forEach((item) => formData.append("files", item.file, item.file.name));
    formData.append("metadata", JSON.stringify(items.map((item) => ({ id: item.id, width: item.width, height: item.height }))));
    try {
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const responseBody = await response.text();
      const payload = (() => {
        try {
          return JSON.parse(responseBody) as { results?: Array<{ itemId: string; analysis: SlideAnalysis }>; error?: { message?: string } };
        } catch {
          return null;
        }
      })();
      if (!response.ok) {
        const fallback = response.status === 504
          ? "AI 분석 시간이 초과되었습니다. AI_TIMEOUT_MS를 낮추거나 Vercel 함수 실행 시간 제한을 확인하세요."
          : `슬라이드 분석 요청에 실패했습니다. (HTTP ${response.status})`;
        throw new Error(payload?.error?.message ?? fallback);
      }
      if (!payload) throw new Error("분석 서버가 JSON이 아닌 응답을 반환했습니다. Vercel Function Logs를 확인하세요.");
      if (!payload?.results?.length) throw new Error("AI 분석 결과가 비어 있습니다.");
      const originals = Object.fromEntries(payload.results.map((result) => [result.itemId, result.analysis]));
      setAnalysisResults(originals);
      setEditedSlides(Object.fromEntries(payload.results.map((result) => [result.itemId, cloneAnalysis(result.analysis)])));
      setHistory({}); setSelectedSlideId(payload.results[0].itemId); setSelectedElementIndex(null); setAnalysisStatus("complete");
    } catch (requestError) { setAnalysisStatus("idle"); setAnalysisError(requestError instanceof Error ? requestError.message : "슬라이드 분석 중 오류가 발생했습니다."); }
  };

  const updateSlide = (slideId: string, updater: (current: SlideAnalysis) => SlideAnalysis) => {
    setEditedSlides((current) => {
      const existing = current[slideId];
      if (!existing) return current;
      setHistory((previous) => ({ ...previous, [slideId]: [...(previous[slideId] ?? []), cloneAnalysis(existing)].slice(-30) }));
      return { ...current, [slideId]: updater(existing) };
    });
  };

  const updateElement = (index: number, updater: (element: SlideAnalysis["elements"][number]) => SlideAnalysis["elements"][number]) => {
    if (!selectedSlideId) return;
    updateSlide(selectedSlideId, (current) => ({ ...current, elements: current.elements.map((element, elementIndex) => elementIndex === index ? updater(element) : element) }));
  };

  const undo = () => {
    if (!selectedSlideId || !history[selectedSlideId]?.length) return;
    const previous = history[selectedSlideId].at(-1);
    if (!previous) return;
    setEditedSlides((current) => ({ ...current, [selectedSlideId]: previous }));
    setHistory((current) => ({ ...current, [selectedSlideId]: current[selectedSlideId].slice(0, -1) }));
    setSelectedElementIndex(null);
  };

  const deleteSelected = () => {
    if (selectedElementIndex === null || !selectedSlideId) return;
    updateSlide(selectedSlideId, (current) => ({ ...current, elements: current.elements.filter((_, index) => index !== selectedElementIndex) }));
    setSelectedElementIndex(null);
  };

  const startInteraction = (event: PointerEvent<HTMLElement>, index: number, kind: "move" | "resize") => {
    event.stopPropagation(); event.preventDefault();
    if (!selectedSlideId || !selectedAnalysis) return;
    setSelectedElementIndex(index);
    setInteraction({ index, kind, startX: event.clientX, startY: event.clientY, before: cloneAnalysis(selectedAnalysis) });
    setHistory((current) => ({ ...current, [selectedSlideId]: [...(current[selectedSlideId] ?? []), cloneAnalysis(selectedAnalysis)].slice(-30) }));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!interaction || !selectedSlideId || !canvasRef.current) return;
    const element = selectedAnalysis?.elements[interaction.index];
    if (!element) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const dx = (event.clientX - interaction.startX) / bounds.width;
    const dy = (event.clientY - interaction.startY) / bounds.height;
    const beforeElement = interaction.before.elements[interaction.index];
    if (!beforeElement) return;
    setEditedSlides((current) => {
      const slide = current[selectedSlideId];
      if (!slide) return current;
      return {
        ...current,
        [selectedSlideId]: {
          ...slide,
          elements: slide.elements.map((item, index) => {
            if (index !== interaction.index) return item;
            if ("bbox" in beforeElement && "bbox" in item) {
              const nextBox = interaction.kind === "move"
                ? { ...beforeElement.bbox, x: clamp(beforeElement.bbox.x + dx, 0, 1 - beforeElement.bbox.width), y: clamp(beforeElement.bbox.y + dy, 0, 1 - beforeElement.bbox.height) }
                : { ...beforeElement.bbox, width: clamp(beforeElement.bbox.width + dx, 0.02, 1 - beforeElement.bbox.x), height: clamp(beforeElement.bbox.height + dy, 0.02, 1 - beforeElement.bbox.y) };
              return { ...item, bbox: nextBox };
            }
            if (beforeElement.type === "line" && item.type === "line" && interaction.kind === "move") {
              return {
                ...item,
                start: { x: clamp(beforeElement.start.x + dx, 0, 1), y: clamp(beforeElement.start.y + dy, 0, 1) },
                end: { x: clamp(beforeElement.end.x + dx, 0, 1), y: clamp(beforeElement.end.y + dy, 0, 1) },
              };
            }
            return item;
          }),
        },
      };
    });
  };

  const stopInteraction = () => setInteraction(null);

  const generatePptx = async () => {
    if (!items.length || analysisStatus !== "complete") return;
    if (items.some((item) => !editedSlides[item.id])) { setGenerationError("모든 슬라이드를 먼저 분석해야 합니다."); return; }
    setGenerationStatus("generating"); setGenerationError(null);
    const formData = new FormData();
    items.forEach((item) => formData.append("files", item.file, item.file.name));
    formData.append("mode", generationMode);
    formData.append("analyses", JSON.stringify({ results: items.map((item) => ({ itemId: item.id, original: { filename: item.file.name, mimeType: item.file.type, byteSize: item.file.size, width: item.width, height: item.height }, analysis: editedSlides[item.id] })) }));
    try {
      const response = await fetch("/api/generate", { method: "POST", body: formData });
      if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(payload?.error?.message ?? "PPTX 생성에 실패했습니다."); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = items.length === 1 ? `${items[0].file.name.replace(/\.[^.]+$/, "")}.pptx` : "slide-to-pptx-export.pptx"; link.click(); URL.revokeObjectURL(url); setGenerationStatus("complete");
    } catch (requestError) { setGenerationStatus("idle"); setGenerationError(requestError instanceof Error ? requestError.message : "PPTX 생성에 실패했습니다. 원본 이미지는 보존되어 있습니다."); }
  };

  const generatePptxFromJson = async () => {
    if (!jsonInput.trim() || generationStatus === "generating") return;
    setGenerationStatus("generating"); setJsonInputError(null); setGenerationError(null);
    let payload: unknown;
    try {
      payload = parsePptxJsonInput(jsonInput);
    } catch {
      setGenerationStatus("idle"); setJsonInputError("JSON 문법을 확인하세요. ```json ... ``` 코드블록은 자동으로 제거하지만, 설명 문장이나 JSON 뒤의 추가 문자는 삭제해야 합니다."); return;
    }
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const body = await response.text();
        let message = "PPTX 생성에 실패했습니다.";
        try { message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? message; } catch { /* 서버의 비JSON 오류는 기본 메시지로 표시한다. */ }
        throw new Error(message);
      }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "slide-to-pptx-json-export.pptx"; link.click(); URL.revokeObjectURL(url); setGenerationStatus("complete");
    } catch (requestError) {
      setGenerationStatus("idle"); setJsonInputError(requestError instanceof Error ? requestError.message : "PPTX 생성에 실패했습니다.");
    }
  };

  const onJsonFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size === 0 || file.size > MAX_JSON_FILE_SIZE_MB * 1024 * 1024) {
      setJsonInputError(`JSON 파일은 ${MAX_JSON_FILE_SIZE_MB}MB 이하만 업로드할 수 있습니다.`);
      return;
    }
    try {
      setJsonInput(await file.text());
      setJsonInputError(null);
    } catch {
      setJsonInputError("JSON 파일을 읽을 수 없습니다.");
    }
  };

  const copyJsonPrompt = async () => {
    try {
      await navigator.clipboard.writeText(JSON_AI_PROMPT);
      setJsonPromptCopied(true);
      window.setTimeout(() => setJsonPromptCopied(false), 1800);
    } catch {
      setJsonInputError("프롬프트를 자동 복사하지 못했습니다. 화면의 요청문을 직접 복사하세요.");
    }
  };

  const downloadAnalysisJson = () => {
    if (!items.length) return;
    const payload = {
      schemaVersion: "1.0",
      mode: "rebuild",
      sources: items.map((item) => ({ filename: item.file.name, mimeType: item.file.type, pixelWidth: item.width, pixelHeight: item.height, analysis: analysisResults[item.id] })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "slide-analysis.json"; link.click(); URL.revokeObjectURL(url);
  };

  const removeItem = (item: UploadItem) => {
    URL.revokeObjectURL(item.previewUrl);
    setItems((current) => {
      const next = current.filter((candidate) => candidate.id !== item.id);
      if (selectedSlideId === item.id) setSelectedSlideId(next[0]?.id ?? null);
      return next;
    });
    setAnalysisResults((current) => { const next = { ...current }; delete next[item.id]; return next; });
    setEditedSlides((current) => { const next = { ...current }; delete next[item.id]; return next; });
    setHistory((current) => { const next = { ...current }; delete next[item.id]; return next; });
  };
  const clearAll = () => { items.forEach((item) => URL.revokeObjectURL(item.previewUrl)); setItems([]); setSelectedSlideId(null); setAnalysisResults({}); setEditedSlides({}); setHistory({}); setAnalysisStatus("idle"); setGenerationStatus("idle"); };
  const isEmpty = !items.length;
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);

  return <main className="min-h-screen bg-[#f4f6f8] text-[#15171a]">
    <header className="border-b border-black/5 bg-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173bff] text-sm font-bold text-white">S</span><span className="font-semibold">Slide to PPTX</span></div><div className="flex items-center gap-3 text-xs text-black/45"><span>{items.length}개 슬라이드 · {formatSize(totalSize)}</span><span className="rounded-full bg-[#eef1ff] px-3 py-1 text-[#173bff]">편집기</span></div></div></header>
    {isEmpty && <section className="mx-auto grid max-w-4xl gap-6 px-6 py-16 lg:grid-cols-2"><div onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} className={`rounded-3xl border bg-white p-10 text-center shadow-sm ${isDragging ? "border-[#173bff] ring-4 ring-[#dfe5ff]" : "border-dashed border-black/15"}`}><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#e9edff] text-3xl text-[#173bff]">↥</div><h1 className="mt-6 text-3xl font-semibold">이미지를 올려 편집을 시작하세요</h1><p className="mt-3 text-black/50">PNG, JPG, JPEG · 파일당 {MAX_FILE_SIZE_MB}MB · 최대 {MAX_FILES}장</p><input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={onFileChange} className="hidden" /><button type="button" onClick={() => inputRef.current?.click()} className="mt-8 rounded-xl bg-[#15171a] px-6 py-3 text-sm font-semibold text-white">파일 선택하기</button>{error && <p role="alert" className="mt-5 text-sm text-red-600">{error}</p>}</div><div className="rounded-3xl border border-black/8 bg-white p-8 shadow-sm"><h2 className="text-xl font-semibold">JSON으로 바로 PPTX 만들기</h2><p className="mt-2 text-sm leading-6 text-black/50">AI가 추출한 슬라이드 구조 JSON을 입력하거나 파일로 불러오면 바로 생성합니다.</p><input ref={jsonFileInputRef} type="file" accept="application/json,.json" onChange={(event) => void onJsonFileChange(event)} className="hidden" /><div className="mt-5 flex items-center gap-2"><button type="button" onClick={() => jsonFileInputRef.current?.click()} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/5">JSON 파일 선택</button><span className="text-xs text-black/40">최대 {MAX_JSON_FILE_SIZE_MB}MB</span></div><textarea value={jsonInput} onChange={(event) => { setJsonInput(event.target.value); setJsonInputError(null); }} placeholder={'{\n  "schemaVersion": "1.0",\n  "mode": "rebuild",\n  "sources": [ ... ]\n}'} className="mt-3 h-48 w-full rounded-xl border border-black/10 bg-[#fafbfc] px-3 py-3 font-mono text-xs text-black outline-none focus:border-[#173bff]" /><button type="button" onClick={() => void generatePptxFromJson()} disabled={!jsonInput.trim() || generationStatus === "generating"} className="mt-3 w-full rounded-xl bg-[#20b486] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{generationStatus === "generating" ? "PPTX 생성 중…" : "JSON으로 PPTX 다운로드"}</button>{jsonInputError && <p role="alert" className="mt-3 text-sm text-red-600">{jsonInputError}</p>}<details className="mt-5 rounded-xl bg-[#f5f7ff] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#173bff]">AI에게 JSON 추출 요청하는 방법</summary><p className="mt-3 text-xs leading-5 text-black/60">아래 요청문에 슬라이드 이미지를 함께 첨부한 뒤, 반환된 JSON을 복사해 `slide-to-pptx.json` 파일로 저장하거나 위 입력란에 붙여 넣으세요.</p><button type="button" onClick={() => void copyJsonPrompt()} className="mt-3 rounded-lg bg-[#173bff] px-3 py-2 text-xs font-semibold text-white">{jsonPromptCopied ? "복사 완료" : "요청문 원클릭 복사"}</button><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-[11px] leading-5 text-black/70">{JSON_AI_PROMPT}</pre><p className="mt-3 text-xs leading-5 text-black/50">이미지 객체까지 PPTX에 넣으려면 source에 원본 이미지의 dataUrl을 포함하세요. dataUrl이 없으면 재구성 모드에서 텍스트와 도형만 생성됩니다.</p></details></div></section>}
    {!isEmpty && <div className="mx-auto grid min-h-[calc(100vh-74px)] max-w-[1500px] grid-cols-[240px_minmax(520px,1fr)_300px]">
      <aside className="border-r border-black/8 bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">슬라이드</h2><button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg bg-[#eef1ff] px-3 py-2 text-xs font-semibold text-[#173bff]">추가</button></div><input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={onFileChange} className="hidden" /><div className="mt-4 space-y-3">{items.map((item, index) => <button key={item.id} type="button" onClick={() => { setSelectedSlideId(item.id); setSelectedElementIndex(null); }} className={`group w-full rounded-xl border p-2 text-left transition ${selectedSlideId === item.id ? "border-[#173bff] bg-[#f0f3ff]" : "border-black/8 hover:border-[#aebaff]"}`}><div className="relative aspect-video overflow-hidden rounded-lg bg-[#eef0f2]"><Image src={item.previewUrl} alt={`${index + 1}번 슬라이드`} fill unoptimized className="object-contain" /><span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">{index + 1}</span></div><div className="mt-2 flex items-center justify-between"><span className="max-w-[150px] truncate text-xs text-black/60">{item.file.name}</span><span onClick={(event) => { event.stopPropagation(); removeItem(item); }} className="cursor-pointer px-1 text-xs text-black/30 hover:text-red-500">×</span></div></button>)}</div><button type="button" onClick={clearAll} className="mt-6 w-full rounded-lg border border-black/10 px-3 py-2 text-xs text-black/50 hover:bg-black/5">전체 삭제</button></aside>
      <section className="flex min-w-0 flex-col items-center bg-[#edf0f3] p-6"><div className="mb-4 flex w-full max-w-[780px] items-center justify-between"><div><h1 className="font-semibold">{selectedAnalysis?.title ?? "슬라이드 편집"}</h1><p className="mt-1 text-xs text-black/45">객체를 클릭해 선택하고 드래그해 이동하거나 크기를 조절하세요.</p></div><div className="flex items-center gap-2"><button type="button" onClick={undo} disabled={!selectedSlideId || !history[selectedSlideId]?.length} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs disabled:opacity-30">실행 취소</button><label className="flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-2 text-xs"><input type="checkbox" checked={showAnalysisBounds} onChange={(event) => setShowAnalysisBounds(event.target.checked)} /> 경계</label><select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as PreviewMode)} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs"><option value="rebuild">객체 미리보기</option><option value="background">원본 미리보기</option></select></div></div><div ref={canvasRef} onPointerMove={handlePointerMove} onPointerUp={stopInteraction} onPointerLeave={stopInteraction} onClick={() => setSelectedElementIndex(null)} className="relative aspect-video w-full max-w-[780px] overflow-hidden rounded-xl bg-white shadow-[0_16px_40px_rgba(29,41,57,0.12)]">{selectedSlideId && <Image src={items.find((item) => item.id === selectedSlideId)?.previewUrl ?? ""} alt="선택한 원본 슬라이드" fill unoptimized className={previewMode === "background" ? "object-contain" : "object-contain opacity-10"} />}{previewMode === "rebuild" && selectedAnalysis?.elements.map((element, index) => <EditorElement key={`${selectedSlideId}-${index}`} element={element} index={index} selected={selectedElementIndex === index} onPointerDown={startInteraction} onSelect={() => setSelectedElementIndex(index)} />)}{showAnalysisBounds && selectedAnalysis && <AnalysisDebugOverlay analysis={selectedAnalysis} />}</div>{error && <p role="alert" className="mt-4 w-full max-w-[780px] rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}{analysisError && <p role="alert" className="mt-4 w-full max-w-[780px] rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{analysisError}</p>}{generationError && <p role="alert" className="mt-4 w-full max-w-[780px] rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{generationError} 원본 이미지와 편집 상태는 보존되어 있습니다.</p>}</section>
      <aside className="border-l border-black/8 bg-white p-5"><h2 className="font-semibold">속성</h2>{selectedElement ? <PropertiesPanel element={selectedElement} onUpdate={(updater) => updateElement(selectedElementIndex ?? 0, updater)} onDelete={deleteSelected} /> : <p className="mt-8 text-sm leading-6 text-black/45">가운데 미리보기에서 객체를 선택하면 텍스트와 도형 속성을 편집할 수 있습니다.</p>}<div className="mt-8 border-t border-black/8 pt-5"><h3 className="text-sm font-semibold">분석 및 내보내기</h3><button type="button" onClick={() => void analyzeSlides()} disabled={analysisStatus === "analyzing"} className="mt-4 w-full rounded-xl bg-[#173bff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{analysisStatus === "analyzing" ? "AI 분석 중…" : analysisStatus === "complete" ? "AI 분석 다시 실행" : "AI 분석 시작"}</button>{analysisStatus === "complete" && <><button type="button" onClick={downloadAnalysisJson} className="mt-3 w-full rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold text-black/70">분석 JSON 저장</button><select value={generationMode} onChange={(event) => setGenerationMode(event.target.value as "background" | "rebuild")} className="mt-3 w-full rounded-xl border border-black/10 px-3 py-2.5 text-xs"><option value="rebuild">개별 객체 재구성</option><option value="background">원본 이미지 배경 유지</option></select><button type="button" onClick={() => void generatePptx()} disabled={generationStatus === "generating"} className="mt-3 w-full rounded-xl bg-[#20b486] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{generationStatus === "generating" ? "PPTX 생성 중…" : "최신 편집 상태 다운로드"}</button></>}<p className="mt-3 text-xs leading-5 text-black/40">분석 결과는 원본과 분리된 편집 상태로 관리됩니다.</p></div></aside>
    </div>}
  </main>;
}

function AnalysisDebugOverlay({ analysis }: { analysis: SlideAnalysis }) {
  const colors = { text: "#173bff", shape: "#f97316", image: "#16a34a", line: "#9333ea", table: "#dc2626" };
  const lineBox = (element: Extract<SlideAnalysis["elements"][number], { type: "line" }>) => ({ x: Math.min(element.start.x, element.end.x), y: Math.min(element.start.y, element.end.y), width: Math.abs(element.end.x - element.start.x), height: Math.abs(element.end.y - element.start.y) });
  return <div className="pointer-events-none absolute inset-0 z-30" aria-label="분석 경계 상자"><div className="absolute inset-0 border-2 border-dashed border-black/40" />{analysis.regions.map((region) => <div key={`region-${region.id}`} className="absolute border border-dashed border-slate-500/70" style={{ left: `${region.bbox.x * 100}%`, top: `${region.bbox.y * 100}%`, width: `${region.bbox.width * 100}%`, height: `${region.bbox.height * 100}%` }}><span className="absolute -top-4 left-0 whitespace-nowrap bg-slate-700/80 px-1 text-[8px] text-white">{region.type}:{region.id}</span></div>)}{analysis.elements.map((element, index) => { const box = "bbox" in element ? element.bbox : lineBox(element); const color = colors[element.type]; return <div key={`element-${element.id ?? index}`} className="absolute border" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${Math.max(box.width, 0.002) * 100}%`, height: `${Math.max(box.height, 0.002) * 100}%`, borderColor: color }}><span className="absolute -top-3 left-0 max-w-40 truncate whitespace-nowrap bg-white/90 px-0.5 text-[7px]" style={{ color }}>{element.id ?? `element-${index + 1}`} · {element.type}{element.type === "text" && element.text ? ` · ${element.text.slice(0, 18)}` : ""}</span></div>; })}</div>;
}

function EditorElement({ element, index, selected, onPointerDown, onSelect }: { element: SlideAnalysis["elements"][number]; index: number; selected: boolean; onPointerDown: (event: PointerEvent<HTMLElement>, index: number, kind: "move" | "resize") => void; onSelect: () => void }) {
  const box = "bbox" in element ? element.bbox : element.type === "line" ? { x: Math.min(element.start.x, element.end.x), y: Math.min(element.start.y, element.end.y), width: Math.abs(element.end.x - element.start.x), height: Math.abs(element.end.y - element.start.y) } : { x: 0, y: 0, width: 0.1, height: 0.1 };
  const base = { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${Math.max(box.width, 0.01) * 100}%`, height: `${Math.max(box.height, 0.01) * 100}%` };
  const selectClass = selected ? "ring-2 ring-[#173bff]" : "hover:ring-1 hover:ring-[#8d9cff]";
  const common = { onClick: (event: React.MouseEvent) => { event.stopPropagation(); onSelect(); }, onPointerDown: (event: PointerEvent<HTMLElement>) => onPointerDown(event, index, "move"), style: base };
  const resize = selected && <span onPointerDown={(event) => onPointerDown(event, index, "resize")} className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-sm bg-[#173bff]" />;
  if (element.type === "text") return <div {...common} className={`absolute z-10 overflow-hidden whitespace-pre-wrap border border-transparent ${selectClass}`} style={{ ...base, color: colorValue(element.style.color), backgroundColor: element.style.backgroundColor ? colorValue(element.style.backgroundColor) : "transparent", fontFamily: element.style.fontFamily ?? (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(element.text ?? "") ? "Segoe UI Emoji" : "Aptos"), fontSize: `${Math.max(4, (element.style.fontSizeRatio ?? 0.035) * 540)}px`, fontWeight: element.style.bold ? 700 : 400, fontStyle: element.style.italic ? "italic" : "normal", textAlign: element.style.alignment === "unknown" ? "left" : element.style.alignment }}>{element.text ?? "검수 필요: 읽을 수 없는 글자"}{resize}</div>;
  if (element.type === "shape") return <div {...common} className={`absolute z-10 border ${selectClass}`} style={{ ...base, backgroundColor: element.fillColor ?? "transparent", borderColor: colorValue(element.strokeColor), borderWidth: element.strokeWidthRatio ? Math.max(1, element.strokeWidthRatio * 720) : 1, borderRadius: element.shapeType === "circle" || element.shapeType === "ellipse" ? "50%" : element.shapeType === "roundedRectangle" ? "12px" : "2px" }}>{resize}</div>;
  if (element.type === "line") return <div {...common} className={`absolute z-10 border-t ${selectClass}`} style={{ ...base, borderColor: colorValue(element.color), borderTopWidth: 2, transform: `rotate(${Math.atan2(element.end.y - element.start.y, element.end.x - element.start.x) * 180 / Math.PI}deg)`, transformOrigin: "left center" }}>{resize}</div>;
  return <div {...common} className={`absolute z-10 border border-dashed border-[#7180a0] bg-[#dbe2f0]/40 ${selectClass}`} style={base}>{element.type === "table" ? "표" : "이미지"}{resize}</div>;
}

function PropertiesPanel({ element, onUpdate, onDelete }: { element: SlideAnalysis["elements"][number]; onUpdate: (updater: (element: SlideAnalysis["elements"][number]) => SlideAnalysis["elements"][number]) => void; onDelete: () => void }) {
  const box = "bbox" in element ? element.bbox : null;
  const updateBox = (key: "x" | "y" | "width" | "height", value: number) => { if (box) onUpdate((current) => "bbox" in current ? { ...current, bbox: { ...current.bbox, [key]: clamp(value) } } : current); };
  return <div className="mt-5 space-y-5"><div className="flex items-center justify-between"><span className="rounded-full bg-[#eef1ff] px-3 py-1 text-xs font-semibold text-[#173bff]">{element.type}</span><button type="button" onClick={onDelete} className="text-xs text-red-500">삭제</button></div>{box && <div className="grid grid-cols-2 gap-3">{(["x", "y", "width", "height"] as const).map((key) => <label key={key} className="text-xs text-black/50">{key === "x" ? "X" : key === "y" ? "Y" : key === "width" ? "너비" : "높이"}<input type="number" min="0" max="1" step="0.01" value={Number(box[key].toFixed(3))} onChange={(event) => updateBox(key, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-black/10 px-2 py-2 text-sm text-black" /></label>)}</div>}{element.type === "text" && <><label className="block text-xs text-black/50">문구<textarea value={element.text ?? ""} onChange={(event) => onUpdate((current) => current.type === "text" ? { ...current, text: event.target.value } : current)} className="mt-1 min-h-24 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-black" /></label><label className="block text-xs text-black/50">글꼴 크기(pt)<input type="number" min="8" max="72" value={Math.round((element.style.fontSizeRatio ?? 0.035) * 540)} onChange={(event) => onUpdate((current) => current.type === "text" ? { ...current, style: { ...current.style, fontSizeRatio: Number(event.target.value) / 540 } } : current)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-black" /></label><label className="block text-xs text-black/50">색상<input type="color" value={colorValue(element.style.color)} onChange={(event) => onUpdate((current) => current.type === "text" ? { ...current, style: { ...current.style, color: event.target.value } } : current)} className="mt-1 h-9 w-full rounded-lg border border-black/10 p-1" /></label><label className="flex items-center gap-2 text-sm text-black/70"><input type="checkbox" checked={element.style.bold ?? false} onChange={(event) => onUpdate((current) => current.type === "text" ? { ...current, style: { ...current.style, bold: event.target.checked } } : current)} /> 굵게</label><label className="block text-xs text-black/50">정렬<select value={element.style.alignment} onChange={(event) => onUpdate((current) => current.type === "text" ? { ...current, style: { ...current.style, alignment: event.target.value as typeof current.style.alignment } } : current)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-black"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option><option value="justify">양쪽</option></select></label></>}{element.type === "shape" && <><label className="block text-xs text-black/50">채우기 색상<input type="color" value={colorValue(element.fillColor)} onChange={(event) => onUpdate((current) => current.type === "shape" ? { ...current, fillColor: event.target.value } : current)} className="mt-1 h-9 w-full rounded-lg border border-black/10 p-1" /></label><label className="block text-xs text-black/50">테두리 색상<input type="color" value={colorValue(element.strokeColor)} onChange={(event) => onUpdate((current) => current.type === "shape" ? { ...current, strokeColor: event.target.value } : current)} className="mt-1 h-9 w-full rounded-lg border border-black/10 p-1" /></label></>}{element.type !== "text" && element.type !== "shape" && <p className="text-sm leading-6 text-black/45">이 객체 유형은 선택·이동·삭제와 위치 조절을 지원합니다. 세부 속성 편집은 다음 단계에서 추가할 수 있습니다.</p>}</div>;
}
