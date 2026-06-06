import { compressImagesForUpload } from "@/lib/import/compress-upload-image";
import { parseFetchJsonResponse } from "@/lib/utils";

type MeasureUploadResponse = {
  error?: string;
  uploadIds?: string[];
  queued?: { uploadId: string; fileName: string }[];
  queuedFiles?: { uploadId: string; fileName: string }[];
};

/** 逐张上传，避免多张原图一次提交超过 Vercel 请求体上限 */
export async function uploadMeasureImagesClient(
  files: File[],
  options?: { async?: boolean }
): Promise<{
  uploadIds: string[];
  total: number;
  compressed: boolean;
}> {
  const asyncMode = options?.async ?? true;
  const prepared = await compressImagesForUpload(files);
  const compressed = prepared.some((f, i) => f.size !== files[i]?.size || f.name !== files[i]?.name);

  const uploadIds: string[] = [];

  for (const file of prepared) {
    const formData = new FormData();
    formData.append("files", file);
    const res = await fetch(`/api/import/measure?async=${asyncMode}`, {
      method: "POST",
      body: formData,
    });
    const data = await parseFetchJsonResponse<MeasureUploadResponse>(res);
    if (!res.ok) {
      throw new Error(data.error || `${file.name} 上传失败`);
    }
    const ids = data.uploadIds ?? data.queuedFiles?.map((q) => q.uploadId) ?? [];
    uploadIds.push(...ids);
  }

  return { uploadIds, total: prepared.length, compressed };
}
