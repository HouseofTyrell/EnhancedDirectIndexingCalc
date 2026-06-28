import '@testing-library/jest-dom';

function installStorageShim() {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      const normalizedKey = String(key);
      return store.get(normalizedKey) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

const storage = globalThis.localStorage as Storage | undefined;

if (
  typeof storage === 'undefined' ||
  typeof storage.getItem !== 'function' ||
  typeof storage.setItem !== 'function' ||
  typeof storage.removeItem !== 'function' ||
  typeof storage.clear !== 'function'
) {
  installStorageShim();
}
