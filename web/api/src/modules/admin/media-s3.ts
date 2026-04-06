import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env.js";

let client: S3Client | null = null;

function s3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.mediaS3.region,
      endpoint: env.mediaS3.endpoint || undefined,
      credentials: {
        accessKeyId: env.mediaS3.accessKeyId,
        secretAccessKey: env.mediaS3.secretAccessKey,
      },
      forcePathStyle: env.mediaS3.forcePathStyle,
    });
  }
  return client;
}

export async function uploadMediaToS3(storageKey: string, body: Buffer, contentType: string): Promise<void> {
  await s3Client().send(
    new PutObjectCommand({
      Bucket: env.mediaS3.bucket,
      Key: storageKey,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
}
