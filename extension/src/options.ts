import { loadSettings, normalizeApiUrl, saveSettings } from "./settings.js";

const form = getRequiredElement<HTMLFormElement>("#settings-form");
const apiUrlInput = getRequiredElement<HTMLInputElement>("#api-url");
const apiTokenInput = getRequiredElement<HTMLInputElement>("#api-token");
const testConnectionButton = getRequiredElement<HTMLButtonElement>("#test-connection");
const status = getRequiredElement<HTMLParagraphElement>("#status");

void initialize();

async function initialize(): Promise<void> {
  try {
    const settings = await loadSettings();
    apiUrlInput.value = settings.apiUrl;
    apiTokenInput.value = settings.apiToken;
    showStatus("Settings loaded.", "neutral");
  } catch (error) {
    showStatus(getErrorMessage(error), "error");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleSubmit();
});
testConnectionButton.addEventListener("click", () => {
  void handleTestConnection();
});

async function handleSubmit(): Promise<void> {
  try {
    const apiUrl = normalizeApiUrl(apiUrlInput.value);
    const apiToken = apiTokenInput.value.trim();

    if (!apiToken) {
      showStatus("Enter the API password.", "error");
      return;
    }

    await saveSettings({ apiUrl, apiToken });
    apiUrlInput.value = apiUrl;
    showStatus("Settings saved.", "success");
  } catch (error) {
    showStatus(getErrorMessage(error), "error");
  }
}

async function handleTestConnection(): Promise<void> {
  try {
    setBusy(true);
    showStatus("Testing connection...", "neutral");
    const apiUrl = normalizeApiUrl(apiUrlInput.value);
    const apiToken = apiTokenInput.value.trim();

    if (!apiToken) {
      showStatus("Enter the API password.", "error");
      return;
    }

    const response = await fetch(`${apiUrl}/api/bookmarks?limit=1`, {
      headers: {
        authorization: `Bearer ${apiToken}`
      }
    });

    if (response.status === 401) {
      showStatus("Bad password.", "error");
      return;
    }

    if (!response.ok) {
      showStatus(`Connection failed with HTTP ${response.status}.`, "error");
      return;
    }

    showStatus("Connection works.", "success");
  } catch (error) {
    showStatus(getErrorMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy: boolean): void {
  testConnectionButton.disabled = isBusy;
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
    throw new Error("Settings page markup is incomplete.");
  }

  return element;
}
