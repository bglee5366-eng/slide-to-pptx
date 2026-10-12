import { z } from "zod";

const normalizedNumber = z.number().min(0).max(1);

export const normalizedRectSchema = z.object({
  x: normalizedNumber,
  y: normalizedNumber,
  width: normalizedNumber,
  height: normalizedNumber,
}).strict();

const reviewSchema = {
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
};

const objectMetaSchema = {
  id: z.string().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
  overlapIds: z.array(z.string().min(1)).optional(),
};

const textStyleSchema = z.object({
  fontFamily: z.string().nullable(),
  fontSizeRatio: normalizedNumber.nullable(),
  bold: z.boolean().nullable(),
  italic: z.boolean().nullable(),
  color: z.string().nullable(),
  backgroundColor: z.string().nullable(),
  alignment: z.enum(["left", "center", "right", "justify", "unknown"]),
}).strict();

const textElementSchema = z.object({
  type: z.literal("text"),
  ...objectMetaSchema,
  role: z.enum(["title", "body", "subtitle", "caption", "tableCell", "other"]),
  text: z.string().nullable(),
  bbox: normalizedRectSchema,
  style: textStyleSchema,
  ...reviewSchema,
}).strict();

const shapeElementSchema = z.object({
  type: z.literal("shape"),
  ...objectMetaSchema,
  shapeType: z.enum(["rectangle", "roundedRectangle", "circle", "ellipse", "triangle", "freeform", "unknown"]),
  bbox: normalizedRectSchema,
  fillColor: z.string().nullable(),
  strokeColor: z.string().nullable(),
  strokeWidthRatio: normalizedNumber.nullable(),
  ...reviewSchema,
}).strict();

const lineElementSchema = z.object({
  type: z.literal("line"),
  ...objectMetaSchema,
  start: z.object({ x: normalizedNumber, y: normalizedNumber }).strict(),
  end: z.object({ x: normalizedNumber, y: normalizedNumber }).strict(),
  color: z.string().nullable(),
  widthRatio: normalizedNumber.nullable(),
  startArrow: z.enum(["none", "arrow", "diamond", "oval", "stealth", "triangle"]).default("none"),
  endArrow: z.enum(["none", "arrow", "diamond", "oval", "stealth", "triangle"]).default("none"),
  ...reviewSchema,
}).strict();

const tableElementSchema = z.object({
  type: z.literal("table"),
  ...objectMetaSchema,
  bbox: normalizedRectSchema,
  rows: z.number().int().min(1).max(500),
  columns: z.number().int().min(1).max(500),
  ...reviewSchema,
}).strict();

const imageElementSchema = z.object({
  type: z.literal("image"),
  ...objectMetaSchema,
  bbox: normalizedRectSchema,
  description: z.string().nullable(),
  ...reviewSchema,
}).strict();

export const slideElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  shapeElementSchema,
  lineElementSchema,
  tableElementSchema,
  imageElementSchema,
]);

export const coordinateSystemSchema = z.object({
  type: z.literal("normalized"),
  origin: z.literal("top-left"),
  units: z.literal("ratio"),
  axis: z.literal("x-right-y-down"),
}).strict();

export const regionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["slide", "title", "section", "card", "panel", "table", "imageGroup", "unknown"]),
  bbox: normalizedRectSchema,
  parentId: z.string().min(1).nullable(),
  backgroundColor: z.string().nullable(),
  borderColor: z.string().nullable(),
  borderWidthRatio: normalizedNumber.nullable().optional(),
  paddingRatio: normalizedNumber.nullable(),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
}).strict();

export const slideAnalysisSchema = z.object({
  schemaVersion: z.literal("1.0"),
  title: z.string().nullable(),
  source: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  coordinateSystem: coordinateSystemSchema.default({ type: "normalized", origin: "top-left", units: "ratio", axis: "x-right-y-down" }),
  regions: z.array(regionSchema).max(500).default([]),
  elements: z.array(slideElementSchema).max(1000),
  warnings: z.array(z.string()).max(200).default([]),
}).strict();

