# Slide to PPTX

이미지 기반 자료를 편집 가능한 PowerPoint 슬라이드로 변환하는 웹앱입니다. PNG/JPG/JPEG 다중 선택, 드래그 앤 드롭, 이미지 검증, 썸네일 미리보기, 순서 변경과 삭제, 서버 측 AI 분석, 구조 디버그 오버레이, PPTX 생성 흐름을 제공합니다.

## 요구 환경

- Node.js 20 이상
- pnpm 9 이상 (또는 호환되는 npm)

## 설치 및 실행

```bash
pnpm install
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

프로덕션 빌드와 실행은 다음과 같습니다.

```bash
pnpm build
pnpm start
```

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 서버 전용 AI API 키를 입력하세요. `.env.local`은 `.gitignore`에 포함되어 저장소에 커밋되지 않습니다. 브라우저에 노출되는 `NEXT_PUBLIC_` 접두사에는 비밀 키를 넣지 마세요.

```bash
Copy-Item .env.example .env.local
```

현재 다음 AI provider를 선택할 수 있습니다.

### OpenAI 호환 API

```env
AI_PROVIDER=openai-compatible
AI_API_KEY=...
AI_MODEL=gpt-4.1-mini
AI_API_BASE_URL=https://api.openai.com/v1/chat/completions
```

### Google Gemini

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
AI_MODEL=gemini-3.5-flash-lite
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent
```

`AI_API_KEY`를 Gemini 키로 사용해도 되지만 `GEMINI_API_KEY`를 우선 권장합니다. 별도 호환 엔드포인트를 사용할 때는 `GEMINI_API_BASE_URL`을 지정할 수 있습니다.

### Anthropic Claude

```env
AI_PROVIDER=claude
ANTHROPIC_API_KEY=...
AI_MODEL=claude-sonnet-4-6
CLAUDE_MAX_TOKENS=8192
```

Claude는 `ANTHROPIC_API_KEY`를 우선 사용하며, 필요하면 `CLAUDE_API_BASE_URL`로 엔드포인트를 바꿀 수 있습니다.

### 로컬 모델(Ollama)

1. Ollama를 설치하고 비전 모델을 받습니다.

```bash
ollama pull llama3.2-vision
```

2. `.env.local`을 다음처럼 설정합니다.

```env
AI_PROVIDER=local
AI_MODEL=llama3.2-vision
LOCAL_AI_BASE_URL=http://localhost:11434/api/chat
```

Ollama가 다른 호스트나 포트에서 실행 중이면 `LOCAL_AI_BASE_URL`을 변경하세요. 로컬 모드는 기본적으로 API 키가 필요하지 않습니다. Ollama는 이미지 입력과 JSON Schema 형식 출력을 지원하므로 이 앱의 동일한 분석 스키마를 사용할 수 있습니다.

provider, 모델 또는 API 키를 변경한 뒤에는 개발 서버를 재시작해야 합니다. 현재 실행 중인 터미널에서 `Ctrl+C`를 누른 다음 아래 명령으로 다시 실행하세요.

```powershell
node_modules\.bin\next.cmd dev -p 3000
```

### Vercel 배포 설정

