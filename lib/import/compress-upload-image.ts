/** Vercel Serverless 请求体上限约 4.5MB，留安全余量 */
export const UPLOAD_SAFE_BYTES = 4 * 1024 * 1024;

const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.82;
/** 小于此大小不压缩 */
const SKIP_COMPRESS_BELOW_BYTES = 1.2 * 1024 * 1024;

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

/** 浏览器端压缩计量单/截图，避免触发 413 Request Entity Too Large */
export async function compressImageForUpload(file: File): Promise<File> {
  if (typeof document === "undefined" || !isImageFile(file)) {
    return file;
  }
  if (file.size <= SKIP_COMPRESS_BELOW_BYTES) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function compressImagesForUpload(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => compressImageForUpload(file)));
}
