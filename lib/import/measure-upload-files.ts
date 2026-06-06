const MEASURE_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MEASURE_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const MEASURE_UPLOAD_MAX = 50;

export function isMeasureImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (MEASURE_IMAGE_EXT.has(ext)) return true;
  if (file.type && MEASURE_IMAGE_MIME.has(file.type.toLowerCase())) return true;
  return false;
}

/** 从文件列表中筛出计量单图片，按路径排序，最多 max 张 */
export function pickMeasureImageFiles(
  files: FileList | File[],
  max = MEASURE_UPLOAD_MAX
): { images: File[]; skipped: number; total: number } {
  const all = Array.from(files);
  const images = all
    .filter(isMeasureImageFile)
    .sort((a, b) => {
      const pathA = (a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name;
      const pathB = (b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name;
      return pathA.localeCompare(pathB, "zh-CN");
    });

  const skipped = all.length - images.length;
  const total = images.length;

  if (images.length > max) {
    return {
      images: images.slice(0, max),
      skipped: skipped + (images.length - max),
      total,
    };
  }

  return { images, skipped, total };
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        reject
      );
    };
    readBatch();
  });
}

async function traverseFileEntry(entry: FileSystemEntry, bucket: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    bucket.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readDirectoryEntries(reader);
    await Promise.all(children.map((child) => traverseFileEntry(child, bucket)));
  }
}

/** 拖拽上传时递归读取文件夹内所有文件 */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<File[]> {
  const items = dataTransfer.items;
  if (!items?.length) {
    return Array.from(dataTransfer.files ?? []);
  }

  const bucket: File[] = [];
  const tasks: Promise<void>[] = [];

  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      tasks.push(traverseFileEntry(entry, bucket));
      continue;
    }
    const file = item.getAsFile();
    if (file) bucket.push(file);
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
    return bucket;
  }

  return Array.from(dataTransfer.files ?? []);
}
