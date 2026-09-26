import { and, eq } from "drizzle-orm";
import { db, uploadedMediaTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

const MAX_IMAGE_UPLOAD_BYTES = 80 * 1024;

export async function validateUploadedWebpImage(
  objectPath: string,
  uploaderId: string,
  purpose: "post-image" | "service-image",
  storage: ObjectStorageService,
  allowLegacyPurpose = false,
): Promise<string | null> {
  const [receipt] = await db
    .select({
      purpose: uploadedMediaTable.purpose,
      contentType: uploadedMediaTable.declaredContentType,
      size: uploadedMediaTable.declaredSize,
    })
    .from(uploadedMediaTable)
    .where(and(
      eq(uploadedMediaTable.objectPath, objectPath),
      eq(uploadedMediaTable.uploaderId, uploaderId),
    ))
    .limit(1);

  if (!receipt) return "You can only attach private media uploaded by your account.";
  if (allowLegacyPurpose && receipt.purpose === null) return null;
  if (
    receipt.purpose !== purpose ||
    receipt.contentType !== "image/webp" ||
    !receipt.size ||
    receipt.size <= 0 ||
    receipt.size > MAX_IMAGE_UPLOAD_BYTES
  ) return "Image uploads must be declared as WebP and be no larger than 80 KB.";

  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    const declaredObjectSize = Number(metadata.size);
    if (
      metadata.contentType !== "image/webp" ||
      declaredObjectSize !== receipt.size ||
      declaredObjectSize > MAX_IMAGE_UPLOAD_BYTES
    ) return "The uploaded image metadata does not match the approved WebP upload.";

    const [bytes] = await file.download();
    if (
      bytes.byteLength !== receipt.size ||
      bytes.byteLength > MAX_IMAGE_UPLOAD_BYTES ||
      bytes.byteLength < 12 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP"
    ) return "The uploaded object is not a valid-size WebP image.";
  } catch {
    return "The uploaded image could not be verified in storage.";
  }

  return null;
}