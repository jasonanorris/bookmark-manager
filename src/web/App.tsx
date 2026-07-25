import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createBookmark,
  deleteBookmark,
  exportBookmarks,
  getBookmarks,
  importBookmarks,
  updateBookmark
} from "./api";
import { clearStoredToken, loadStoredToken, saveStoredToken } from "./storage";
import type { Bookmark, BookmarkPayload } from "./types";

interface BookmarkFormState {
  url: string;
  title: string;
  description: string;
  tags: string;
}

const emptyForm: BookmarkFormState = {
  url: "",
  title: "",
  description: "",
  tags: ""
};
const appVersion = "0.1.3";
const themeStorageKey = "bookmark-manager-theme";

type Theme = "dark" | "light";

function loadStoredTheme(): Theme {
  return window.localStorage.getItem(themeStorageKey) === "light" ? "light" : "dark";
}

export function App(): JSX.Element {
  const [token, setToken] = useState(() => loadStoredToken());
  const [theme, setTheme] = useState<Theme>(() => loadStoredTheme());
  const [tokenInput, setTokenInput] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [expandedBookmarkIds, setExpandedBookmarkIds] = useState<Set<number>>(
    () => new Set()
  );
  const [form, setForm] = useState<BookmarkFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<BookmarkFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  const availableTags = useMemo(() => {
    const tags = new Map<string, string>();

    for (const bookmark of bookmarks) {
      for (const tag of bookmark.tags) {
        const key = tag.toLocaleLowerCase();

        if (!tags.has(key)) {
          tags.set(key, tag);
        }
      }
    }

    return Array.from(tags.values()).sort((left, right) =>
      left.localeCompare(right)
    );
  }, [bookmarks]);

  useEffect(() => {
    if (!token) {
      setBookmarks([]);
      return;
    }

    const controller = new AbortController();

    void loadBookmarks(controller.signal);

    return () => controller.abort();
  }, [token, search, selectedTag]);

  async function loadBookmarks(signal?: AbortSignal): Promise<void> {
    setIsLoading(true);
    setError("");

    try {
      const response = await getBookmarks(token, {
        search,
        tag: selectedTag,
        limit: 100,
        signal
      });
      setBookmarks(response.bookmarks);
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
        return;
      }

      if (caughtError instanceof ApiError && caughtError.status === 401) {
        clearStoredToken();
        setToken("");
        setBookmarks([]);
        setError("Bad password.");
        return;
      }

      setError(getErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTokenSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const cleanToken = tokenInput.trim();

    if (!cleanToken) {
      setError("Enter the API password.");
      return;
    }

    setError("");
    setIsAuthenticating(true);

    try {
      const response = await getBookmarks(cleanToken, { limit: 100 });
      saveStoredToken(cleanToken);
      setBookmarks(response.bookmarks);
      setToken(cleanToken);
      setTokenInput("");
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 401) {
        setError("Bad password.");
        return;
      }

      setError(getErrorMessage(caughtError));
    } finally {
      setIsAuthenticating(false);
    }
  }

  function handleSignOut(): void {
    clearStoredToken();
    setToken("");
    setTokenInput("");
    setBookmarks([]);
    setSearch("");
    setSelectedTag("");
    setError("");
    setNotice("");
  }

  function toggleTheme(): void {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  function toggleBookmarkExpanded(bookmarkId: number): void {
    setExpandedBookmarkIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(bookmarkId)) {
        nextIds.delete(bookmarkId);
      } else {
        nextIds.add(bookmarkId);
      }

      return nextIds;
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await createBookmark(token, formToPayload(form));
      setForm(emptyForm);
      setIsAddOpen(false);
      setNotice(response.created === false ? "Bookmark updated." : "Bookmark saved.");
      await loadBookmarks();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(bookmark: Bookmark): void {
    setEditingId(bookmark.id);
    setEditForm({
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description,
      tags: bookmark.tags.join(", ")
    });
    setError("");
    setNotice("");
  }

  function cancelEditing(): void {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>,
    bookmarkId: number
  ): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      await updateBookmark(token, bookmarkId, formToPayload(editForm));
      setEditingId(null);
      setEditForm(emptyForm);
      setNotice("Bookmark saved.");
      await loadBookmarks();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(bookmark: Bookmark): Promise<void> {
    const shouldDelete = window.confirm(`Delete "${displayTitle(bookmark)}"?`);

    if (!shouldDelete) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      await deleteBookmark(token, bookmark.id);
      setNotice("Bookmark deleted.");
      await loadBookmarks();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport(): Promise<void> {
    setIsExporting(true);
    setError("");
    setNotice("");

    try {
      const backup = await exportBookmarks(token);
      const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bookmark-manager-backup-${backup.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${backup.bookmarks.length} bookmarks.`);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsExporting(false);
    }
  }

  function openImportPicker(): void {
    importInputRef.current?.click();
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImporting(true);
    setError("");
    setNotice("");

    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await importBookmarks(token, backup);
      const summary = response.import;
      setNotice(
        `Imported ${summary.total} bookmarks: ${summary.created} created, ${summary.updated} updated.`
      );
      await loadBookmarks();
    } catch (caughtError) {
      if (caughtError instanceof SyntaxError) {
        setError("Choose a valid JSON backup file.");
        return;
      }

      setError(getErrorMessage(caughtError));
    } finally {
      setIsImporting(false);
    }
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-labelledby="auth-title">
          <p className="eyebrow">Bookmark Manager</p>
          <h1 id="auth-title">Enter API Password</h1>
          <p className="app-version">v{appVersion}</p>
          <form className="auth-form" onSubmit={handleTokenSubmit}>
            <label htmlFor="api-token">Password</label>
            <input
              id="api-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              autoComplete="current-password"
              autoFocus
              disabled={isAuthenticating}
            />
            {error ? (
              <p className="form-message error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={isAuthenticating}>
              {isAuthenticating ? "Checking..." : "Unlock"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Bookmark Manager</p>
          <h1>Bookmarks</h1>
          <p className="app-version">v{appVersion}</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setIsSearchOpen((isOpen) => !isOpen)}
            aria-expanded={isSearchOpen}
            aria-controls="bookmark-search-panel"
          >
            {isSearchOpen ? "Hide Search" : search || selectedTag ? "Search Active" : "Search"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setIsAddOpen((isOpen) => !isOpen)}
            aria-expanded={isAddOpen}
            aria-controls="add-bookmark-panel"
          >
            {isAddOpen ? "Hide Add" : "Add"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleExport}
            disabled={isExporting || isImporting}
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={openImportPicker}
            disabled={isExporting || isImporting}
          >
            {isImporting ? "Importing..." : "Import"}
          </button>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
          />
          <button type="button" className="secondary-button" onClick={() => loadBookmarks()}>
            Refresh
          </button>
          <button type="button" className="secondary-button" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      {isSearchOpen ? (
        <section
          id="bookmark-search-panel"
          className="toolbar"
          aria-label="Bookmark filters"
        >
          <div className="field search-field">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, URL, description, or tag"
            />
          </div>
          <div className="field">
            <label htmlFor="tag-filter">Tag</label>
            <select
              id="tag-filter"
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : null}

      {isAddOpen ? (
        <section
          id="add-bookmark-panel"
          aria-labelledby="add-bookmark-title"
          className="form-section"
        >
          <h2 id="add-bookmark-title">Add Bookmark</h2>
          <BookmarkForm
            form={form}
            submitLabel={isSaving ? "Saving..." : "Save Bookmark"}
            onChange={setForm}
            onSubmit={handleCreate}
            disabled={isSaving}
          />
        </section>
      ) : null}

      <StatusMessages error={error} notice={notice} />

      <section className="list-section" aria-labelledby="recent-title">
        <div className="section-heading">
          <h2 id="recent-title">Recent</h2>
          {isLoading ? <p>Loading...</p> : <p>{bookmarks.length} shown</p>}
        </div>

        {!isLoading && bookmarks.length === 0 ? (
          <div className="empty-state">
            <h3>No bookmarks found</h3>
            <p>Add one above or adjust the current filters.</p>
          </div>
        ) : null}

        <div className="bookmark-list">
          {bookmarks.map((bookmark) => {
            const isExpanded = expandedBookmarkIds.has(bookmark.id);

            return (
              <article className="bookmark-card" key={bookmark.id}>
                {editingId === bookmark.id ? (
                  <BookmarkForm
                    form={editForm}
                    submitLabel={isSaving ? "Saving..." : "Save Changes"}
                    onChange={setEditForm}
                    onSubmit={(event) => handleUpdate(event, bookmark.id)}
                    onCancel={cancelEditing}
                    disabled={isSaving}
                  />
                ) : (
                  <>
                    <div className="bookmark-compact">
                      <div className="bookmark-summary">
                        <h3>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {displayTitle(bookmark)}
                          </a>
                        </h3>
                        <a
                          className="bookmark-url"
                          href={bookmark.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {bookmark.url}
                        </a>
                      </div>
                      <button
                        type="button"
                        className="secondary-button compact-toggle"
                        onClick={() => toggleBookmarkExpanded(bookmark.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "Minimize" : "Maximize"}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="bookmark-details">
                        <div className="bookmark-meta">
                          <p className="bookmark-host">{formatHostname(bookmark.url)}</p>
                          <p className="bookmark-date">{formatDate(bookmark.createdAt)}</p>
                        </div>
                        {bookmark.description ? (
                          <p className="bookmark-description">{bookmark.description}</p>
                        ) : null}
                        {bookmark.tags.length > 0 ? (
                          <div className="tag-list" aria-label="Tags">
                            {bookmark.tags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                className="tag-button"
                                onClick={() => {
                                  setSelectedTag(tag);
                                  setIsSearchOpen(true);
                                }}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="card-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => startEditing(bookmark)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => handleDelete(bookmark)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

interface BookmarkFormProps {
  form: BookmarkFormState;
  submitLabel: string;
  disabled: boolean;
  onChange: (form: BookmarkFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}

function BookmarkForm({
  form,
  submitLabel,
  disabled,
  onChange,
  onSubmit,
  onCancel
}: BookmarkFormProps): JSX.Element {
  return (
    <form className="bookmark-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor={onCancel ? "edit-url" : "new-url"}>URL</label>
        <input
          id={onCancel ? "edit-url" : "new-url"}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          value={form.url}
          onChange={(event) => onChange({ ...form, url: event.target.value })}
          placeholder="example.com"
          required
        />
      </div>
      <div className="field">
        <label htmlFor={onCancel ? "edit-title" : "new-title"}>Title</label>
        <input
          id={onCancel ? "edit-title" : "new-title"}
          type="text"
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          maxLength={500}
        />
      </div>
      <div className="field">
        <label htmlFor={onCancel ? "edit-description" : "new-description"}>
          Description
        </label>
        <textarea
          id={onCancel ? "edit-description" : "new-description"}
          value={form.description}
          onChange={(event) =>
            onChange({ ...form, description: event.target.value })
          }
          maxLength={5000}
          rows={3}
        />
      </div>
      <div className="field">
        <label htmlFor={onCancel ? "edit-tags" : "new-tags"}>Tags</label>
        <input
          id={onCancel ? "edit-tags" : "new-tags"}
          type="text"
          value={form.tags}
          onChange={(event) => onChange({ ...form, tags: event.target.value })}
          placeholder="reference, cloudflare"
        />
      </div>
      <div className="form-actions">
        <button type="submit" disabled={disabled}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={disabled}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function StatusMessages({
  error,
  notice
}: {
  error: string;
  notice: string;
}): JSX.Element | null {
  if (!error && !notice) {
    return null;
  }

  return (
    <div className="status-region">
      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="form-message success" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function formToPayload(form: BookmarkFormState): BookmarkPayload {
  return {
    url: form.url.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "The saved password was rejected.";
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function displayTitle(bookmark: Bookmark): string {
  return bookmark.title || bookmark.url;
}

function formatHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
