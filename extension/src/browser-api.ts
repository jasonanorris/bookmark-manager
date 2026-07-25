export interface ExtensionSettings {
  apiUrl: string;
  apiToken: string;
}

interface RuntimeApi {
  openOptionsPage(): Promise<void> | void;
}

interface StorageAreaApi {
  get(keys?: string[]): Promise<Partial<ExtensionSettings>>;
  set(values: Partial<ExtensionSettings>): Promise<void>;
}

interface TabsApi {
  query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<TabInfo[]>;
}

export interface TabInfo {
  title?: string;
  url?: string;
}

export interface WebExtensionApi {
  runtime: RuntimeApi;
  storage: {
    local: StorageAreaApi;
  };
  tabs: TabsApi;
}

declare global {
  interface Window {
    browser?: WebExtensionApi;
    chrome?: WebExtensionApi;
  }
}

export function getBrowserApi(): WebExtensionApi {
  const api = window.browser ?? window.chrome;

  if (!api) {
    throw new Error("WebExtension APIs are not available.");
  }

  return api;
}

