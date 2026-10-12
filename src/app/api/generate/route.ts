import { NextResponse } from "next/server";
import { analyzeResponseSchema, pptxJsonPayloadSchema, slideAnalysisSchema } from "@/app/lib/analysis/schema";
import { generatePptx, PptxGenerationMode, PptxSource } from "@/app/lib/pptx/generator";

export const runtime = "nodejs";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const acceptedTypes = new Set(["image/png", "image/jpeg"]);

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function safeFilename(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "slide-to-pptx";
  return `${base}.pptx`;
}

function pptxResponse(buffer: Buffer, filename: string) {
  const encodedFilename = encodeURIComponent(safeFilename(filename));
  return new Response(new Uint8Array(buffer), { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Content-Length": String(buffer.length), "Content-Disposition": `attachment; filename="slide-to-pptx.pptx"; filename*=UTF-8''${encodedFilename}`, "Cache-Control": "no-store" } });
}

async function generateFromSources(sources: PptxSource[], mode: PptxGenerationMode, filename: string) {
  if (mode === "background" && sources.some((source) => !source.dataUrl)) {
    return errorResponse("원본 이미지가 없는 JSON은 배경 유지 모드를 사용할 수 없습니다. dataUrl을 포함하거나 개별 객체 재구성 모드를 사용하세요.", 400, "MISSING_SOURCE_IMAGE");
  }
  try {
    return pptxResponse(await generatePptx(sources, mode), filename);
  } catch (error) {
    console.error("PPTX generation failed", error);
    return errorResponse("PPTX 생성에 실패했습니다. 입력 JSON은 보존되어 있습니다.", 500, "GENERATION_FAILED");
  }
}

function dataUrlForSource(dataUrl: string | undefined, mimeType: "image/png" | "image/jpeg") {
  if (!dataUrl) return "";
  return dataUrl.startsWith(`data:${mimeType};base64,`) ? dataUrl : "";
}

function normalizeRegionTypes(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const object = payload as Record<string, unknown>;
  if (!Array.isArray(object.sources)) return payload;
  const aliases: Record<string, string> = { group: "panel", container: "panel", background: "slide", header: "section", footer: "section", image_group: "imageGroup" };
  return {
    ...object,
    sources: object.sources.map((source) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) return source;
      const sourceObject = source as Record<string, unknown>;
      const analysis = sourceObject.analysis;
      if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return source;
      const analysisObject = analysis as Record<string, unknown>;
      if (!Array.isArray(analysisObject.regions)) return source;
      return {
        ...sourceObject,
        analysis: {
          ...analysisObject,
          regions: analysisObject.regions.map((region) => {
            if (!region || typeof region !== "object" || Array.isArray(region)) return region;
            const regionObject = region as Record<string, unknown>;
            const rawType = typeof regionObject.type === "string" ? regionObject.type : "unknown";
            return { ...regionObject, type: aliases[rawType] ?? (['slide', 'title', 'section', 'card', 'panel', 'table', 'imageGroup', 'unknown'].includes(rawType) ? rawType : "unknown") };
          }),
        },
      };
    }),
  };
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return errorResponse("PPTX JSON을 읽을 수 없습니다.", 400, "INVALID_JSON");
    }
    const parsed = pptxJsonPayloadSchema.safeParse(normalizeRegionTypes(payload));
    if (!parsed.success) {
      console.error("PPTX JSON schema validation failed", JSON.stringify(parsed.error.issues));
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue?.path.length ? firstIssue.path.join(".") : "최상위 구조";
      return errorResponse(`PPTX JSON 형식이 올바르지 않습니다. 확인할 항목: ${path} (${firstIssue?.message ?? "값이 올바르지 않습니다."})`, 400, "INVALID_JSON");
    }
    const sources: PptxSource[] = parsed.data.sources.map((source) => ({
      filename: source.filename,
      mimeType: source.mimeType,
      dataUrl: dataUrlForSource(source.dataUrl, source.mimeType),
      pixelWidth: source.pixelWidth,
      pixelHeight: source.pixelHeight,
      analysis: source.analysis,
    }));
    return generateFromSources(sources, parsed.data.mode, sources.length === 1 ? sources[0].filename : "slide-to-pptx-json-export");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("multipart/form-data 요청을 읽을 수 없습니다.", 400, "INVALID_REQUEST");
  }

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) return errorResponse("PPTX로 만들 이미지가 없습니다.", 400, "NO_FILES");
  if (files.length > MAX_FILES) return errorResponse(`한 번에 최대 ${MAX_FILES}장까지 생성할 수 있습니다.`, 400, "TOO_MANY_FILES");
  for (const file of files) {
    if (!acceptedTypes.has(file.type)) return errorResponse(`${file.name}: PNG 또는 JPEG 이미지만 사용할 수 있습니다.`, 415, "UNSUPPORTED_MEDIA_TYPE");
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return errorResponse(`${file.name}: 파일 크기는 20MB 이하여야 합니다.`, 413, "FILE_SIZE_LIMIT");
  }

  const mode = formData.get("mode");
  if (mode !== "background" && mode !== "rebuild") return errorResponse("생성 모드는 background 또는 rebuild여야 합니다.", 400, "INVALID_MODE");

  let analysisPayload: unknown;
  try {
    analysisPayload = JSON.parse(String(formData.get("analyses") ?? ""));
  } catch {
    return errorResponse("분석 결과 JSON을 읽을 수 없습니다.", 400, "INVALID_ANALYSIS");
  }
  const parsedAnalyses = analyzeResponseSchema.safeParse(analysisPayload);
  if (!parsedAnalyses.success) {
    console.error("Analysis payload schema validation failed", JSON.stringify(parsedAnalyses.error.issues));
    return errorResponse("분석 결과가 지정된 JSON 스키마와 일치하지 않습니다.", 400, "INVALID_ANALYSIS");
  }
  if (parsedAnalyses.data.results.length !== files.length) return errorResponse("분석 결과가 이미지와 일치하지 않습니다.", 400, "INVALID_ANALYSIS");

  try {
    const sources: PptxSource[] = [];
    for (const [index, file] of files.entries()) {
      const result = parsedAnalyses.data.results[index];
      const analysis = slideAnalysisSchema.parse(result.analysis);
      const bytes = Buffer.from(await file.arrayBuffer());
      if (analysis.source.width !== result.original.width || analysis.source.height !== result.original.height) {
        console.warn("Analysis/source pixel dimensions differ; normalized coordinates will use the uploaded image dimensions for PPTX crop:", { analysis: analysis.source, original: { width: result.original.width, height: result.original.height }, filename: file.name });
      }
      sources.push({ filename: file.name, mimeType: file.type as "image/png" | "image/jpeg", dataUrl: `data:${file.type};base64,${bytes.toString("base64")}`, pixelWidth: result.original.width, pixelHeight: result.original.height, analysis });
    }

    return generateFromSources(sources, mode as PptxGenerationMode, files.length === 1 ? files[0].name : "slide-to-pptx-export");
  } catch (error) {
    console.error("PPTX generation failed", error);
    return errorResponse("PPTX 생성에 실패했습니다. 원본 이미지는 보존되어 있습니다.", 500, "GENERATION_FAILED");
  }
}
