import { readFile } from "node:fs/promises";
import path from "node:path";

const imagePath = process.argv[2] ?? process.env.REFERENCE_IMAGE ?? "test-output/reference-slide.png";
const absolutePath = path.resolve(imagePath);
const bytes = await readFile(absolutePath);
const extension = path.extname(absolutePath).toLowerCase();
const mimeType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
const form = new FormData();
form.append("files", new File([bytes], path.basename(absolutePath), { type: mimeType }));

// The analyze route requires the original dimensions explicitly.
const width = Number(process.env.REFERENCE_WIDTH ?? 1200);
const height = Number(process.env.REFERENCE_HEIGHT ?? 675);
form.append("metadata", JSON.stringify([{ id: "reference", width, height }]));

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const startedAt = performance.now();
const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: form });
const elapsedMs = Math.round(performance.now() - startedAt);
const responseText = await response.text();
let payload;
try { payload = JSON.parse(responseText); } catch { payload = null; }
console.log(`elapsedMs=${elapsedMs}`);
console.log(`serverTiming=${response.headers.get("server-timing") ?? "none"}`);
if (!response.ok) {
  console.error(payload ? JSON.stringify(payload, null, 2) : responseText.slice(0, 500));
  process.exit(1);
}

const analysis = payload.results?.[0]?.analysis;
const textElements = (analysis?.elements ?? []).filter((element) => element.type === "text");
console.log(`image=${absolutePath}`);
console.log(`status=${response.status}`);
console.log(`elements=${analysis?.elements?.length ?? 0}`);
console.log(`textElements=${textElements.length}`);
for (const [index, element] of textElements.entries()) {
  console.log(JSON.stringify({ index, text: element.text, bbox: element.bbox, style: element.style, needsReview: element.needsReview }, null, 2));
}
