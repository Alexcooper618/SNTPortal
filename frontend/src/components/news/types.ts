export type NewsPostStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type NewsMediaType = "IMAGE" | "VIDEO";

export interface NewsAuthor {
  id: number;
  name: string;
}

export interface NewsAttachment {
  id: number;
  fileName: string;
  fileUrl: string;
  mediaType: NewsMediaType;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
}

export interface NewsFeedPost {
  id: number;
  title: string;
  body: string;
  status: NewsPostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  author: NewsAuthor;
  attachments: NewsAttachment[];
  likedByMe: boolean;
  likesCount: number;
  commentsCount: number;
}

export interface NewsComment {
  id: string;
  tenantId: number;
  postId: number;
  authorId: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: NewsAuthor;
}

export interface NewsStory {
  id: string;
  caption: string | null;
  mediaType: NewsMediaType;
  fileUrl: string;
  createdAt: string;
  expiresAt: string;
  viewedByMe: boolean;
  viewsCount: number;
}

export interface NewsStoryGroup {
  author: NewsAuthor;
  stories: NewsStory[];
  hasUnseen: boolean;
  lastStoryAt: string;
}
