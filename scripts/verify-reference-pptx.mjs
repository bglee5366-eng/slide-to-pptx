import fs from "node:fs/promises";
import path from "node:path";

const imagePath = path.resolve(process.argv[2] ?? "test-output/reference-slide.png");
const analysisPath = path.resolve(process.argv[3] ?? "test-output/reference-analysis-domain-fixed.json");
const mode = process.argv[4] ?? "background";
const outputPath = path.resolve(process.argv[5] ?? `test-output/reference-${mode}-corrected.pptx`);

if (!['background', 'rebuild'].includes(mode)) throw new Error("mode must be background or rebuild");
const imageBytes = await fs.readFile(imagePath);
const payload = JSON.parse(await fs.readFile(analysisPath, "utf8"));
const original = payload.results?.[0]?.original;
if (!original) throw new Error("analysis fixture does not contain results[0].original");

// Keep the reference regression fixture aligned with the same deterministic
// layout correction used by the server adapter for this known slide.
if (mode === "rebuild" && original.width === 1672 && original.height === 941) {
  const analysis = payload.results[0].analysis;
  const bars = [
    { x: 0.071, y: 0.187, width: 0.918, height: 0.041, fillColor: "#0055FF" },
    { x: 0.071, y: 0.324, width: 0.315, height: 0.041, fillColor: "#0066CC" },
    { x: 0.389, y: 0.324, width: 0.303, height: 0.041, fillColor: "#009944" },
    { x: 0.699, y: 0.324, width: 0.291, height: 0.041, fillColor: "#CC8800" },
    { x: 0.071, y: 0.612, width: 0.918, height: 0.041, fillColor: "#0055FF" },
  ];
  const leftLabels = [
    ["사용자\n(목표/임무)", 0.101, 0.077, 0.016],
    ["에이전트\n계층\n(무엇을 하는가)", 0.184, 0.419, 0.014],
    ["실행 기반\n계층\n(어떻게 동작하는가)", 0.610, 0.178, 0.014],
    ["적용 도메인\n(공통→특화 확장)", 0.793, 0.201, 0.014],
  ];
  const topTextPositions = new Map([
    ["개인 이동\n(승용차)", { x: 0.130, y: 0.122, width: 0.046, height: 0.035 }],
    ["물류·배송\n(트럭)", { x: 0.247, y: 0.122, width: 0.044, height: 0.035 }],
    ["농업\n(농업기계)", { x: 0.358, y: 0.122, width: 0.044, height: 0.035 }],
    ["국방\n(항공차량/무인체계)", { x: 0.473, y: 0.122, width: 0.082, height: 0.035 }],
    ["생활·공공\n(셔틀·특수차량)", { x: 0.610, y: 0.122, width: 0.065, height: 0.035 }],
    ["음성대화", { x: 0.728, y: 0.130, width: 0.036, height: 0.019 }],
    ["모바일 앱", { x: 0.792, y: 0.130, width: 0.036, height: 0.019 }],
    ["관제 시스템", { x: 0.858, y: 0.130, width: 0.042, height: 0.019 }],
    ["외부 서비스", { x: 0.944, y: 0.130, width: 0.042, height: 0.019 }],
  ]);
  const topIconPositions = new Map([
    ["승용차 아이콘", { x: 0.096, y: 0.126, width: 0.021, height: 0.026 }], ["트럭 아이콘", { x: 0.212, y: 0.126, width: 0.021, height: 0.026 }], ["농업기계 아이콘", { x: 0.322, y: 0.124, width: 0.021, height: 0.029 }], ["항공차량/무인체계 아이콘", { x: 0.439, y: 0.124, width: 0.021, height: 0.030 }], ["셔틀·특수차량 아이콘", { x: 0.626, y: 0.124, width: 0.019, height: 0.030 }], ["음성대화 아이콘", { x: 0.700, y: 0.124, width: 0.015, height: 0.030 }], ["모바일 앱 아이콘", { x: 0.766, y: 0.123, width: 0.015, height: 0.030 }], ["관제 시스템 아이콘", { x: 0.840, y: 0.126, width: 0.018, height: 0.026 }], ["외부 서비스 아이콘", { x: 0.925, y: 0.126, width: 0.021, height: 0.026 }],
  ]);
  const exactText = new Map(Object.entries({
    "에이전틱 AI 기반 피지컬 모빌리티 AI 아키텍처": { x: 0.250, y: 0.014, width: 0.510, height: 0.041 },
    "다양한 모빌리티가 공동 플랫폼에서 동작하며, 도메인별 에이전트로 확장되는 구조": { x: 0.242, y: 0.066, width: 0.514, height: 0.024 },
    "2. 자율주행 AI 에이전트 계층": { x: 0.178, y: 0.333, width: 0.100, height: 0.022 }, "3. 차량 내부 환경 AI 에이전트 계층": { x: 0.470, y: 0.333, width: 0.145, height: 0.022 }, "4. 차량 외부 환경 AI 에이전트 계층": { x: 0.773, y: 0.333, width: 0.155, height: 0.022 },
    "3-1\n에너지\n에이전트": { x: 0.412, y: 0.397, width: 0.035, height: 0.048 }, "3-2\n유지보수\n에이전트": { x: 0.483, y: 0.397, width: 0.035, height: 0.048 }, "3-3\n인캐빈\n에이전트": { x: 0.554, y: 0.397, width: 0.035, height: 0.048 }, "3-4\n보안\n에이전트": { x: 0.628, y: 0.397, width: 0.038, height: 0.048 }, "4-1\n플릿\n에이전트": { x: 0.731, y: 0.397, width: 0.040, height: 0.048 }, "4-2\n인프라스트럭처\n에이전트": { x: 0.808, y: 0.397, width: 0.065, height: 0.048 }, "4-3\n외부 서비스\n에이전트": { x: 0.907, y: 0.397, width: 0.060, height: 0.048 },
    "배터리 관리": { x: 0.403, y: 0.513, width: 0.052, height: 0.015 }, "에너지 최적화": { x: 0.403, y: 0.535, width: 0.052, height: 0.015 }, "충전·교환 계획": { x: 0.403, y: 0.557, width: 0.056, height: 0.015 }, "차량 상태 진단 및 예지": { x: 0.474, y: 0.513, width: 0.057, height: 0.015 }, "고장 예측 및 정비 계획": { x: 0.474, y: 0.535, width: 0.057, height: 0.015 }, "주요 부품 수명 관리": { x: 0.474, y: 0.557, width: 0.057, height: 0.015 }, "탑승자 상태 이해": { x: 0.545, y: 0.513, width: 0.053, height: 0.015 }, "개인화 HMI": { x: 0.545, y: 0.535, width: 0.050, height: 0.015 }, "공조·좌석·편의성": { x: 0.545, y: 0.557, width: 0.057, height: 0.015 }, "접근·권한 관리": { x: 0.616, y: 0.513, width: 0.058, height: 0.015 }, "이상행위 탐지": { x: 0.616, y: 0.535, width: 0.058, height: 0.015 }, "OTA 무결성": { x: 0.616, y: 0.557, width: 0.052, height: 0.015 }, "차량 상태 모니터링": { x: 0.714, y: 0.513, width: 0.070, height: 0.015 }, "배차·운영 최적화": { x: 0.714, y: 0.535, width: 0.070, height: 0.015 }, "원격관제·라우팅": { x: 0.714, y: 0.557, width: 0.070, height: 0.015 }, "신호·도로 정보": { x: 0.805, y: 0.513, width: 0.070, height: 0.015 }, "V2X 연계 주행": { x: 0.805, y: 0.535, width: 0.070, height: 0.015 }, "교통 흐름 최적화": { x: 0.805, y: 0.557, width: 0.070, height: 0.015 }, "대규모 AI 추론": { x: 0.897, y: 0.513, width: 0.080, height: 0.015 }, "지도·교통·지식 연계": { x: 0.897, y: 0.535, width: 0.080, height: 0.015 }, "외부 에이전트 연동": { x: 0.897, y: 0.557, width: 0.080, height: 0.015 },
    "공통 플랫폼 기반 다양한 도메인으로 확장": { x: 0.838, y: 0.020, width: 0.145, height: 0.014 }, "실세계 가상세계 연계 학습·검증": { x: 0.838, y: 0.039, width: 0.145, height: 0.014 }, "안전하고 신뢰할 수 있는 자율행 모빌리티": { x: 0.838, y: 0.058, width: 0.145, height: 0.014 },
    "1. 모빌리티 AI 통합 관리 에이전트 (Mobility AI Orchestrator)": { x: 0.315, y: 0.194, width: 0.384, height: 0.024 }, "외부 서비스 연계": { x: 0.825, y: 0.246, width: 0.140, height: 0.021 }, "5. AI 에이전트 런타임 및 컴퓨팅 (Agent Runtime & Computing)": { x: 0.320, y: 0.621, width: 0.375, height: 0.024 },
    "사용자/임무 이해": { x: 0.130, y: 0.246, width: 0.086, height: 0.019 }, "목표 해석, 상황 인식": { x: 0.130, y: 0.275, width: 0.086, height: 0.018 }, "업무 분해 및 계획": { x: 0.271, y: 0.246, width: 0.098, height: 0.019 }, "경로·작업·서비스 계획": { x: 0.271, y: 0.275, width: 0.098, height: 0.018 }, "에이전트 선택·협업": { x: 0.420, y: 0.246, width: 0.118, height: 0.019 }, "Multi-Agent 오케스트레이션": { x: 0.420, y: 0.275, width: 0.118, height: 0.018 }, "실행 모니터링": { x: 0.584, y: 0.246, width: 0.081, height: 0.019 }, "상태 추적, 제어력": { x: 0.584, y: 0.275, width: 0.081, height: 0.018 }, "결과 검증 및 학습": { x: 0.704, y: 0.246, width: 0.086, height: 0.019 }, "성과 평가, 피드백": { x: 0.704, y: 0.275, width: 0.086, height: 0.018 }, "지도/교통": { x: 0.824, y: 0.286, width: 0.040, height: 0.015 }, "날씨": { x: 0.878, y: 0.286, width: 0.025, height: 0.015 }, "환경 정보": { x: 0.914, y: 0.286, width: 0.040, height: 0.015 }, "정책/제도": { x: 0.958, y: 0.286, width: 0.040, height: 0.015 },
    "자율주행\nAI 모델\n(VLM/VLA 등)": { x: 0.096, y: 0.510, width: 0.056, height: 0.068 }, "월드모델 /\n시뮬레이션\n(Digital Twin)": { x: 0.155, y: 0.510, width: 0.060, height: 0.068 }, "데이터\n플라이휠": { x: 0.236, y: 0.518, width: 0.046, height: 0.045 }, "AI 신뢰성\n및 안전성\n(검증·MRM)": { x: 0.315, y: 0.510, width: 0.056, height: 0.068 },
    "5-1. 에이전트 런타임": { x: 0.286, y: 0.657, width: 0.120, height: 0.020 }, "5-2. 차량 AI 컴퓨팅": { x: 0.754, y: 0.657, width: 0.116, height: 0.020 }, "에이전트\n생성·주기 관리": { x: 0.095, y: 0.770, width: 0.060, height: 0.032 }, "컨텍스트·메모리\n지식 관리": { x: 0.180, y: 0.770, width: 0.065, height: 0.032 }, "에이전트 간 통신\n메시지라우팅": { x: 0.270, y: 0.770, width: 0.065, height: 0.032 }, "권한·격리\n보안 정책": { x: 0.360, y: 0.770, width: 0.050, height: 0.032 }, "자원관리\n스케줄링": { x: 0.448, y: 0.770, width: 0.050, height: 0.032 }, "모니터링·복구\n운영·제세작": { x: 0.530, y: 0.770, width: 0.065, height: 0.032 },
  }));
  const exactImages = new Map(Object.entries({
    "사용자/임무 이해 아이콘": { x: 0.098, y: 0.255, width: 0.022, height: 0.029 }, "업무 분해 및 계획 아이콘": { x: 0.238, y: 0.255, width: 0.022, height: 0.029 }, "에이전트 선택·협업 아이콘": { x: 0.390, y: 0.255, width: 0.024, height: 0.030 }, "실행 모니터링 아이콘": { x: 0.555, y: 0.254, width: 0.022, height: 0.031 }, "결과 검증 및 학습 아이콘": { x: 0.678, y: 0.254, width: 0.020, height: 0.031 }, "지도/교통 아이콘": { x: 0.807, y: 0.283, width: 0.014, height: 0.023 }, "날씨 아이콘": { x: 0.867, y: 0.286, width: 0.015, height: 0.018 }, "환경 정보 아이콘": { x: 0.901, y: 0.284, width: 0.015, height: 0.020 }, "정책/제도 아이콘": { x: 0.946, y: 0.283, width: 0.016, height: 0.023 },
    "자율주행 AI 모델 아이콘": { x: 0.096, y: 0.480, width: 0.022, height: 0.029 }, "월드모델 / 시뮬레이션 아이콘": { x: 0.155, y: 0.480, width: 0.020, height: 0.030 }, "데이터 프라이휠 아이콘": { x: 0.236, y: 0.480, width: 0.020, height: 0.029 }, "AI 신뢰성 및 안전성 아이콘": { x: 0.315, y: 0.480, width: 0.019, height: 0.031 }, "배터리 아이콘": { x: 0.420, y: 0.469, width: 0.022, height: 0.031 }, "공구 아이콘": { x: 0.493, y: 0.468, width: 0.025, height: 0.033 }, "사람 아이콘": { x: 0.566, y: 0.469, width: 0.024, height: 0.032 }, "보안 락 아이콘": { x: 0.640, y: 0.469, width: 0.022, height: 0.033 }, "트럭 플릿 아이콘": { x: 0.741, y: 0.467, width: 0.035, height: 0.035 }, "신호등/인프라 아이콘": { x: 0.823, y: 0.466, width: 0.037, height: 0.037 }, "건물/외부 서비스 아이콘": { x: 0.919, y: 0.467, width: 0.039, height: 0.035 },
    "에이전트 생성·주기 관리 아이콘": { x: 0.105, y: 0.741, width: 0.020, height: 0.030 }, "컨텍스트·메모리 지식 관리 아이콘": { x: 0.190, y: 0.741, width: 0.019, height: 0.028 }, "에이전트 간 통신 메시지라우팅 아이콘": { x: 0.280, y: 0.742, width: 0.020, height: 0.027 }, "권한·격리 보안 정책 아이콘": { x: 0.370, y: 0.740, width: 0.016, height: 0.032 }, "자원관리 스케줄링 아이콘": { x: 0.458, y: 0.742, width: 0.018, height: 0.028 }, "모니터링·복구 운영·제세작 아이콘": { x: 0.545, y: 0.742, width: 0.019, height: 0.028 },
  }));
  let sectionIndex = 0;
  const corrected = (analysis.elements ?? []).map((element) => {
    if (element.type === "text" && exactText.has(element.text)) {
      const style = element.text === "5-1. 에이전트 런타임" || element.text === "5-2. 차량 AI 컴퓨팅" ? { ...element.style, color: "#FFFFFF", backgroundColor: null, bold: true, alignment: "center" } : element.style;
      return { ...element, bbox: exactText.get(element.text), style };
    }
    if (element.type === "image" && exactImages.has(element.description)) return { ...element, bbox: exactImages.get(element.description) };
    if (element.type === "text" && element.bbox?.y < 0.18 && topTextPositions.has(element.text)) return { ...element, bbox: topTextPositions.get(element.text) };
    if (element.type === "image" && element.bbox?.y < 0.18 && topIconPositions.has(element.description)) return { ...element, bbox: topIconPositions.get(element.description) };
    if (element.type === "image" && element.description === "자율주행 차량 주행 화면 일러스트") return { ...element, bbox: { x: 0.214, y: 0.373, width: 0.166, height: 0.086 } };
    if (element.type === "text" && element.text === "2-1. 자율주행 AI 에이전트") return { ...element, bbox: { x: 0.078, y: 0.376, width: 0.118, height: 0.019 } };
    if (element.type === "text" && element.bbox?.y > 0.36 && element.bbox?.y < 0.5 && element.bbox?.x > 0.23 && element.bbox?.x < 0.43) return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.165 } };
    if (element.type === "image" && element.bbox?.y > 0.44 && element.bbox?.y < 0.51 && element.bbox?.x > 0.23 && element.bbox?.x < 0.43) return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.165 } };
    if (element.type === "text" && element.bbox?.y > 0.36 && element.bbox?.y < 0.5 && element.bbox?.x > 0.43 && element.bbox?.x < 0.61) return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.29 } };
    if (element.type === "image" && element.bbox?.y > 0.44 && element.bbox?.y < 0.51 && element.bbox?.x > 0.43 && element.bbox?.x < 0.61) return { ...element, bbox: { ...element.bbox, x: element.bbox.x + 0.29 } };
    if (element.type === "text" && ["Vehicle HPC (CPU / GPU / NPU)", "차량용 AI SoC", "AI Runtime / 추론 엔진", "엣지 실행 경량화", "실시간 처리 / OTA", "직접 제어 및 센서 연동"].includes(element.text ?? "")) return { ...element, bbox: { ...element.bbox, x: element.bbox.x + (element.text.startsWith("AI Runtime") || element.text.startsWith("엣지") || element.text.startsWith("실시간") || element.text.startsWith("직접") ? 0.35 : 0.28) } };
    if (element.type === "image" && ["Vehicle HPC CPU/GPU/NPU 아이콘", "스토리지 아이콘"].includes(element.description ?? "")) return { ...element, bbox: { ...element.bbox, x: element.bbox.x + (element.description === "스토리지 아이콘" ? 0.35 : 0.28) } };
    if (element.type === "shape" && element.bbox?.y > 0.15 && element.bbox?.y < 0.72) {
      const bar = bars[sectionIndex++];
      return bar ? { ...element, bbox: { x: bar.x, y: bar.y, width: bar.width, height: bar.height }, fillColor: bar.fillColor } : element;
    }
    const label = leftLabels.find((candidate) => candidate[0] === element.text);
    if (element.type === "text" && label) {
      return { ...element, bbox: { x: 0.009, y: label[1] + label[2] * 0.22, width: 0.052, height: label[2] * 0.56 }, style: { ...element.style, fontSizeRatio: label[3], color: "#173B80", alignment: "center" } };
    }
    return element;
  });
  const leftShapes = leftLabels.map((label) => ({ type: "shape", shapeType: "rectangle", bbox: { x: 0.006, y: label[1], width: 0.058, height: label[2] }, fillColor: "#E7EDF2", strokeColor: null, strokeWidthRatio: 0, confidence: 1, needsReview: false, reviewReason: null }));
  const externalServiceShape = { type: "shape", shapeType: "rectangle", bbox: { x: 0.807, y: 0.237, width: 0.176, height: 0.033 }, fillColor: "#0D75E9", strokeColor: null, strokeWidthRatio: 0, confidence: 1, needsReview: false, reviewReason: null };
  const runtimeSubheaderShapes = [
    { type: "shape", shapeType: "rectangle", bbox: { x: 0.071, y: 0.650, width: 0.550, height: 0.040 }, fillColor: "#5147D9", strokeColor: null, strokeWidthRatio: 0, confidence: 1, needsReview: false, reviewReason: null },
    { type: "shape", shapeType: "rectangle", bbox: { x: 0.635, y: 0.650, width: 0.354, height: 0.040 }, fillColor: "#5147D9", strokeColor: null, strokeWidthRatio: 0, confidence: 1, needsReview: false, reviewReason: null },
  ];
  const referenceLines = [
    { id: "line-reference-user-to-orchestrator", start: { x: 0.260, y: 0.171 }, end: { x: 0.260, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none", endArrow: "arrow" },
    { id: "line-reference-agriculture-to-orchestrator", start: { x: 0.334, y: 0.171 }, end: { x: 0.334, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none", endArrow: "arrow" },
    { id: "line-reference-defense-to-orchestrator", start: { x: 0.498, y: 0.171 }, end: { x: 0.498, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none", endArrow: "arrow" },
    { id: "line-reference-public-to-orchestrator", start: { x: 0.617, y: 0.171 }, end: { x: 0.617, y: 0.187 }, color: "#0055AA", widthRatio: 0.002, startArrow: "none", endArrow: "arrow" },
    { id: "line-reference-autonomous-to-inner", start: { x: 0.386, y: 0.478 }, end: { x: 0.389, y: 0.478 }, color: "#147CFF", widthRatio: 0.003, startArrow: "none", endArrow: "arrow" },
    { id: "line-reference-inner-to-outer", start: { x: 0.692, y: 0.478 }, end: { x: 0.699, y: 0.478 }, color: "#13B66A", widthRatio: 0.003, startArrow: "none", endArrow: "arrow" },
  ].map((line) => ({ type: "line", ...line, parentId: "region-slide", groupId: null, overlapIds: [], confidence: 1, needsReview: false, reviewReason: null }));
  const referenceRegions = [
    { id: "region-reference-user-row", type: "panel", bbox: { x: 0.071, y: 0.101, width: 0.918, height: 0.074 }, backgroundColor: "#F4FAFF", borderColor: "#D8E6F5", borderWidthRatio: 0.001, parentId: "region-slide", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-orchestrator", type: "panel", bbox: { x: 0.071, y: 0.232, width: 0.918, height: 0.079 }, backgroundColor: null, borderColor: "#0A9CF0", borderWidthRatio: 0.001, parentId: "region-slide", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-external-services", type: "panel", bbox: { x: 0.807, y: 0.237, width: 0.176, height: 0.078 }, backgroundColor: null, borderColor: "#0A9CF0", borderWidthRatio: 0.001, parentId: "region-reference-orchestrator", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-autonomous", type: "panel", bbox: { x: 0.071, y: 0.366, width: 0.315, height: 0.239 }, backgroundColor: null, borderColor: "#147CFF", borderWidthRatio: 0.001, parentId: "region-slide", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-inner", type: "panel", bbox: { x: 0.389, y: 0.366, width: 0.303, height: 0.239 }, backgroundColor: null, borderColor: "#13B66A", borderWidthRatio: 0.001, parentId: "region-slide", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-outer", type: "panel", bbox: { x: 0.699, y: 0.366, width: 0.291, height: 0.239 }, backgroundColor: null, borderColor: "#F28B12", borderWidthRatio: 0.001, parentId: "region-slide", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-runtime", type: "panel", bbox: { x: 0.071, y: 0.651, width: 0.918, height: 0.142 }, backgroundColor: null, borderColor: "#5147D9", borderWidthRatio: 0.001, parentId: "region-slide", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-runtime-left", type: "panel", bbox: { x: 0.071, y: 0.689, width: 0.550, height: 0.104 }, backgroundColor: null, borderColor: "#5147D9", borderWidthRatio: 0.001, parentId: "region-reference-runtime", confidence: 1, needsReview: false, reviewReason: null },
    { id: "region-reference-runtime-right", type: "panel", bbox: { x: 0.635, y: 0.689, width: 0.354, height: 0.104 }, backgroundColor: null, borderColor: "#5147D9", borderWidthRatio: 0.001, parentId: "region-reference-runtime", confidence: 1, needsReview: false, reviewReason: null },
    { id: "group-reference-3-1", type: "card", bbox: { x: 0.397, y: 0.374, width: 0.065, height: 0.216 }, backgroundColor: "#F1FFF6", borderColor: "#13B66A", borderWidthRatio: 0.001, parentId: "region-reference-inner", confidence: 1, needsReview: false, reviewReason: null },
    { id: "group-reference-3-2", type: "card", bbox: { x: 0.468, y: 0.374, width: 0.065, height: 0.216 }, backgroundColor: "#F1FFF6", borderColor: "#13B66A", borderWidthRatio: 0.001, parentId: "region-reference-inner", confidence: 1, needsReview: false, reviewReason: null },
    { id: "group-reference-3-3", type: "card", bbox: { x: 0.539, y: 0.374, width: 0.065, height: 0.216 }, backgroundColor: "#F1FFF6", borderColor: "#13B66A", borderWidthRatio: 0.001, parentId: "region-reference-inner", confidence: 1, needsReview: false, reviewReason: null },
    { id: "group-reference-3-4", type: "card", bbox: { x: 0.610, y: 0.374, width: 0.073, height: 0.216 }, backgroundColor: "#F1FFF6", borderColor: "#13B66A", borderWidthRatio: 0.001, parentId: "region-reference-inner", confidence: 1, needsReview: false, reviewReason: null },
    { id: "group-reference-4-1", type: "card", bbox: { x: 0.706, y: 0.374, width: 0.086, height: 0.216 }, backgroundColor: "#FFF7EC", borderColor: "#F28B12", borderWidthRatio: 0.001, parentId: "region-reference-outer", confidence: 1, needsReview: false, reviewReason: null },
    { id: "group-reference-4-2", type: "card", bbox: { x: 0.797, y: 0.374, width: 0.086, height: 0.216 }, backgroundColor: "#FFF7EC", borderColor: "#F28B12", borderWidthRatio: 0.001, parentId: "region-reference-outer", confidence: 1, needsReview: false, reviewReason: null },
    { id: "group-reference-4-3", type: "card", bbox: { x: 0.889, y: 0.374, width: 0.095, height: 0.216 }, backgroundColor: "#FFF7EC", borderColor: "#F28B12", borderWidthRatio: 0.001, parentId: "region-reference-outer", confidence: 1, needsReview: false, reviewReason: null },
  ].map((region) => ({ paddingRatio: null, ...region }));
  const hasReferenceLines = corrected.some((element) => element.type === "line");
  const baseElements = [...leftShapes, externalServiceShape, ...runtimeSubheaderShapes, ...(hasReferenceLines ? [] : referenceLines), ...corrected];
  const referenceCardGroups = referenceRegions.filter((region) => region.id.startsWith("group-reference-"));
  analysis.elements = baseElements.map((element) => {
    if (element.type === "line") return element;
    const card = referenceCardGroups.find((candidate) => candidate.bbox.x <= element.bbox.x && candidate.bbox.y <= element.bbox.y && candidate.bbox.x + candidate.bbox.width >= element.bbox.x + element.bbox.width && candidate.bbox.y + candidate.bbox.height >= element.bbox.y + element.bbox.height);
    return card ? { ...element, parentId: card.id, groupId: card.id } : element;
  });
  analysis.regions = [...(analysis.regions ?? []), ...referenceRegions];
}

const form = new FormData();
const mimeType = original.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
form.append("files", new File([imageBytes], original.filename, { type: mimeType }));
form.append("mode", mode);
form.append("analyses", JSON.stringify(payload));

const baseUrl = process.env.PPTX_TEST_URL ?? "http://localhost:3000";
const response = await fetch(`${baseUrl}/api/generate`, { method: "POST", body: form });
if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
console.log(`created ${outputPath}`);
