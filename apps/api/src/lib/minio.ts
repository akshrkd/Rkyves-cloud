import * as Minio from "minio";
import { config } from "./config.js";

let client: Minio.Client | null = null;

function parseEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  return {
    endPoint: url.hostname,
    port: url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80,
    useSSL: url.protocol === "https:",
  };
}

export function getMinioClient(): Minio.Client {
  if (!client) {
    const { endPoint, port, useSSL } = parseEndpoint(config.minio.endpoint);
    client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
  }
  return client;
}

export async function ensureBucket(bucketName: string): Promise<void> {
  const minio = getMinioClient();
  const exists = await minio.bucketExists(bucketName);
  if (!exists) {
    await minio.makeBucket(bucketName);
  }
}

export async function createProjectBucket(projectSlug: string): Promise<string> {
  const bucketName = `${config.minio.bucketPrefix}-${projectSlug}`;
  await ensureBucket(bucketName);
  return bucketName;
}

export async function getPresignedUploadUrl(
  bucketName: string,
  objectName: string,
  expirySeconds = 3600
): Promise<string> {
  const minio = getMinioClient();
  return minio.presignedPutObject(bucketName, objectName, expirySeconds);
}
