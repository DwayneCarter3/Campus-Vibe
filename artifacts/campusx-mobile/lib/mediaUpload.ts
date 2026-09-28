import * as ImageManipulator from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

const MAX_IMAGE_BYTES = 80 * 1024;

export type ListingImagePurpose = "post-image" | "service-image";

export interface UploadedImage {
  imageUrl: string;
  blurDataUrl: string;
}

async function readBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the selected image.");
  return response.blob();
}

/**
 * Produces a WebP image under the upload limit on native and web. The exact
 * output blob is retained for the signed PUT so the advertised size matches.
 */
export async function uploadCampusImage(
  asset: ImagePickerAsset,
  purpose: ListingImagePurpose,
  requestUpload: (request: {
    name: string;
    size: number;
    contentType: "image/webp";
    purpose: ListingImagePurpose;
  }) => Promise<{ uploadURL: string; objectPath: string }>,
): Promise<UploadedImage> {
  const dimensions = [
    1600,
    1280,
    1024,
    800,
    640,
  ];
  const qualities = [0.82, 0.68, 0.54, 0.4, 0.28];
  let imageBlob: Blob | null = null;
  let imageUri = "";

  for (const maxDimension of dimensions) {
    const scale = Math.min(1, maxDimension / Math.max(asset.width, asset.height));
    const resize = {
      width: Math.max(1, Math.round(asset.width * scale)),
      height: Math.max(1, Math.round(asset.height * scale)),
    };
    for (const compress of qualities) {
      const result = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize }],
        { compress, format: ImageManipulator.SaveFormat.WEBP },
      );
      const blob = await readBlob(result.uri);
      if (blob.size <= MAX_IMAGE_BYTES) {
        imageUri = result.uri;
        imageBlob = blob;
        break;
      }
    }
    if (imageBlob) break;
  }

  if (!imageBlob) {
    throw new Error("This image could not be compressed below 80 KB. Choose a smaller image and try again.");
  }

  const tinyBlur = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 24, height: 24 } }],
    { compress: 0.22, format: ImageManipulator.SaveFormat.WEBP, base64: true },
  );
  if (!tinyBlur.base64) throw new Error("Could not create a low-data image preview.");

  const { uploadURL, objectPath } = await requestUpload({
    name: `campusx-${purpose}-${Date.now()}.webp`,
    size: imageBlob.size,
    contentType: "image/webp",
    purpose,
  });
  const uploadResponse = await fetch(uploadURL, {
    method: "PUT",
    body: imageBlob,
    headers: { "Content-Type": "image/webp" },
  });
  if (!uploadResponse.ok) throw new Error("Image upload failed. Please try again.");

  return {
    imageUrl: `/api/storage${objectPath}`,
    blurDataUrl: `data:image/webp;base64,${tinyBlur.base64}`,
  };
}