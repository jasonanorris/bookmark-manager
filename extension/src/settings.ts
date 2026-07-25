import { getBrowserApi, type ExtensionSettings } from "./browser-api.js";

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: "",
  apiToken: ""
};

export async function loadSettings(): Promise<ExtensionSettings> {
  const api = getBrowserApi();
  const savedSettings = await api.storage.local.get(["apiUrl", "apiToken"]);

  return {
    apiUrl:
      typeof savedSettings.apiUrl === "string"
        ? savedSettings.apiUrl
        : DEFAULT_SETTINGS.apiUrl,
    apiToken:
      typeof savedSettings.apiToken === "string"
        ? savedSettings.apiToken
        : DEFAULT_SETTINGS.apiToken
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const api = getBrowserApi();
  await api.storage.local.set(settings);
}

export function normalizeApiUrl(value: string): string {
  const trimmedValue = value.trim().replace(/\/+$/, "");

  if (!trimmedValue) {
    throw new Error("Enter the API URL.");
  }

  let url: URL;

  try {
    url = new URL(addDefaultScheme(trimmedValue));
  } catch {
    throw new Error("Enter a valid API URL.");
  }

  if (!isAllowedProtocol(url)) {
    throw new Error("The API URL must use HTTPS, except localhost during development.");
  }

  return url.toString().replace(/\/+$/, "");
}

function addDefaultScheme(value: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function isAllowedProtocol(url: URL): boolean {
  if (url.protocol === "https:") {
    return true;
  }

  if (url.protocol !== "http:") {
    return false;
  }

  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}
