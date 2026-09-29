// Shared by job photos and expense receipts.
const MAX_EDGE = 2000;

/** Decode, downscale and re-encode as JPEG. Re-encoding also drops location data. */
export async function toJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Couldn't read ${file.name}. Try a JPEG or PNG photo.`));
      i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error(`Couldn't process ${file.name}.`))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

