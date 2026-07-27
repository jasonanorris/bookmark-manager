import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
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
const appVersion = "1.0.0";
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
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [expandedBookmarkIds, setExpandedBookmarkIds] = useState<Set<number>>(
    () => new Set()
  );
  const [actionBookmark, setActionBookmark] = useState<Bookmark | null>(null);
  const [copiedBookmarkId, setCopiedBookmarkId] = useState<number | null>(null);
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
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressStartPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    return () => clearBookmarkPressTimer();
  }, []);

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

  function expandBookmark(bookmarkId: number): void {
    setExpandedBookmarkIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(bookmarkId);
      return nextIds;
    });
  }

  function clearBookmarkPressTimer(): void {
    if (longPressTimerRef.current === null) {
      return;
    }

    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartPointRef.current = null;
  }

  function handleBookmarkPressStart(
    bookmark: Bookmark,
    event: PointerEvent<HTMLElement>
  ): void {
    if (event.pointerType === "mouse" || editingId === bookmark.id) {
      return;
    }

    clearBookmarkPressTimer();
    longPressTriggeredRef.current = false;
    longPressStartPointRef.current = {
      x: event.clientX,
      y: event.clientY
    };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setActionBookmark(bookmark);
    }, 550);
  }

  function handleBookmarkPressMove(event: PointerEvent<HTMLElement>): void {
    const startPoint = longPressStartPointRef.current;

    if (!startPoint) {
      return;
    }

    const horizontalDistance = Math.abs(event.clientX - startPoint.x);
    const verticalDistance = Math.abs(event.clientY - startPoint.y);

    if (horizontalDistance > 10 || verticalDistance > 10) {
      clearBookmarkPressTimer();
    }
  }

  function handleBookmarkPressEnd(): void {
    clearBookmarkPressTimer();
  }

  function handleBookmarkClickCapture(event: MouseEvent<HTMLElement>): void {
    if (!longPressTriggeredRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.setTimeout(() => {
      longPressTriggeredRef.current = false;
    }, 0);
  }

  function handleBookmarkContextMenu(event: MouseEvent<HTMLElement>): void {
    if (window.matchMedia("(pointer: coarse)").matches) {
      event.preventDefault();
    }
  }

  function openBookmark(bookmark: Bookmark): void {
    window.open(bookmark.url, "_blank", "noopener,noreferrer");
    setActionBookmark(null);
  }

  async function copyBookmarkFromActions(bookmark: Bookmark): Promise<void> {
    await copyBookmarkUrl(bookmark);
    setActionBookmark(null);
  }

  function expandBookmarkFromActions(bookmark: Bookmark): void {
    expandBookmark(bookmark.id);
    setActionBookmark(null);
  }

  async function copyBookmarkUrl(bookmark: Bookmark): Promise<void> {
    setError("");
    setNotice("");

    try {
      await navigator.clipboard.writeText(bookmark.url);
      setCopiedBookmarkId(bookmark.id);
      window.setTimeout(() => setCopiedBookmarkId(null), 1600);
    } catch {
      setError("URL could not be copied.");
    }
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
          <p className="eyebrow">
            Bookmark Manager <span className="app-version-inline">v{appVersion}</span>
          </p>
          <h1 id="auth-title">Enter API Password</h1>
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
          <p className="eyebrow">
            Bookmark Manager <span className="app-version-inline">v{appVersion}</span>
          </p>
          <h1>Bookmarks</h1>
        </div>
        <button
          type="button"
          className="secondary-button menu-toggle"
          onClick={() => setIsActionMenuOpen((isOpen) => !isOpen)}
          aria-expanded={isActionMenuOpen}
          aria-controls="header-actions-menu"
          aria-label="Open settings menu"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
            <path d="M19.4 15a8 8 0 0 0 .1-1.3l2-1.5-2-3.5-2.4 1a7.9 7.9 0 0 0-2.2-1.3L14.6 6h-4l-.4 2.4A7.9 7.9 0 0 0 8 9.7l-2.3-1-2 3.5 2 1.5A8 8 0 0 0 5.8 15l-2 1.5 2 3.5 2.3-1a7.9 7.9 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.9 7.9 0 0 0 2.2-1.3l2.4 1 2-3.5-2.1-1.5Z" />
          </svg>
        </button>
        <div
          id="header-actions-menu"
          className={`header-actions${isActionMenuOpen ? " is-open" : ""}`}
        >
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
          <p>{isLoading ? "Loading..." : `${bookmarks.length} shown`}</p>
        </div>

        {!isLoading && bookmarks.length === 0 ? (
          <div className="empty-state">
            <h3>No bookmarks found</h3>
            <p>Add one above or adjust the current filters.</p>
          </div>
        ) : null}

        {bookmarks.length > 0 ? (
          <div className="bookmark-list">
            {bookmarks.map((bookmark) => {
              const isExpanded = expandedBookmarkIds.has(bookmark.id);

              return (
                <article
                  className="bookmark-card"
                  key={bookmark.id}
                  onClickCapture={handleBookmarkClickCapture}
                  onContextMenu={handleBookmarkContextMenu}
                  onPointerCancel={handleBookmarkPressEnd}
                  onPointerDown={(event) => handleBookmarkPressStart(bookmark, event)}
                  onPointerLeave={handleBookmarkPressEnd}
                  onPointerMove={handleBookmarkPressMove}
                  onPointerUp={handleBookmarkPressEnd}
                >
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
                        </div>
                        <button
                          type="button"
                          className="secondary-button copy-button"
                          onClick={() => copyBookmarkUrl(bookmark)}
                          aria-label={`Copy URL for ${displayTitle(bookmark)}`}
                        >
                          {copiedBookmarkId === bookmark.id ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path d="m5 12 4 4L19 6" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <rect x="9" y="9" width="10" height="10" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          className="secondary-button compact-toggle"
                          onClick={() => toggleBookmarkExpanded(bookmark.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Minimize bookmark" : "Maximize bookmark"}
                        >
                          {isExpanded ? "-" : "+"}
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className="bookmark-details">
                          <div className="bookmark-meta">
                            <p className="bookmark-host">{bookmark.url}</p>
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
        ) : null}
      </section>

      {actionBookmark ? (
        <BookmarkActionModal
          bookmark={actionBookmark}
          onClose={() => setActionBookmark(null)}
          onCopy={() => copyBookmarkFromActions(actionBookmark)}
          onExpand={() => expandBookmarkFromActions(actionBookmark)}
          onOpen={() => openBookmark(actionBookmark)}
        />
      ) : null}
    </main>
  );
}

interface BookmarkActionModalProps {
  bookmark: Bookmark;
  onClose: () => void;
  onCopy: () => void;
  onExpand: () => void;
  onOpen: () => void;
}

function BookmarkActionModal({
  bookmark,
  onClose,
  onCopy,
  onExpand,
  onOpen
}: BookmarkActionModalProps): JSX.Element {
  return (
    <div className="bookmark-action-backdrop" onClick={onClose}>
      <section
        className="bookmark-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-action-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id="bookmark-action-title">{displayTitle(bookmark)}</h2>
          <p className="bookmark-action-url">{bookmark.url}</p>
        </div>
        <div className="bookmark-action-buttons">
          <button type="button" onClick={onOpen}>
            Open
          </button>
          <button type="button" className="secondary-button" onClick={onCopy}>
            Copy
          </button>
          <button type="button" className="secondary-button" onClick={onExpand}>
            Expand
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
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
