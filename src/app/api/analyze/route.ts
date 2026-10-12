import { NextResponse } from "next/server";
import { AnalysisError, createAnalysisAdapter, normalizeReferenceDomainCards } from "@/app/lib/analysis/adapter";
import { applyOcrTextGeometry } from "@/app/lib/analysis/ocr";
import { analyzeResponseSchema, AnalyzeResult } from "@/app/lib/analysis/schema";

export const runtime = "nodejs";
// Gemini 재검수와 선택적 OCR이 같은 요청 안에서 실행될 수 있으므로,
// Vercel이 기본 실행 시간에 도달하기 전에 요청을 종료하지 않도록 명시한다.
// 실제 허용 시간은 배포 플랜의 최대치에 의해 제한될 수 있다.
export const maxDuration = 300;

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const acceptedTypes = new Set(["image/png", "image/jpeg"]);

type ImageMetadata = { id: string; width: number; height: number };

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("multipart/form-data 요청을 읽을 수 없습니다.", 400, "INVALID_REQUEST");
  }

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) return errorResponse("분석할 이미지가 없습니다.", 400, "NO_FILES");
  if (files.length > MAX_FILES) return errorResponse(`한 번에 최대 ${MAX_FILES}장까지 분석할 수 있습니다.`, 400, "TOO_MANY_FILES");

  let metadata: ImageMetadata[];
  try {
    const parsed = JSON.parse(String(formData.get("metadata") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    metadata = parsed.map((item) => ({ id: String(item.id), width: Number(item.width), height: Number(item.height) }));
  } catch {
    return errorResponse("이미지 원본 메타데이터가 올바르지 않습니다.", 400, "INVALID_METADATA");
  }
  if (metadata.length !== files.length || metadata.some((item) => !item.id || !Number.isInteger(item.width) || !Number.isInteger(item.height) || item.width < 1 || item.height < 1)) {
    return errorResponse("이미지 원본 크기 정보가 올바르지 않습니다.", 400, "INVALID_METADATA");
  }

  const totalSize = files.reduce((total, file) => total + file.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) return errorResponse("전체 이미지 용량이 100MB를 초과합니다.", 413, "TOTAL_SIZE_LIMIT");
  for (const file of files) {
    if (!acceptedTypes.has(file.type)) return errorResponse(`${file.name}: PNG 또는 JPEG 이미지만 분석할 수 있습니다.`, 415, "UNSUPPORTED_MEDIA_TYPE");
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return errorResponse(`${file.name}: 파일 크기는 20MB 이하여야 합니다.`, 413, "FILE_SIZE_LIMIT");
  }

  const adapter = createAnalysisAdapter();
  const results: AnalyzeResult[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const originalBytes = Buffer.from(await file.arrayBuffer());
      const input = {
        imageDataUrl: `data:${file.type};base64,${originalBytes.toString("base64")}`,
        filename: file.name,
        mimeType: file.type as "image/png" | "image/jpeg",
        width: metadata[index].width,
        height: metadata[index].height,
      };
      let result = await adapter.analyze(input);
      if (process.env.AI_OCR === "1") {
        try {
          result = await applyOcrTextGeometry(input, result);
        } catch (error) {
          console.warn("OCR 보정이 생략되었습니다:", error instanceof Error ? error.message : "unknown error");
        }
      }
      result = normalizeReferenceDomainCards(result);
      results.push({
        itemId: metadata[index].id,
        original: { filename: file.name, mimeType: file.type as "image/png" | "image/jpeg", byteSize: file.size, width: metadata[index].width, height: metadata[index].height },
        analysis: result,
      });
    }
  } catch (error) {
    if (error instanceof AnalysisError) return errorResponse(error.message, error.status, error.code);
    return errorResponse("슬라이드 분석 중 알 수 없는 오류가 발생했습니다.", 500, "INTERNAL_ERROR");
  }

  const parsedResponse = analyzeResponseSchema.safeParse({ results });
  if (!parsedResponse.success) return errorResponse("서버 분석 결과가 내부 JSON 스키마 검증을 통과하지 못했습니다.", 502, "INVALID_RESPONSE");
  return NextResponse.json(parsedResponse.data);
}
