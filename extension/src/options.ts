import { loadSettings, normalizeApiUrl, saveSettings } from "./settings";

const form = getRequiredElement<HTMLFormElement>("#settings-form");
const apiUrlInput = getRequiredElement<HTMLInputElement>("#api-url");
const apiTokenInput = getRequiredElement<HTMLInputElement>("#api-token");
const status = getRequiredElement<HTMLParagraphElement>("#status");

void initialize();

async function initialize(): Promise<void> {
  try {
    const settings = await loadSettings();
    apiUrlInput.value = settings.apiUrl;
    apiTokenInput.value = settings.apiToken;
  } catch (error) {
    showStatus(getErrorMessage(error), "error");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleSubmit();
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

function showStatus(message: string, type: "error" | "success"): void {
  status.textContent = message;
  status.className = `status ${type}`;
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
