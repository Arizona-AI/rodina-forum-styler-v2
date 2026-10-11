/**
 * Thin promise-based abstraction over the WebExtension APIs.
 *
 * Chrome (MV3) exposes callback-style `chrome.*`; Firefox exposes promise-style
 * `browser.*` and also defines `chrome.*`. Storage, navigation and version
 * helpers live here — including the "is this an extension context at all?"
 * gate, so the options UI degrades honestly in plain-page smoke tests.
 * Entry points that are guaranteed an extension context (service worker,
 * content script message listeners) use chrome.* directly at their call site.
 */

type StorageAreaName = "local" | "sync" | "session";

function api(): typeof chrome {
  const global = globalThis as { browser?: typeof chrome; chrome?: typeof chrome };
  const impl = global.browser ?? global.chrome;
  // A plain browser window also exposes window.chrome — but without
  // storage/runtime. Storage presence marks a real extension context (or a
  // test mock that implements it).
  if (!impl?.storage) throw new Error("WebExtension API is unavailable");
  return impl;
}

/** Runtime-only surface (messaging, URLs, options page) with a clear error. */
function runtime(): typeof chrome.runtime {
  const impl = api();
  if (!impl.runtime) throw new Error("WebExtension runtime is unavailable");
  return impl.runtime;
}

function getArea(name: StorageAreaName): chrome.storage.StorageArea {
  return api().storage[name];
}

/* ------------------------------ storage ------------------------------ */

export async function storageGet<T>(key: string, area: StorageAreaName = "local"): Promise<T | null> {
  try {
    const data = await getArea(area).get(key);
    const value = (data as Record<string, unknown>)[key];
    return value === undefined ? null : (value as T);
  } catch (err) {
    throw new Error(`storageGet(${key}) failed: ${String(err)}`);
  }
}

export async function storageSet(key: string, value: unknown, area: StorageAreaName = "local"): Promise<void> {
  try {
    await getArea(area).set({ [key]: value });
  } catch (err) {
    const message = String(err);
    if (/QUOTA/i.test(message)) {
      throw new Error("Хранилище переполнено — уменьшите объём данных (например, удалите неиспользуемые темы).");
    }
    throw new Error(`storageSet(${key}) failed: ${message}`);
  }
}

export async function storageRemove(key: string, area: StorageAreaName = "local"): Promise<void> {
  await getArea(area).remove(key);
}

export async function storageBytesInUse(area: StorageAreaName = "local"): Promise<number | null> {
  try {
    return await getArea(area).getBytesInUse(null);
  } catch {
    return null;
  }
}

/**
 * Subscribe to changes of a single key. Returns an unsubscribe function.
 * Fires for changes made from any extension context (popup, options, worker).
 */
export function onStorageChange(key: string, handler: (newValue: unknown) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
    if (areaName !== "local") return;
    const change = changes[key];
    if (change) handler(change.newValue);
  };
  api().storage.onChanged.addListener(listener as never);
  return () => api().storage.onChanged.removeListener(listener as never);
}

/* ----------------------------- navigation ---------------------------- */

/** Extension version from the manifest. */
export function extensionVersion(): string {
  try {
    return runtime().getManifest().version;
  } catch {
    // Outside an extension context (smoke tests, plain browser) the version
    // is informational only — degrade instead of breaking the whole UI.
    return "dev";
  }
}
