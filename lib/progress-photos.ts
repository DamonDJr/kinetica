import path from "path";
import { mkdir, readFile, rm } from "fs/promises";
import sharp from "sharp";

// Progress photos are private media, so they live outside public/ and are
// streamed through an auth-checked route instead of being statically served.
const STORAGE_ROOT = path.resolve(process.env.PROGRESS_PHOTO_DIR ?? "data/progress-photos");

// Uploads are normalized to bounded JPEGs so originals from phone cameras
// (10MB+ HEIC-adjacent files, EXIF rotation) don't bloat disk or confuse the
// vision model.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

function photoPath(profileId: string, fileName: string): string {
  // fileName is always a cuid we generated, but normalize anyway so a
  // tampered DB row can't traverse out of the storage root.
  const safe = path.basename(fileName);
  return path.join(STORAGE_ROOT, profileId, safe);
}

export async function saveProgressPhoto(
  profileId: string,
  id: string,
  input: Buffer
): Promise<{ fileName: string; width: number; height: number }> {
  // .rotate() with no args applies the EXIF orientation, so portrait phone
  // shots don't come back sideways after the metadata is stripped.
  const processed = await sharp(input)
    .rotate()
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });

  const fileName = `${id}.jpg`;
  const dir = path.join(STORAGE_ROOT, profileId);
  await mkdir(dir, { recursive: true });
  await sharp(processed.data).toFile(path.join(dir, fileName));

  return { fileName, width: processed.info.width, height: processed.info.height };
}

export async function readProgressPhoto(profileId: string, fileName: string): Promise<Buffer | null> {
  try {
    return await readFile(photoPath(profileId, fileName));
  } catch {
    return null;
  }
}

export async function deleteProgressPhoto(profileId: string, fileName: string): Promise<void> {
  await rm(photoPath(profileId, fileName), { force: true });
}

function labelSvg(width: number, text: string): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="44" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="44" fill="rgba(0,0,0,0.65)"/>
      <text x="${width / 2}" y="29" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" fill="white">${text}</text>
    </svg>`
  );
}

// Composites the two photos side by side (oldest left, newest right) with
// date banners burned in, so the vision model gets one image with the
// before/after relationship visually unambiguous.
//
// Kept deliberately small: local vision models (llama.cpp mtmd) tokenize
// images into a number of patches proportional to pixel count, and decode
// them as a single non-causal batch. If that patch count exceeds the
// server's --ubatch-size, llama.cpp hits a hard GGML_ASSERT and SIGABRTs the
// whole process (not just the request) — so this has to stay conservative
// rather than sized for visual quality.
export async function stitchBeforeAfter(
  oldest: { data: Buffer; label: string },
  newest: { data: Buffer; label: string }
): Promise<Buffer> {
  const HEIGHT = 384;
  const GAP = 4;
  // Absolute ceiling on the composite regardless of source aspect ratio —
  // panel height alone doesn't bound width for unusually wide source photos.
  const MAX_WIDTH = 640;
  const MAX_HEIGHT = 384;

  const [left, right] = await Promise.all(
    [oldest.data, newest.data].map((buf) =>
      sharp(buf).resize({ height: HEIGHT, fit: "inside" }).toBuffer({ resolveWithObject: true })
    )
  );

  const width = left.info.width + GAP + right.info.width;
  const composite = await sharp({
    create: { width, height: HEIGHT, channels: 3, background: { r: 20, g: 20, b: 24 } },
  })
    .composite([
      { input: left.data, left: 0, top: 0 },
      { input: right.data, left: left.info.width + GAP, top: 0 },
      { input: labelSvg(left.info.width, `BEFORE — ${oldest.label}`), left: 0, top: HEIGHT - 44 },
      { input: labelSvg(right.info.width, `AFTER — ${newest.label}`), left: left.info.width + GAP, top: HEIGHT - 44 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();

  return sharp(composite)
    .resize(MAX_WIDTH, MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}
