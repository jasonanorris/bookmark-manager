export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EXTENSION_API_TOKEN: string;
  ALLOWED_ORIGINS?: string;
}

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkRow {
  id: number;
  url: string;
  normalized_url: string;
  title: string;
  description: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface BookmarkInput {
  url: string;
  title: string;
  description: string;
  tags: string[];
  normalizedUrl: string;
}

export interface BookmarkImportInput extends BookmarkInput {
  createdAt?: string;
  updatedAt?: string;
}

export interface BookmarkPatch {
  url?: string;
  title?: string;
  description?: string;
  tags?: string[];
  normalizedUrl?: string;
}

export interface ListOptions {
  search?: string;
  tag?: string;
  limit: number;
  offset: number;
}
