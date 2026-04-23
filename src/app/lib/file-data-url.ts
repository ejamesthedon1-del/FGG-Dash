/**
 * Encode uploads as data URLs so they survive page reloads (blob: URLs do not).
 * localStorage is size-limited; very large files may still fail — callers should handle errors.
 */

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB raw file

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export class FileTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`FILE_TOO_LARGE:${maxBytes}`);
    this.name = "FileTooLargeError";
  }
}

export async function readFileAsPersistedDataUrl(
  file: File,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<string> {
  if (file.size > maxBytes) {
    throw new FileTooLargeError(maxBytes);
  }
  return fileToDataUrl(file);
}
