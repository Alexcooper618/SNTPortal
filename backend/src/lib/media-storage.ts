import fs from "fs";
import { promises as fsAsync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ChatMediaType, NewsMediaType } from "@prisma/client";
import { env } from "../config/env";
import { badRequest } from "./errors";

export const NEWS_POST_MEDIA_MAX_FILES = 10;
export const NEWS_STORY_MEDIA_MAX_FILES = 1;
export const NEWS_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const NEWS_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const AVATAR_MEDIA_MAX_FILES = 1;
export const AVATAR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_MEDIA_MAX_FILES = 1;
export const CHAT_TOPIC_MEDIA_MAX_FILES = 1;
export const CHAT_VOICE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_VIDEO_NOTE_MAX_BYTES = 25 * 1024 * 1024;
export const CHAT_TOPIC_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_VOICE_MAX_DURATION_SEC = 300;
export const CHAT_VIDEO_NOTE_MAX_DURATION_SEC = 60;
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

interface PersistChatMediaParams {
  kind: "voice" | "video-note";
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

const AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/ogg",
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
  "audio/aac": ".aac",
  "audio/m4a": ".m4a",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
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
  if (AUDIO_MIME_TYPES.has(mimeType)) return ".m4a";
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
export const getAvatarsMediaDir = () => path.join(getUploadsRootDir(), "avatars");
export const getChatVoiceMediaDir = () => path.join(getUploadsRootDir(), "chat", "voice");
export const getChatVideoNotesMediaDir = () => path.join(getUploadsRootDir(), "chat", "video-notes");
export const getChatTopicsMediaDir = () => path.join(getUploadsRootDir(), "chat", "topics");

export const ensureMediaStorageReady = () => {
  ensureDirSync(getUploadsRootDir());
  ensureDirSync(path.join(getUploadsRootDir(), "news"));
  ensureDirSync(path.join(getUploadsRootDir(), "chat"));
  ensureDirSync(getNewsPostsMediaDir());
  ensureDirSync(getNewsStoriesMediaDir());
  ensureDirSync(getAvatarsMediaDir());
  ensureDirSync(getChatVoiceMediaDir());
  ensureDirSync(getChatVideoNotesMediaDir());
  ensureDirSync(getChatTopicsMediaDir());
};

export const isAllowedNewsMimeType = (mimeType: string) =>
  IMAGE_MIME_TYPES.has(mimeType) || VIDEO_MIME_TYPES.has(mimeType);

export const isAllowedAvatarMimeType = (mimeType: string) => IMAGE_MIME_TYPES.has(mimeType);
export const isAllowedChatTopicPhotoMimeType = (mimeType: string) => IMAGE_MIME_TYPES.has(mimeType);
export const isAllowedChatVoiceMimeType = (mimeType: string) => AUDIO_MIME_TYPES.has(mimeType);
export const isAllowedChatVideoNoteMimeType = (mimeType: string) => VIDEO_MIME_TYPES.has(mimeType);

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

export const validateAvatarMediaFile = (file: MediaValidationFile) => {
  if (!isAllowedAvatarMimeType(file.mimeType)) {
    throw badRequest("Unsupported avatar media type");
  }

  if (file.size > AVATAR_IMAGE_MAX_BYTES) {
    throw badRequest("Avatar image exceeds 5 MB limit");
  }
};

export const generateNewsMediaFileName = (originalName: string, mimeType: string) => {
  const extension = resolveExtension(originalName, mimeType);
  return `${randomUUID()}${extension}`;
};

export const generateUploadFileName = (originalName: string, mimeType: string) =>
  generateNewsMediaFileName(originalName, mimeType);

export const buildNewsPostFileUrl = (fileName: string) => `/uploads/news/posts/${fileName}`;
export const buildNewsStoryFileUrl = (fileName: string) => `/uploads/news/stories/${fileName}`;
export const buildAvatarFileUrl = (fileName: string) => `/uploads/avatars/${fileName}`;
export const buildChatVoiceFileUrl = (fileName: string) => `/uploads/chat/voice/${fileName}`;
export const buildChatVideoNoteFileUrl = (fileName: string) => `/uploads/chat/video-notes/${fileName}`;
export const buildChatTopicPhotoFileUrl = (fileName: string) => `/uploads/chat/topics/${fileName}`;

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

export const persistAvatarMedia = async ({
  originalName,
  mimeType,
  buffer,
}: Omit<PersistMediaParams, "kind">) => {
  validateAvatarMediaFile({
    mimeType,
    size: buffer.byteLength,
  });

  const fileName = generateNewsMediaFileName(originalName, mimeType);
  const absolutePath = path.join(getAvatarsMediaDir(), fileName);
  await fsAsync.writeFile(absolutePath, buffer);

  return {
    fileName: originalName,
    fileUrl: buildAvatarFileUrl(fileName),
    mimeType,
    sizeBytes: buffer.byteLength,
  };
};

export const validateChatMessageMediaFile = (params: {
  kind: "voice" | "video-note";
  mimeType: string;
  size: number;
  durationSec: number;
}) => {
  if (params.kind === "voice") {
    if (!isAllowedChatVoiceMimeType(params.mimeType)) {
      throw badRequest("Unsupported voice media type");
    }
    if (params.size > CHAT_VOICE_MAX_BYTES) {
      throw badRequest("Voice message exceeds 10 MB limit");
    }
    if (params.durationSec <= 0 || params.durationSec > CHAT_VOICE_MAX_DURATION_SEC) {
      throw badRequest("Voice message exceeds 5 minute limit");
    }
    return;
  }

  if (!isAllowedChatVideoNoteMimeType(params.mimeType)) {
    throw badRequest("Unsupported video note media type");
  }
  if (params.size > CHAT_VIDEO_NOTE_MAX_BYTES) {
    throw badRequest("Video note exceeds 25 MB limit");
  }
  if (params.durationSec <= 0 || params.durationSec > CHAT_VIDEO_NOTE_MAX_DURATION_SEC) {
    throw badRequest("Video note exceeds 60 second limit");
  }
};

export const validateChatTopicPhotoFile = (file: MediaValidationFile) => {
  if (!isAllowedChatTopicPhotoMimeType(file.mimeType)) {
    throw badRequest("Unsupported topic photo type");
  }
  if (file.size > CHAT_TOPIC_IMAGE_MAX_BYTES) {
    throw badRequest("Topic photo exceeds 5 MB limit");
  }
};

export const persistChatMessageMedia = async ({
  kind,
  originalName,
  mimeType,
  buffer,
}: PersistChatMediaParams) => {
  const fileName = generateUploadFileName(originalName, mimeType);
  const absolutePath = path.join(
    kind === "voice" ? getChatVoiceMediaDir() : getChatVideoNotesMediaDir(),
    fileName
  );
  await fsAsync.writeFile(absolutePath, buffer);

  return {
    fileName: originalName,
    fileUrl: kind === "voice" ? buildChatVoiceFileUrl(fileName) : buildChatVideoNoteFileUrl(fileName),
    mediaType: kind === "voice" ? ChatMediaType.VOICE : ChatMediaType.VIDEO_NOTE,
    mimeType,
    sizeBytes: buffer.byteLength,
  };
};

export const persistChatTopicPhoto = async ({
  originalName,
  mimeType,
  buffer,
}: Omit<PersistChatMediaParams, "kind">) => {
  validateChatTopicPhotoFile({
    mimeType,
    size: buffer.byteLength,
  });

  const fileName = generateUploadFileName(originalName, mimeType);
  const absolutePath = path.join(getChatTopicsMediaDir(), fileName);
  await fsAsync.writeFile(absolutePath, buffer);

  return {
    fileName: originalName,
    fileUrl: buildChatTopicPhotoFileUrl(fileName),
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
