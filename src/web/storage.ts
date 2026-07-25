const TOKEN_STORAGE_KEY = "bookmark-manager.apiToken";

export function loadStoredToken(): string {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function saveStoredToken(token: string): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

