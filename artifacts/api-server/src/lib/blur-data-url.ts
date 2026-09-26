const MAX_BLUR_IMAGE_BYTES = 8 * 1024;

export function isSmallWebpDataUrl(value: string | null | undefined): boolean {
  if (value == null) return true;
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const encoded = match[1];
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length >= 12 &&
    bytes.length <= MAX_BLUR_IMAGE_BYTES &&
    bytes.toString("base64") === encoded &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
}