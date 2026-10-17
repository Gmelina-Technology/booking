// Browser-only helper: shrinks an image before upload so it fits under the
// 1 MB server-action body limit.

const TARGET_BYTES = 900 * 1024;

export async function resizeImage(
  file: File,
  { maxEdge = 1600, type = "image/jpeg" }: { maxEdge?: number; type?: "image/jpeg" | "image/png" } = {},
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  if (type === "image/png") {
    // Keep QR codes crisp: no smoothing, white background for transparent PNGs.
    ctx.imageSmoothingEnabled = scale === 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const ext = type === "image/png" ? "png" : "jpg";
  const qualities = type === "image/png" ? [undefined] : [0.85, 0.7, 0.55, 0.4];
  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    if (blob && blob.size <= TARGET_BYTES) return new File([blob], `image.${ext}`, { type });
  }
  throw new Error("Couldn't shrink that image enough. Try a smaller one.");
}
