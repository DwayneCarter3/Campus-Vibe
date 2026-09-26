import { requestUploadUrl } from "@workspace/api-client-react";

export type ImageUploadPurpose = "post-image" | "service-image";

export interface UploadedImage {
  imageUrl: string;
  blurDataUrl: string;
}

const MAX_IMAGE_BYTES = 80 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Your browser couldn't encode this image as WebP."));
    }, "image/webp", quality);
  });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Couldn't create image preview."));
    reader.onerror = () => reject(new Error("Couldn't create image preview."));
    reader.readAsDataURL(blob);
  });
}

async function encodeImage(file: File): Promise<{ image: Blob; blur: Blob }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a valid image file.");
  if (typeof document === "undefined" || !HTMLCanvasElement.prototype.toBlob) {
    throw new Error("This browser doesn't support WebP image compression.");
  }
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image couldn't be opened."));
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("This image has no usable dimensions.");

    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas image compression isn't available in this browser.");
    let encoded: Blob | undefined;
    for (let dimensionPass = 0; dimensionPass < 14; dimensionPass += 1) {
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      for (const quality of [0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]) {
        const candidate = await canvasBlob(canvas, quality);
        if (candidate.type !== "image/webp") throw new Error("WebP encoding isn't supported by this browser.");
        encoded = candidate;
        if (candidate.size <= MAX_IMAGE_BYTES) break;
      }
      if (encoded && encoded.size <= MAX_IMAGE_BYTES) break;
      if (Math.max(width, height) <= 160) break;
      const scale = Math.max(0.78, 160 / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    if (!encoded || encoded.size > MAX_IMAGE_BYTES) {
      throw new Error("This image couldn't be compressed below 80 KB. Try a smaller image.");
    }

    const blurCanvas = document.createElement("canvas");
    const blurScale = Math.min(24 / image.naturalWidth, 32 / image.naturalHeight);
    blurCanvas.width = Math.max(1, Math.round(image.naturalWidth * blurScale));
    blurCanvas.height = Math.max(1, Math.round(image.naturalHeight * blurScale));
    const blurContext = blurCanvas.getContext("2d");
    if (!blurContext) throw new Error("Couldn't generate the image placeholder.");
    blurContext.drawImage(image, 0, 0, blurCanvas.width, blurCanvas.height);
    const blur = await canvasBlob(blurCanvas, 0.35);
    return { image: encoded, blur };
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function uploadCampusImage(file: File, purpose: ImageUploadPurpose): Promise<UploadedImage> {
  const { image, blur } = await encodeImage(file);
  const name = `${file.name.replace(/\.[^.]+$/, "") || "campus-image"}.webp`;
  const { uploadURL, objectPath } = await requestUploadUrl({
    name,
    size: image.size,
    contentType: "image/webp",
    purpose,
  });
  const response = await fetch(uploadURL, {
    method: "PUT",
    body: image,
    headers: { "Content-Type": "image/webp" },
  });
  if (!response.ok) throw new Error(`Image upload failed (${response.status}). Please try again.`);
  return {
    imageUrl: `/api/storage${objectPath}`,
    blurDataUrl: await blobDataUrl(blur),
  };
}