Vercel 프로젝트의 Settings → Environment Variables에 다음 값을 서버 환경변수로 등록하세요. `NEXT_PUBLIC_` 접두사는 붙이지 않습니다.

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=발급받은_키
AI_MODEL=gemini-3.8-flash
AI_TIMEOUT_MS=120000
AI_RETRY_COUNT=2
AI_OCR=0
AI_TEXT_RECHECK=0
GEMINI_THINKING_LEVEL=low
GEMINI_MAX_OUTPUT_TOKENS=32768
```

`AI_PROVIDER`를 생략해도 `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`가 있으면 Gemini를 자동 선택합니다. 환경변수 저장 후에는 Vercel에서 새 배포를 실행해야 서버 함수가 새 값을 읽습니다. 키가 브라우저 응답이나 로그에 노출되지 않도록 API route의 서버 환경변수로만 사용합니다.

Gemini가 일시적으로 `503 UNAVAILABLE` 또는 과부하 오류를 반환하면 `AI_RETRY_COUNT`만큼 제한적으로 재시도합니다(기본 2회). 계속 실패하면 잠시 후 다시 시도하거나 Gemini 모델 상태를 확인하세요.

## JSON으로 바로 PPTX 만들기

첫 화면의 `JSON으로 바로 PPTX 만들기` 입력란에 아래 형식의 JSON을 붙여 넣으면 AI 분석과 이미지 업로드 없이 PPTX를 생성할 수 있습니다.

```json
{
  "schemaVersion": "1.0",
  "mode": "rebuild",
  "sources": [
    {
      "filename": "slide-1.png",
      "mimeType": "image/png",
      "pixelWidth": 1920,
      "pixelHeight": 1080,
      "analysis": {
        "schemaVersion": "1.0",
        "title": "예시 슬라이드",
        "source": { "width": 1920, "height": 1080 },
        "coordinateSystem": { "type": "normalized", "origin": "top-left", "units": "ratio", "axis": "x-right-y-down" },
        "regions": [],
        "elements": [],
        "warnings": []
      }
    }
  ]
}
```

좌표는 원본 이미지 기준 0~1 정규화 좌표를 사용합니다. `mode`는 `rebuild` 또는 `background`이며, `background` 모드에서는 각 source에 원본 이미지의 `dataUrl`을 추가해야 합니다. `dataUrl`이 없으면 `rebuild` 모드에서 텍스트와 도형만 생성하고 이미지 요소는 건너뜁니다. 앱에서 저장한 `slide-analysis.json`도 이 형식으로 저장되므로 그대로 다시 입력할 수 있습니다.

슬라이드 이미지를 AI에 첨부할 때는 다음처럼 요청하세요.

```text
이 슬라이드 이미지를 편집 가능한 PowerPoint용 JSON으로 변환해줘.
schemaVersion="1.0", mode="rebuild", sources 배열을 포함하고,
각 source에는 filename, mimeType, pixelWidth, pixelHeight, analysis를 넣어줘.
analysis의 좌표는 원본 이미지 기준 0~1 정규화 좌표로 작성하고,
텍스트·도형·선·표·이미지를 elements에 각각 분리해줘.
읽을 수 없는 글자는 추측하지 말고 text=null, needsReview=true로 남겨줘.
설명이나 마크다운 없이 JSON 객체 하나만 반환해줘.
```

반환된 답변은 코드블록이나 설명 문장을 포함하지 않는 순수 JSON이어야 합니다. 답변 전체를 복사해 UTF-8 인코딩의 `slide-to-pptx.json` 파일로 저장한 뒤 첫 화면의 JSON 파일 선택으로 업로드할 수 있습니다.

재시작 후 터미널에 `Environments: .env.local`이 표시되는지 확인하세요. API 키가 없으면 실제 호출을 하지 않고 설정 방법을 안내하는 오류를 반환합니다. 모든 provider의 최종 응답은 서버에서 동일한 Zod 스키마로 검증합니다.

## 반복 분석할 기준 이미지

같은 슬라이드를 반복해서 개선하려면 이미지를 작업 폴더의 `test-output/reference-slide.png` 또는 `.jpg`로 저장하세요. `test-output/`은 결과 확인용으로 git에 포함되지 않으므로 실제 기밀 이미지를 커밋하지 않습니다. 원본 크기를 지정한 뒤 개발 서버가 실행 중인 상태에서 다음 명령을 실행하면 현재 분석 결과의 텍스트 목록과 bbox를 확인할 수 있습니다.

```powershell
$env:REFERENCE_WIDTH = "1920"
$env:REFERENCE_HEIGHT = "1080"
node scripts\verify-analysis.mjs
```

다른 파일을 직접 지정할 수도 있습니다.

```powershell
node scripts\verify-analysis.mjs .\test-output\reference-slide.png
```

분석 결과 fixture로 두 PPTX 생성 모드를 비교하려면 다음을 사용합니다. 이 검증은 실제 AI를 다시 호출하지 않고 저장된 분석 JSON을 사용하므로 추가 API 비용이 없습니다.

```powershell
node scripts\verify-reference-pptx.mjs .\test-output\reference-slide.png .\test-output\reference-analysis-domain-fixed.json background .\test-output\reference-background-corrected.pptx
node scripts\verify-reference-pptx.mjs .\test-output\reference-slide.png .\test-output\reference-analysis-domain-fixed.json rebuild .\test-output\reference-rebuild-corrected.pptx
```

`background` 모드는 원본 시각을 그대로 보존하고, `rebuild` 모드는 분석된 텍스트·도형·아이콘·사진을 개별 객체로 재구성합니다. `rebuild` 모드에서 분석 결과의 `regions`에 카드·패널의 `borderColor`가 있으면 해당 영역 테두리도 별도 PowerPoint 도형으로 렌더링합니다. 그룹 간 연결선은 `line` 요소의 정규화된 `start`·`end` 좌표와 `startArrow`·`endArrow`로 보존되며, PPTX에서는 편집 가능한 선과 화살촉으로 생성됩니다. 재구성 모드에서 AI가 이미지나 아이콘을 누락하면 해당 객체도 생성할 수 없으므로, 최신 분석 JSON으로 다시 생성해야 합니다.

이 스크립트는 실제 설정된 AI provider를 호출합니다. 가짜 결과를 만들지 않으며 provider 비용과 이미지 개인정보 전송 주의사항이 적용됩니다. 텍스트 누락 여부를 자동 판정하려면 원본과 출력 목록을 대조하거나 별도 정답 텍스트 목록을 fixture로 관리해야 합니다.

Gemini에서 작은 글자와 장식용 글자를 한 번 더 검사하려면 서버 실행 환경에 다음 값을 설정하세요. 이미지마다 AI 요청이 한 번 추가되므로 비용과 처리 시간이 증가합니다. 두 번째 응답이 스키마를 지키지 못해도 첫 번째 정상 분석 결과로 자동 fallback합니다.

```powershell
$env:AI_TEXT_RECHECK = "1"
pnpm dev
```

텍스트 위치를 픽셀 기준으로 보정하고 AI가 놓친 고신뢰도 텍스트를 보조적으로 추가하려면 Tesseract.js OCR을 켭니다. 한국어와 영어 학습 데이터를 사용하며 이미지마다 OCR 처리가 추가되므로 처리 시간이 늘어납니다. OCR 결과의 신뢰도가 낮은 항목은 자동으로 `needsReview`로 표시하고, OCR 오류가 발생해도 AI 분석 결과는 유지합니다.

```powershell
$env:AI_OCR = "1"
$env:AI_TEXT_RECHECK = "1"
pnpm dev
```

OCR은 원본 이미지의 픽셀 좌표를 정규화하여 텍스트 bbox를 보정합니다. 정확히 읽지 못한 문자를 임의로 PPTX에 추가하지 않으며, OCR이 추가한 텍스트는 검수 대상으로 표시합니다.

## 주요 구조

- `src/app/page.tsx`: 업로드 화면과 기본 변환 상태 흐름
- `src/app/globals.css`: 전역 스타일 및 Tailwind 진입점
- `src/app/layout.tsx`: 문서 메타데이터와 공통 레이아웃
- `src/app/api/analyze/route.ts`: 서버 측 이미지 분석 API 라우트
- `src/app/lib/analysis/adapter.ts`: 교체 가능한 AI 제공업체 어댑터와 타임아웃 처리
- `src/app/lib/analysis/schema.ts`: 분석 결과 Zod 및 JSON Schema
- `.env.example`: 환경변수 템플릿

## 좌표 및 PPTX 생성 규칙

- 원본 이미지 크기는 업로드된 실제 픽셀 크기(`pixelWidth`, `pixelHeight`)로 서버에서 보존합니다.
- AI 분석 결과의 `bbox`와 선 좌표는 원본 이미지에 대한 정규화 좌표(0~1)입니다.
- PPTX 생성 시 정규화 좌표를 PowerPoint 인치 좌표로 한 번만 변환합니다.
- 슬라이드 크기는 `13.333333 × 7.5 inch` 와이드(16:9)로 `src/app/lib/pptx/generator.ts`의 `SLIDE_SIZE`에서 관리합니다.
- 잘못된 크기, 슬라이드 밖 좌표, 0 길이 선은 서버 로그의 geometry diagnostics에 기록하고 생성 대상에서 제외하거나 경계 안으로 제한합니다.
- 이미지 삽입은 원본 픽셀 비율을 확인해 대상 상자 안에서 종횡비를 유지합니다. 원본과 슬라이드 비율이 사실상 같은 레퍼런스 이미지는 전체 슬라이드를 채웁니다.

## 계층형 분석 결과와 디버그 확인

분석 결과는 기존 `elements` 목록을 유지하면서 다음 필드를 추가로 보존합니다.

- `source`: 실제 원본 이미지의 픽셀 크기
- `coordinateSystem`: `normalized / top-left / ratio / x-right-y-down`
- `regions`: `slide`, `title`, `section`, `card`, `panel`, `table`, `imageGroup` 등의 영역과 부모 영역
- 각 element의 `id`, `parentId`, `groupId`, `overlapIds`
- `confidence`, `needsReview`, `reviewReason`, 최상위 `warnings`

분석이 끝난 뒤 화면의 `경계` 체크박스를 켜면 원본 미리보기 위에 region과 element의 경계 상자를 겹쳐 볼 수 있습니다. `분석 JSON 저장` 버튼은 현재 분석 결과와 원본 항목 ID를 `slide-analysis.json`으로 저장합니다. 이 JSON은 AI가 반환한 구조와 서버가 수행한 좌표 정규화·부모 지정·겹침 진단을 사람이 비교하는 용도입니다.

영역이나 객체를 확정할 수 없을 때는 임의로 내용을 채우지 않고 `needsReview`와 `warnings`에 남깁니다. 영역이 전혀 반환되지 않으면 서버가 전체 슬라이드 영역을 검수용 fallback으로 추가하지만, 이것은 AI 분석 품질이 충분하다는 의미가 아닙니다.

## 업로드 정책

- 파일 형식: PNG, JPG, JPEG
- 파일당 최대 크기: 20MB
- 전체 업로드 최대 크기: 100MB
- 최대 파일 개수: 10장
- 브라우저에서 이미지 디코딩을 시도해 손상된 이미지를 거부합니다.

## 수동 확인 항목

1. 파일 선택으로 PNG/JPG/JPEG 여러 장을 추가하고 썸네일이 표시되는지 확인합니다.
2. 파일을 업로드 영역으로 드래그 앤 드롭해 동일한 흐름이 동작하는지 확인합니다.
3. 썸네일의 좌우 버튼 또는 썸네일 드래그로 순서가 바뀌는지 확인합니다.
4. 썸네일 삭제 버튼과 전체 삭제가 동작하는지 확인합니다.
5. WEBP/텍스트 파일, 손상된 이미지, 20MB 초과 파일, 10장 초과 선택 시 오류가 표시되는지 확인합니다.
6. 세로·가로 이미지가 찌그러지지 않고 원래 가로세로 비율로 표시되는지 확인합니다.

## 비용 및 개인정보 주의사항

- 슬라이드 이미지는 분석 요청 시 설정한 AI 제공업체로 전송되며, 이미지 안의 개인정보·기밀자료가 외부 서비스로 전달될 수 있습니다. 사용 전 조직의 보안·보존 정책과 제공업체 약관을 확인하세요.
- 이미지별 분석 요청은 AI 사용량과 비용을 발생시킬 수 있습니다. 모델, 이미지 상세도, 파일 수와 크기에 따라 비용이 달라지므로 운영 환경에서는 예산 한도·레이트 리밋·사용량 모니터링을 추가하세요.
- 현재 서버는 분석 결과를 영구 저장하지 않습니다. 브라우저 화면에서 원본 미리보기와 분석 결과를 함께 유지하며, 새로고침하면 사라집니다.

## 미해결 사항

- 분석 결과 영구 저장 및 작업 이력
- 업로드 파일 크기·해상도 서버 검증
- 실제 AI provider 연결 상태는 실행 환경의 네트워크·키·모델 설정에 따라 달라지며, provider 오류가 발생하면 분석 결과를 만들지 않음
- 영역 계층과 작은 글자·장식 문자 인식 품질은 모델과 OCR 설정에 따라 추가 검수가 필요함
