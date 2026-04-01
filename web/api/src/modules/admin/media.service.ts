import path from "node:path";
import { prisma } from "../../lib/prisma.js";

export function getMediaUploadRoot() {
  return path.join(process.cwd(), "uploads", "media");
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
