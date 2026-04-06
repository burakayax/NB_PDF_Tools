import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { uploadMediaToS3 } from "./media-s3.js";

export function getMediaUploadRoot() {
  return path.join(process.cwd(), "uploads", "media");
}

export function buildPublicMediaUrl(storageKey: string): string {
  if (env.mediaStorage === "s3") {
    const base = env.mediaS3.publicBaseUrl.trim();
    if (base.length > 0) {
      return `${base.replace(/\/$/, "")}/${storageKey}`;
    }
    const b = env.mediaS3.bucket;
    const r = env.mediaS3.region;
    if (!b) {
      return `/api/media/files/${storageKey}`;
    }
    return `https://${b}.s3.${r}.amazonaws.com/${storageKey}`;
  }
  return `/api/media/files/${storageKey}`;
}

function extFromOriginalName(originalName: string): string {
  return path.extname(originalName).slice(0, 12).toLowerCase();
}

export async function persistMediaUpload(input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  byteSize: number;
}) {
  if (env.mediaStorage === "s3") {
    const { bucket, accessKeyId, secretAccessKey } = env.mediaS3;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new HttpError(503, "S3 media storage is enabled but S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not set.");
    }
  }

  const ext = extFromOriginalName(input.originalName);
  const storageKey = `${randomUUID()}${ext || ""}`;

  if (env.mediaStorage === "s3") {
    await uploadMediaToS3(storageKey, input.buffer, input.mimeType);
  } else {
    const root = getMediaUploadRoot();
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, storageKey), input.buffer);
  }

  return createMediaAsset({
    storageKey,
    originalName: input.originalName,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
  });
}

export async function createMediaAsset(input: {
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
}) {
  return prisma.mediaAsset.create({
    data: {
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
    },
  });
}

export async function listMediaAssets(limit = 200) {
  return prisma.mediaAsset.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      storageKey: true,
      originalName: true,
      mimeType: true,
      byteSize: true,
      createdAt: true,
    },
  });
}
