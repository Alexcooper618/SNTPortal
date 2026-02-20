import fs from "fs";
import { promises as fsAsync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NewsMediaType } from "@prisma/client";
import { env } from "../config/env";
import { badRequest } from "./errors";

export const NEWS_POST_MEDIA_MAX_FILES = 10;
export const NEWS_STORY_MEDIA_MAX_FILES = 1;
export const NEWS_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const NEWS_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const STORY_TTL_HOURS = 24;

interface MediaValidationFile {
  mimeType: string;
  size: number;
}

interface PersistMediaParams {
  kind: "post" | "story";
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

const normalizeExtension = (rawExtension: string): string => {
  const clean = rawExtension.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!clean.startsWith(".") || clean.length > 12) {
    return "";
  }
  return clean;
};

const resolveFallbackExtension = (mimeType: string): string => {
  if (IMAGE_MIME_TYPES.has(mimeType)) return ".jpg";
  if (VIDEO_MIME_TYPES.has(mimeType)) return ".mp4";
  return ".bin";
};

const resolveExtension = (originalName: string, mimeType: string): string => {
  const mapped = MIME_EXTENSION_MAP[mimeType];
  if (mapped) return mapped;

  const fromName = normalizeExtension(path.extname(originalName));
  if (fromName) return fromName;

  return resolveFallbackExtension(mimeType);
};

const ensureDirSync = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

export const getUploadsRootDir = () => env.mediaUploadDir;
export const getNewsPostsMediaDir = () => path.join(getUploadsRootDir(), "news", "posts");
export const getNewsStoriesMediaDir = () => path.join(getUploadsRootDir(), "news", "stories");

export const ensureMediaStorageReady = () => {
  ensureDirSync(getUploadsRootDir());
  ensureDirSync(path.join(getUploadsRootDir(), "news"));
  ensureDirSync(getNewsPostsMediaDir());
  ensureDirSync(getNewsStoriesMediaDir());
};

export const isAllowedNewsMimeType = (mimeType: string) =>
  IMAGE_MIME_TYPES.has(mimeType) || VIDEO_MIME_TYPES.has(mimeType);

export const resolveNewsMediaType = (mimeType: string): NewsMediaType => {
  if (IMAGE_MIME_TYPES.has(mimeType)) return NewsMediaType.IMAGE;
  if (VIDEO_MIME_TYPES.has(mimeType)) return NewsMediaType.VIDEO;
  throw badRequest("Unsupported media type");
};

export const resolveNewsMediaSizeLimit = (mimeType: string): number => {
  if (IMAGE_MIME_TYPES.has(mimeType)) return NEWS_IMAGE_MAX_BYTES;
  if (VIDEO_MIME_TYPES.has(mimeType)) return NEWS_VIDEO_MAX_BYTES;
  throw badRequest("Unsupported media type");
};

export const validateNewsMediaFile = (file: MediaValidationFile) => {
  if (!isAllowedNewsMimeType(file.mimeType)) {
    throw badRequest("Unsupported media type");
  }

  const maxSize = resolveNewsMediaSizeLimit(file.mimeType);
  if (file.size > maxSize) {
    throw badRequest(
      file.mimeType.startsWith("image/")
        ? "Image exceeds 10 MB limit"
        : "Video exceeds 50 MB limit"
    );
  }
};

export const generateNewsMediaFileName = (originalName: string, mimeType: string) => {
  const extension = resolveExtension(originalName, mimeType);
  return `${randomUUID()}${extension}`;
};

export const buildNewsPostFileUrl = (fileName: string) => `/uploads/news/posts/${fileName}`;
export const buildNewsStoryFileUrl = (fileName: string) => `/uploads/news/stories/${fileName}`;

export const persistNewsMedia = async ({
  kind,
  originalName,
  mimeType,
  buffer,
}: PersistMediaParams) => {
  validateNewsMediaFile({
    mimeType,
    size: buffer.byteLength,
  });

  const fileName = generateNewsMediaFileName(originalName, mimeType);
  const directory = kind === "post" ? getNewsPostsMediaDir() : getNewsStoriesMediaDir();
  const absolutePath = path.join(directory, fileName);
  await fsAsync.writeFile(absolutePath, buffer);

  return {
    fileName: originalName,
    fileUrl: kind === "post" ? buildNewsPostFileUrl(fileName) : buildNewsStoryFileUrl(fileName),
    mediaType: resolveNewsMediaType(mimeType),
    mimeType,
    sizeBytes: buffer.byteLength,
  };
};

export const removeUploadedFileByUrl = async (fileUrl: string) => {
  if (!fileUrl.startsWith("/uploads/")) return;

  const relativePath = fileUrl.slice("/uploads/".length);
  const rootPath = path.resolve(getUploadsRootDir());
  const absolutePath = path.resolve(path.join(rootPath, relativePath));

  if (!absolutePath.startsWith(rootPath)) return;

  try {
    await fsAsync.unlink(absolutePath);
  } catch (_error) {
    // non-critical cleanup path
  }
};
