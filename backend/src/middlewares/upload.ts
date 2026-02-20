import path from "path";
import { IncomingMessage } from "http";
import { NextFunction, Request, Response } from "express";
import { badRequest } from "../lib/errors";
import {
  NEWS_POST_MEDIA_MAX_FILES,
  NEWS_STORY_MEDIA_MAX_FILES,
  ensureMediaStorageReady,
  isAllowedNewsMimeType,
} from "../lib/media-storage";

const CRLF = Buffer.from("\r\n");
const HEADER_SEPARATOR = Buffer.from("\r\n\r\n");
const MAX_MULTIPART_BODY_BYTES = 550 * 1024 * 1024;

export interface UploadedMultipartFile {
  fieldName: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  size: number;
}

export type UploadRequest = Request & {
  uploadedFiles?: UploadedMultipartFile[];
};

ensureMediaStorageReady();

const extractBoundary = (contentType: string): string => {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] ?? match?.[2] ?? "").trim();
  if (!boundary) {
    throw badRequest("Multipart boundary is missing");
  }
  return boundary;
};

const parseContentDisposition = (headerValue: string): { name: string; fileName?: string } => {
  const nameMatch = headerValue.match(/name="([^"]+)"/i);
  if (!nameMatch?.[1]) {
    throw badRequest("Malformed multipart content-disposition");
  }

  const fileNameMatch = headerValue.match(/filename="([^"]*)"/i);
  const fileName = fileNameMatch?.[1]
    ? path.basename(fileNameMatch[1].trim())
    : undefined;

  return {
    name: nameMatch[1],
    fileName,
  };
};

const parseMultipartBody = (
  rawBody: Buffer,
  boundary: string,
  maxFiles: number
): { fields: Record<string, string>; files: UploadedMultipartFile[] } => {
  const marker = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: UploadedMultipartFile[] = [];

  let cursor = rawBody.indexOf(marker);
  if (cursor === -1) {
    throw badRequest("Malformed multipart body");
  }

  while (cursor !== -1) {
    let partStart = cursor + marker.length;
    const isFinal = rawBody.slice(partStart, partStart + 2).toString() === "--";
    if (isFinal) {
      break;
    }

    if (rawBody.slice(partStart, partStart + CRLF.length).equals(CRLF)) {
      partStart += CRLF.length;
    }

    const nextMarkerIndex = rawBody.indexOf(marker, partStart);
    if (nextMarkerIndex === -1) {
      break;
    }

    let partEnd = nextMarkerIndex;
    if (rawBody.slice(partEnd - CRLF.length, partEnd).equals(CRLF)) {
      partEnd -= CRLF.length;
    }

    const part = rawBody.slice(partStart, partEnd);
    const headerEnd = part.indexOf(HEADER_SEPARATOR);
    if (headerEnd === -1) {
      throw badRequest("Malformed multipart section");
    }

    const headerRaw = part.slice(0, headerEnd).toString("utf8");
    const payload = part.slice(headerEnd + HEADER_SEPARATOR.length);
    const headerLines = headerRaw
      .split("\r\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const dispositionLine = headerLines.find((line) =>
      line.toLowerCase().startsWith("content-disposition:")
    );
    if (!dispositionLine) {
      throw badRequest("Missing content-disposition");
    }

    const disposition = parseContentDisposition(dispositionLine);
    const contentTypeLine = headerLines.find((line) =>
      line.toLowerCase().startsWith("content-type:")
    );
    const mimeType = contentTypeLine
      ? contentTypeLine.split(":").slice(1).join(":").trim().toLowerCase()
      : "";

    if (disposition.fileName) {
      if (!mimeType || !isAllowedNewsMimeType(mimeType)) {
        throw badRequest("Unsupported media type");
      }

      if (files.length >= maxFiles) {
        throw badRequest("Too many media files");
      }

      files.push({
        fieldName: disposition.name,
        originalName: disposition.fileName,
        mimeType,
        buffer: payload,
        size: payload.byteLength,
      });
    } else {
      fields[disposition.name] = payload.toString("utf8").trim();
    }

    cursor = nextMarkerIndex;
  }

  return { fields, files };
};

const readRequestBody = (req: Request): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const stream = req as unknown as IncomingMessage & {
      destroy: (error?: Error) => void;
    };
    let size = 0;
    const chunks: Buffer[] = [];
    let settled = false;

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const resolveOnce = (buffer: Buffer) => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };

    stream.on("data", (chunk: Buffer | string) => {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += chunkBuffer.length;
      if (size > MAX_MULTIPART_BODY_BYTES) {
        rejectOnce(badRequest("Multipart body is too large"));
        stream.destroy();
        return;
      }
      chunks.push(chunkBuffer);
    });

    stream.on("end", () => {
      resolveOnce(Buffer.concat(chunks));
    });

    stream.on("error", (error: Error) => rejectOnce(error));
  });
};

const parseMultipartRequest = (maxFiles: number) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const contentType = req.headers["content-type"];
    if (typeof contentType !== "string" || !contentType.includes("multipart/form-data")) {
      next(badRequest("multipart/form-data is required"));
      return;
    }

    try {
      const boundary = extractBoundary(contentType);
      const body = await readRequestBody(req);
      const { fields, files } = parseMultipartBody(body, boundary, maxFiles);

      req.body = fields;
      (req as UploadRequest).uploadedFiles = files.filter((file) => file.fieldName === "media");
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const getUploadedFiles = (req: Request): UploadedMultipartFile[] =>
  (req as UploadRequest).uploadedFiles ?? [];

export const parseNewsPostMedia = parseMultipartRequest(NEWS_POST_MEDIA_MAX_FILES);
export const parseNewsStoryMedia = parseMultipartRequest(NEWS_STORY_MEDIA_MAX_FILES);
