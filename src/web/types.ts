export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkPayload {
  url: string;
  title: string;
  description: string;
  tags: string[];
}

export interface BookmarkPatch {
  url?: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface BookmarkListResponse {
  bookmarks: Bookmark[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

export interface BookmarkMutationResponse {
  bookmark: Bookmark;
  created?: boolean;
}

export interface BookmarkExportResponse {
  version: number;
  exportedAt: string;
  bookmarks: Bookmark[];
}

export interface BookmarkImportResponse {
  import: {
    created: number;
    updated: number;
    skipped: number;
    total: number;
  };
}

export interface BookmarkListOptions {
  search?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}
