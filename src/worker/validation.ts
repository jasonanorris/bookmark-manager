import type {
  BookmarkImportInput,
  BookmarkInput,
  BookmarkPatch,
  ListOptions
} from "./types";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_IMPORT_BODY_BYTES = 1024 * 1024;
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 50;
const MAX_IMPORT_BOOKMARKS = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  return readJsonBodyWithLimit(request, MAX_BODY_BYTES);
}

export async function readImportJsonBody(request: Request): Promise<unknown> {
  return readJsonBodyWithLimit(request, MAX_IMPORT_BODY_BYTES);
}

async function readJsonBodyWithLimit(
  request: Request,
  maxBodyBytes: number
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > maxBodyBytes) {
    throw new ValidationError(
      "REQUEST_TOO_LARGE",
      "The request body is too large."
    );
  }

  const body = await request.text();

  if (new TextEncoder().encode(body).length > maxBodyBytes) {
    throw new ValidationError(
      "REQUEST_TOO_LARGE",
      "The request body is too large."
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ValidationError("MALFORMED_JSON", "The request body must be valid JSON.");
  }
}

export function validateBookmarkInput(value: unknown): BookmarkInput {
  if (!isRecord(value)) {
    throw new ValidationError("INVALID_BODY", "The request body must be a JSON object.");
  }

  const url = validateUrl(value.url);

  return {
    url,
    normalizedUrl: normalizeUrl(url),
    title: validateText(value.title, "title", MAX_TITLE_LENGTH, false),
    description: validateText(
      value.description,
      "description",
      MAX_DESCRIPTION_LENGTH,
      false
    ),
    tags: validateTags(value.tags, false)
  };
}

export function validateBookmarkPatch(value: unknown): BookmarkPatch {
  if (!isRecord(value)) {
    throw new ValidationError("INVALID_BODY", "The request body must be a JSON object.");
  }

  const patch: BookmarkPatch = {};

  if ("url" in value) {
    patch.url = validateUrl(value.url);
    patch.normalizedUrl = normalizeUrl(patch.url);
  }

  if ("title" in value) {
    patch.title = validateText(value.title, "title", MAX_TITLE_LENGTH, true);
  }

  if ("description" in value) {
    patch.description = validateText(
      value.description,
      "description",
      MAX_DESCRIPTION_LENGTH,
      true
    );
  }

  if ("tags" in value) {
    patch.tags = validateTags(value.tags, true);
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError(
      "EMPTY_UPDATE",
      "At least one bookmark field is required."
    );
  }

  return patch;
}

export function validateBookmarkImport(value: unknown): BookmarkImportInput[] {
  if (!isRecord(value) || !Array.isArray(value.bookmarks)) {
    throw new ValidationError(
      "INVALID_IMPORT",
      "The import body must include a bookmarks array."
    );
  }

  if (value.bookmarks.length > MAX_IMPORT_BOOKMARKS) {
    throw new ValidationError(
      "INVALID_IMPORT",
      "An import can include up to 1000 bookmarks."
    );
  }

  return value.bookmarks.map((bookmark, index) => {
    try {
      const input = validateBookmarkInput(bookmark);

      if (!isRecord(bookmark)) {
        return input;
      }

      return {
        ...input,
        ...validateOptionalImportDates(bookmark)
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          "INVALID_IMPORT",
          `Bookmark ${index + 1}: ${error.message}`
        );
      }

      throw error;
    }
  });
}

export function parseBookmarkId(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new ValidationError("INVALID_ID", "A valid bookmark ID is required.");
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ValidationError("INVALID_ID", "A valid bookmark ID is required.");
  }

  return id;
}

export function parseListOptions(searchParams: URLSearchParams): ListOptions {
  const limit = parseBoundedInteger(
    searchParams.get("limit"),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT,
    "limit"
  );
  const offset = parseBoundedInteger(
    searchParams.get("offset"),
    0,
    0,
    Number.MAX_SAFE_INTEGER,
    "offset"
  );
  const search = cleanOptionalQuery(searchParams.get("search"), "search", 500);
  const tag = cleanOptionalQuery(searchParams.get("tag"), "tag", MAX_TAG_LENGTH);

  return {
    ...(search ? { search } : {}),
    ...(tag ? { tag } : {}),
    limit,
    offset
  };
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  if (url.pathname === "/") {
    url.pathname = "";
  }

  return url.toString();
}

function validateUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("INVALID_URL", "A valid website URL is required.");
  }

  const trimmedUrl = value.trim();

  if (trimmedUrl.length === 0 || trimmedUrl.length > MAX_URL_LENGTH) {
    throw new ValidationError("INVALID_URL", "A valid website URL is required.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(addDefaultScheme(trimmedUrl));
  } catch {
    throw new ValidationError("INVALID_URL", "A valid website URL is required.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ValidationError("INVALID_URL", "A valid website URL is required.");
  }

  return parsedUrl.toString();
}

function addDefaultScheme(value: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function validateText(
  value: unknown,
  fieldName: string,
  maxLength: number,
  requiredWhenPresent: boolean
): string {
  if (value === undefined && !requiredWhenPresent) {
    return "";
  }

  if (typeof value !== "string") {
    throw new ValidationError(
      "INVALID_FIELD",
      `The ${fieldName} field must be a string.`
    );
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length > maxLength) {
    throw new ValidationError(
      "INVALID_FIELD",
      `The ${fieldName} field is too long.`
    );
  }

  return trimmedValue;
}

function validateTags(value: unknown, requiredWhenPresent: boolean): string[] {
  if (value === undefined && !requiredWhenPresent) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError("INVALID_TAGS", "Tags must be an array of strings.");
  }

  const tags: string[] = [];
  const seenTags = new Set<string>();

  for (const rawTag of value) {
    if (typeof rawTag !== "string") {
      throw new ValidationError("INVALID_TAGS", "Tags must be an array of strings.");
    }

    const tag = rawTag.trim();

    if (tag.length === 0) {
      continue;
    }

    if (tag.length > MAX_TAG_LENGTH) {
      throw new ValidationError("INVALID_TAGS", "Tags must be 50 characters or fewer.");
    }

    const normalizedTag = tag.toLocaleLowerCase();

    if (!seenTags.has(normalizedTag)) {
      seenTags.add(normalizedTag);
      tags.push(tag);
    }
  }

  if (tags.length > MAX_TAG_COUNT) {
    throw new ValidationError("INVALID_TAGS", "A bookmark can have up to 20 tags.");
  }

  return tags;
}

function parseBoundedInteger(
  value: string | null,
  defaultValue: number,
  minimum: number,
  maximum: number,
  fieldName: string
): number {
  if (value === null || value.trim() === "") {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    throw new ValidationError(
      "INVALID_QUERY",
      `The ${fieldName} parameter must be a valid integer.`
    );
  }

  const parsedValue = Number(value);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < minimum ||
    parsedValue > maximum
  ) {
    throw new ValidationError(
      "INVALID_QUERY",
      `The ${fieldName} parameter is out of range.`
    );
  }

  return parsedValue;
}

function cleanOptionalQuery(
  value: string | null,
  fieldName: string,
  maxLength: number
): string | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return undefined;
  }

  if (trimmedValue.length > maxLength) {
    throw new ValidationError(
      "INVALID_QUERY",
      `The ${fieldName} parameter is too long.`
    );
  }

  return trimmedValue;
}

function validateOptionalImportDates(
  value: Record<string, unknown>
): Pick<BookmarkImportInput, "createdAt" | "updatedAt"> {
  return {
    ...validateOptionalImportDate(value.createdAt, "createdAt"),
    ...validateOptionalImportDate(value.updatedAt, "updatedAt")
  };
}

function validateOptionalImportDate(
  value: unknown,
  fieldName: "createdAt" | "updatedAt"
): Pick<BookmarkImportInput, "createdAt" | "updatedAt"> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string") {
    throw new ValidationError(
      "INVALID_FIELD",
      `The ${fieldName} field must be a valid timestamp.`
    );
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new ValidationError(
      "INVALID_FIELD",
      `The ${fieldName} field must be a valid timestamp.`
    );
  }

  return {
    [fieldName]: timestamp.toISOString()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
