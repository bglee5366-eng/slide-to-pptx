import fs from "node:fs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const analysis = {
  results: [{
    itemId: "test-slide-1",
    original: { filename: "테스트 이미지.png", mimeType: "image/png", byteSize: png.length, width: 1, height: 1 },
    analysis: {
      schemaVersion: "1.0",
      title: "PPTX 객체 생성 테스트",
      source: { width: 1, height: 1 },
      regions: [{ id: "region-test-panel", type: "panel", bbox: { x: 0.15, y: 0.3, width: 0.7, height: 0.35 }, parentId: null, backgroundColor: "#F5F7FF", borderColor: "#123456", paddingRatio: 0.02, confidence: 1, needsReview: false, reviewReason: null }],
      warnings: [],
      elements: [
        { type: "text", role: "title", text: "편집 가능한 제목", bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.12 }, style: { fontFamily: "Arial", fontSizeRatio: 0.08, bold: true, italic: false, color: "#123456", backgroundColor: null, alignment: "center" }, confidence: 1, needsReview: false, reviewReason: null },
        { type: "shape", shapeType: "rectangle", bbox: { x: 0.2, y: 0.35, width: 0.6, height: 0.25 }, fillColor: "#DDE6FF", strokeColor: "#123456", strokeWidthRatio: 0.01, confidence: 1, needsReview: false, reviewReason: null },
      ],
    },
  }],
};

const form = new FormData();
form.append("files", new File([png], "테스트 이미지.png", { type: "image/png" }));
form.append("mode", "rebuild");
form.append("analyses", JSON.stringify(analysis));
const response = await fetch(`${process.env.PPTX_TEST_URL ?? "http://localhost:3000"}/api/generate`, { method: "POST", body: form });
if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
fs.mkdirSync("test-output", { recursive: true });
const output = Buffer.from(await response.arrayBuffer());
fs.writeFileSync("test-output/reconstructed-test.pptx", output);
console.log(`created test-output/reconstructed-test.pptx (${output.length} bytes)`);
