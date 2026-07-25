import { getBrowserApi, type TabInfo } from "./browser-api";
import { loadSettings, normalizeApiUrl } from "./settings";

interface SaveResponse {
  bookmark?: {
    title: string;
  };
  created?: boolean;
  error?: {
    message?: string;
  };
}

const setupPanel = getRequiredElement<HTMLElement>("#setup-panel");
const openOptionsButton = getRequiredElement<HTMLButtonElement>("#open-options");
const settingsButton = getRequiredElement<HTMLButtonElement>("#settings-button");
const form = getRequiredElement<HTMLFormElement>("#bookmark-form");
const apiTarget = getRequiredElement<HTMLParagraphElement>("#api-target");
const titleInput = getRequiredElement<HTMLInputElement>("#title");
const urlInput = getRequiredElement<HTMLInputElement>("#url");
const descriptionInput = getRequiredElement<HTMLTextAreaElement>("#description");
const tagsInput = getRequiredElement<HTMLInputElement>("#tags");
const saveButton = getRequiredElement<HTMLButtonElement>("#save-button");
const status = getRequiredElement<HTMLParagraphElement>("#status");

void initialize();

openOptionsButton.addEventListener("click", openOptions);
settingsButton.addEventListener("click", openOptions);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveBookmark();
});

async function initialize(): Promise<void> {
  try {
    const settings = await loadSettings();
    const hasSettings = Boolean(settings.apiUrl && settings.apiToken);
    setupPanel.classList.toggle("hidden", hasSettings);
    form.classList.toggle("hidden", !hasSettings);
    apiTarget.textContent = settings.apiUrl ? `Saving to ${settings.apiUrl}` : "";
    showStatus(hasSettings ? "Ready." : "", "neutral");

    const tab = await getCurrentTab();

    if (tab.title) {
      titleInput.value = tab.title;
    }

    if (tab.url) {
      urlInput.value = tab.url;
    }
  } catch (error) {
    showStatus(getErrorMessage(error), "error");
  }
}

async function getCurrentTab(): Promise<TabInfo> {
  const api = getBrowserApi();
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? {};
}

async function saveBookmark(): Promise<void> {
  setBusy(true);
  showStatus("Saving...", "neutral");

  try {
    const settings = await loadSettings();

    if (!settings.apiUrl || !settings.apiToken) {
      setupPanel.classList.remove("hidden");
      form.classList.add("hidden");
      showStatus("Open settings first.", "error");
      return;
    }

    const apiUrl = normalizeApiUrl(settings.apiUrl);
    const response = await fetch(`${apiUrl}/api/bookmarks`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: urlInput.value.trim(),
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        tags: tagsInput.value
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      })
    });
    const body = await parseResponse(response);

    if (!response.ok) {
      showStatus(body.error?.message ?? "Bookmark could not be saved.", "error");
      return;
    }

    showStatus(body.created === false ? "Bookmark updated." : "Bookmark saved.", "success");
  } catch (error) {
    showStatus(getErrorMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

async function parseResponse(response: Response): Promise<SaveResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return (await response.json()) as SaveResponse;
  } catch {
    return {};
  }
}

function openOptions(): void {
  const api = getBrowserApi();
  void api.runtime.openOptionsPage();
}

function setBusy(isBusy: boolean): void {
  saveButton.disabled = isBusy;
  saveButton.textContent = isBusy ? "Saving..." : "Save";
}

function showStatus(message: string, type: "error" | "success" | "neutral"): void {
  status.textContent = message;
  status.className = type === "neutral" ? "status" : `status ${type}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error("Popup markup is incomplete.");
  }

  return element;
}
