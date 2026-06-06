const INBOUND_EXCEL_EXT = new Set([".xlsx", ".xls", ".csv"]);
const INBOUND_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const INBOUND_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type InboundFileKind = "excel" | "image";

export function getInboundFileKind(file: File): InboundFileKind | null {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (INBOUND_EXCEL_EXT.has(ext)) return "excel";
  if (INBOUND_IMAGE_EXT.has(ext)) return "image";
  if (file.type && INBOUND_IMAGE_MIME.has(file.type.toLowerCase())) return "image";
  return null;
}

export function isInboundFileSupported(file: File) {
  return getInboundFileKind(file) !== null;
}
