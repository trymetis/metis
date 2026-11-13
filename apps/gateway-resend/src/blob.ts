import { mkdir, rm, rmdir } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { BlobBody } from "@metis/gateway-contract/router";

import { type BlobConfig, env } from "./env";

const S3_MAX_DELETE_KEYS = 1000;
const KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface BlobStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<BlobBody | null>;
  delete(keys: string[]): Promise<void>;
}

function directoryStore(root: string): BlobStore {
  const base = path.resolve(root);
  const fileFor = (key: string) => {
    const segments = key.split("/");
    if (segments.length === 0 || !segments.every((segment) => KEY_SEGMENT.test(segment))) {
      throw new Error(`blob key "${key}" is not a safe path`);
    }
    return path.join(base, ...segments);
  };

  return {
    async put(key, bytes) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      await Bun.write(file, bytes);
    },

    async get(key) {
      const file = Bun.file(fileFor(key));
      return (await file.exists()) ? file.stream() : null;
    },

    async delete(keys) {
      const files = keys.map(fileFor);
      await Promise.all(files.map((file) => rm(file, { force: true })));
      const parents = new Set(
        files.map((file) => path.dirname(file)).filter((dir) => dir !== base),
      );
      await Promise.all([...parents].map((dir) => rmdir(dir).catch(() => undefined)));
    },
  };
}

function s3Store(cfg: BlobConfig): BlobStore {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.keyId, secretAccessKey: cfg.secret },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },

    async get(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return object.Body ? object.Body.transformToWebStream() : null;
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },

    async delete(keys) {
      const batches: string[][] = [];
      for (let index = 0; index < keys.length; index += S3_MAX_DELETE_KEYS) {
        batches.push(keys.slice(index, index + S3_MAX_DELETE_KEYS));
      }
      await Promise.all(
        batches.map((batch) =>
          client.send(
            new DeleteObjectsCommand({
              Bucket: cfg.bucket,
              Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
            }),
          ),
        ),
      );
    },
  };
}

export const blobs: BlobStore = env.blob ? s3Store(env.blob) : directoryStore(env.blobDir);

export async function deleteBlobs(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await blobs.delete(keys);
  } catch (err) {
    console.error("[metis-resend] failed to delete stored blobs", err);
  }
}