export const analyzeResultSchema = z.object({
  itemId: z.string().min(1),
  original: z.object({
    filename: z.string().min(1),
    mimeType: z.enum(["image/png", "image/jpeg"]),
    byteSize: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
  analysis: slideAnalysisSchema,
}).strict();

export const analyzeResponseSchema = z.object({ results: z.array(analyzeResultSchema) }).strict();

export type SlideAnalysis = z.infer<typeof slideAnalysisSchema>;
export type AnalyzeResult = z.infer<typeof analyzeResultSchema>;

const objectMetaJson = {
  id: { type: "string" },
  parentId: { type: ["string", "null"] },
  groupId: { type: ["string", "null"] },
  overlapIds: { type: "array", items: { type: "string" } },
};

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "title", "source", "coordinateSystem", "regions", "elements", "warnings"],
  properties: {
    schemaVersion: { type: "string", enum: ["1.0"] },
    title: { type: ["string", "null"] },
    source: {
      type: "object", additionalProperties: false, required: ["width", "height"],
      properties: { width: { type: "integer", minimum: 1 }, height: { type: "integer", minimum: 1 } },
    },
    coordinateSystem: { type: "object", additionalProperties: false, required: ["type", "origin", "units", "axis"], properties: { type: { type: "string", enum: ["normalized"] }, origin: { type: "string", enum: ["top-left"] }, units: { type: "string", enum: ["ratio"] }, axis: { type: "string", enum: ["x-right-y-down"] } } },
  regions: { type: "array", maxItems: 500, items: { "$ref": "#/$defs/region" } },
    warnings: { type: "array", maxItems: 200, items: { type: "string" } },
    elements: { type: "array", maxItems: 1000, items: { anyOf: [
      {
        type: "object", additionalProperties: false,
        required: ["type", "role", "text", "bbox", "style", "confidence", "needsReview", "reviewReason"],
        properties: {
          ...objectMetaJson, type: { type: "string", enum: ["text"] }, role: { type: "string", enum: ["title", "body", "subtitle", "caption", "tableCell", "other"] }, text: { type: ["string", "null"] },
          bbox: { "$ref": "#/$defs/rect" }, style: { "$ref": "#/$defs/textStyle" }, confidence: { type: "number", minimum: 0, maximum: 1 }, needsReview: { type: "boolean" }, reviewReason: { type: ["string", "null"] },
        },
      },
      {
        type: "object", additionalProperties: false,
        required: ["type", "shapeType", "bbox", "fillColor", "strokeColor", "strokeWidthRatio", "confidence", "needsReview", "reviewReason"],
        properties: {
          ...objectMetaJson, type: { type: "string", enum: ["shape"] }, shapeType: { type: "string", enum: ["rectangle", "roundedRectangle", "circle", "ellipse", "triangle", "freeform", "unknown"] }, bbox: { "$ref": "#/$defs/rect" }, fillColor: { type: ["string", "null"] }, strokeColor: { type: ["string", "null"] }, strokeWidthRatio: { type: ["number", "null"], minimum: 0, maximum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 }, needsReview: { type: "boolean" }, reviewReason: { type: ["string", "null"] },
        },
      },
      {
        type: "object", additionalProperties: false,
        required: ["type", "start", "end", "color", "widthRatio", "confidence", "needsReview", "reviewReason"],
        properties: {
          ...objectMetaJson, type: { type: "string", enum: ["line"] }, start: { "$ref": "#/$defs/point" }, end: { "$ref": "#/$defs/point" }, color: { type: ["string", "null"] }, widthRatio: { type: ["number", "null"], minimum: 0, maximum: 1 }, startArrow: { type: "string", enum: ["none", "arrow", "diamond", "oval", "stealth", "triangle"] }, endArrow: { type: "string", enum: ["none", "arrow", "diamond", "oval", "stealth", "triangle"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, needsReview: { type: "boolean" }, reviewReason: { type: ["string", "null"] },
        },
      },
      {
        type: "object", additionalProperties: false,
        required: ["type", "bbox", "rows", "columns", "confidence", "needsReview", "reviewReason"],
        properties: {
          ...objectMetaJson, type: { type: "string", enum: ["table"] }, bbox: { "$ref": "#/$defs/rect" }, rows: { type: "integer", minimum: 1, maximum: 500 }, columns: { type: "integer", minimum: 1, maximum: 500 }, confidence: { type: "number", minimum: 0, maximum: 1 }, needsReview: { type: "boolean" }, reviewReason: { type: ["string", "null"] },
        },
      },
      {
        type: "object", additionalProperties: false,
        required: ["type", "bbox", "description", "confidence", "needsReview", "reviewReason"],
        properties: {
          ...objectMetaJson, type: { type: "string", enum: ["image"] }, bbox: { "$ref": "#/$defs/rect" }, description: { type: ["string", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, needsReview: { type: "boolean" }, reviewReason: { type: ["string", "null"] },
        },
      },
    ] } } },
  $defs: {
    point: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } } },
    rect: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"], properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 }, width: { type: "number", minimum: 0, maximum: 1 }, height: { type: "number", minimum: 0, maximum: 1 } } },
    textStyle: { type: "object", additionalProperties: false, required: ["fontFamily", "fontSizeRatio", "bold", "italic", "color", "backgroundColor", "alignment"], properties: { fontFamily: { type: ["string", "null"] }, fontSizeRatio: { type: ["number", "null"], minimum: 0, maximum: 1 }, bold: { type: ["boolean", "null"] }, italic: { type: ["boolean", "null"] }, color: { type: ["string", "null"] }, backgroundColor: { type: ["string", "null"] }, alignment: { type: "string", enum: ["left", "center", "right", "justify", "unknown"] } } },
    region: { type: "object", additionalProperties: false, required: ["id", "type", "bbox", "parentId", "backgroundColor", "borderColor", "paddingRatio", "confidence", "needsReview", "reviewReason"], properties: { id: { type: "string" }, type: { type: "string", enum: ["slide", "title", "section", "card", "panel", "table", "imageGroup", "unknown"] }, bbox: { "$ref": "#/$defs/rect" }, parentId: { type: ["string", "null"] }, backgroundColor: { type: ["string", "null"] }, borderColor: { type: ["string", "null"] }, borderWidthRatio: { type: ["number", "null"], minimum: 0, maximum: 1 }, paddingRatio: { type: ["number", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, needsReview: { type: "boolean" }, reviewReason: { type: ["string", "null"] } } },
  },
} as const;
