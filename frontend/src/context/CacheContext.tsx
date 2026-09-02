import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface CacheEntry<T> {
  data: T;
  error: string | null;
  fetchedAt: number;
}

type Listener = (key: string) => void;

export interface CacheContextType {
  get: <T = unknown>(key: string) => CacheEntry<T> | undefined;
  set: <T = unknown>(key: string, data: T, error?: string | null) => void;
  remove: (key: string) => void;
  clear: (prefix?: string) => void;
  dedupe: <T = unknown>(key: string, runner: () => Promise<T>) => Promise<T>;
  subscribe: (key: string, listener: Listener) => () => void;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

const STORAGE_KEY = 'iverto_cache_v1';
const STORAGE_VERSION = 1;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface PersistedEntry {
  v: number;
  data: unknown;
  error: string | null;
  fetchedAt: number;
}

interface PersistedSnapshot {
  v: number;
  entries: Record<string, PersistedEntry>;
}

const isExpired = (
  entry: Pick<CacheEntry<unknown>, 'fetchedAt'>,
  now: number,
): boolean => now - entry.fetchedAt > DEFAULT_TTL_MS;

const safeParse = (raw: string | null): PersistedSnapshot | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.v !== STORAGE_VERSION) return null;
    if (!parsed.entries || typeof parsed.entries !== 'object') return null;
    return parsed as PersistedSnapshot;
  } catch {
    return null;
  }
};

const readPersisted = (): Record<string, CacheEntry<unknown>> => {
  if (typeof window === 'undefined') return {};
  const snapshot = safeParse(window.sessionStorage.getItem(STORAGE_KEY));
  if (!snapshot) return {};
  const now = Date.now();
  const entries: Record<string, CacheEntry<unknown>> = {};
  for (const [key, persisted] of Object.entries(snapshot.entries)) {
    if (!persisted || isExpired(persisted, now)) continue;
    entries[key] = {
      data: persisted.data,
      error: persisted.error ?? null,
      fetchedAt: persisted.fetchedAt,
    };
  }
  return entries;
};

const writePersisted = (entries: Map<string, CacheEntry<unknown>>): void => {
  if (typeof window === 'undefined') return;
  try {
    const snapshot: PersistedSnapshot = {
      v: STORAGE_VERSION,
      entries: Object.fromEntries(
        Array.from(entries.entries()).map(([key, entry]) => [
          key,
          {
            v: STORAGE_VERSION,
            data: entry.data,
            error: entry.error,
            fetchedAt: entry.fetchedAt,
          },
        ]),
      ),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage may be full or disabled; cache is best-effort.
  }
};

export const CacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entries, setEntries] = useState<Map<string, CacheEntry<unknown>>>(() => {
    const initial = new Map<string, CacheEntry<unknown>>();
    for (const [key, value] of Object.entries(readPersisted())) {
      initial.set(key, value);
    }
    return initial;
  });

  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<unknown>>>(new Map());

  useEffect(() => {
    writePersisted(entries);
  }, [entries]);

  const notify = useCallback((changedKey: string) => {
    const set = listenersRef.current.get(changedKey);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(changedKey);
      } catch {
        // never let one listener break others
      }
    }
  }, []);

  const get = useCallback(
    <T = unknown,>(key: string): CacheEntry<T> | undefined => {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (isExpired(entry, Date.now())) return undefined;
      return entry as CacheEntry<T>;
    },
    [entries],
  );

  const set = useCallback(
    <T = unknown,>(key: string, data: T, error: string | null = null) => {
      setEntries((prev) => {
        const next = new Map(prev);
        next.set(key, { data, error, fetchedAt: Date.now() });
        return next;
      });
      notify(key);
    },
    [notify],
  );

  const remove = useCallback(
    (key: string) => {
      setEntries((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      notify(key);
    },
    [notify],
  );

  const clear = useCallback(
    (prefix?: string) => {
      setEntries((prev) => {
        if (!prefix) return new Map();
        const next = new Map(prev);
        let changed = false;
        const matched: string[] = [];
        for (const key of next.keys()) {
          if (key.startsWith(prefix)) {
            matched.push(key);
            next.delete(key);
            changed = true;
          }
        }
        if (changed) {
          for (const k of matched) notify(k);
        }
        return changed ? next : prev;
      });
    },
    [notify],
  );

  const dedupe = useCallback(
    <T = unknown,>(key: string, runner: () => Promise<T>): Promise<T> => {
      const existing = inFlightRef.current.get(key) as Promise<T> | undefined;
      if (existing) return existing;

      const promise = (async () => {
        try {
          const data = await runner();
          set(key, data, null);
          return data;
        } catch (err: any) {
          const message =
            err?.response?.data?.message ||
            err?.message ||
            'Request failed';
          // Persist the error in the cache so consumers can surface it,
          // but keep any previously cached data intact.
          setEntries((prev) => {
            const existingEntry = prev.get(key);
            const next = new Map(prev);
            next.set(key, {
              data: (existingEntry?.data ?? null) as T,
              error: message,
              fetchedAt: Date.now(),
            });
            return next;
          });
          notify(key);
          throw err;
        } finally {
          inFlightRef.current.delete(key);
        }
      })();

      inFlightRef.current.set(key, promise);
      return promise;
    },
    [set, notify],
  );

  const subscribe = useCallback((key: string, listener: Listener): (() => void) => {
    let set = listenersRef.current.get(key);
    if (!set) {
      set = new Set();
      listenersRef.current.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = listenersRef.current.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) listenersRef.current.delete(key);
    };
  }, []);

  const value = useMemo<CacheContextType>(
    () => ({ get, set, remove, clear, dedupe, subscribe }),
    [get, set, remove, clear, dedupe, subscribe],
  );

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
};

export const useCache = (): CacheContextType => {
  const ctx = useContext(CacheContext);
  if (!ctx) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return ctx;
};

export const CACHE_TTL_MS = DEFAULT_TTL_MS;
export default CacheContext;