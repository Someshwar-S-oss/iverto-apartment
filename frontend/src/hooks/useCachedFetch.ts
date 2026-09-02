import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCache } from '../context/CacheContext';

export interface CachedFetchResult<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  hasData: boolean;
  fetchedAt: number | undefined;
  refetch: (force?: boolean) => Promise<T | undefined>;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

export interface UseCachedFetchOptions {
  /**
   * Skip the automatic background refetch on mount/dep change.
   * Useful when the caller wants to control fetches manually.
   */
  skipInitialFetch?: boolean;
  /**
   * Additional dependencies that should trigger an automatic refetch.
   * The cache key is always a dependency.
   */
  deps?: ReadonlyArray<unknown>;
}

/**
 * Subscribe to a cache entry, returning the cached value synchronously
 * when available, and triggering a background refetch on mount or when
 * dependencies change.
 *
 * - First render: returns cached data without showing a skeleton.
 * - `isLoading` is true only on the first render when no cached entry exists.
 * - Concurrent calls for the same key are deduped.
 * - Errors are captured into the cache entry so consumers can surface them
 *   while still keeping the previously cached data visible.
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedFetchOptions = {},
): CachedFetchResult<T> {
  const cache = useCache();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Read the entry synchronously so the first render already has data.
  const readEntry = useCallback((): { data: T | undefined; error: string | null; fetchedAt: number | undefined } => {
    const entry = cache.get<T>(key);
    if (!entry) return { data: undefined, error: null, fetchedAt: undefined };
    return { data: entry.data, error: entry.error, fetchedAt: entry.fetchedAt };
  }, [cache, key]);

  const initial = useMemo(readEntry, [readEntry]);
  const [data, setDataState] = useState<T | undefined>(initial.data);
  const [error, setError] = useState<string | null>(initial.error);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchedAt, setFetchedAt] = useState<number | undefined>(initial.fetchedAt);
  const mountedRef = useRef<boolean>(true);

  // Track mounted flag across renders.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // When key changes, sync immediately with current cache entry
  useEffect(() => {
    const entry = cache.get<T>(key);
    setDataState(entry?.data);
    setError(entry?.error ?? null);
    setFetchedAt(entry?.fetchedAt);
  }, [cache, key]);

  // Subscribe to cache mutations for this key so external updates
  // (e.g., realtime events writing to the same cache key) flow through.
  useEffect(() => {
    const unsubscribe = cache.subscribe(key, () => {
      const entry = cache.get<T>(key);
      if (!mountedRef.current) return;
      if (entry) {
        setDataState((prev) => (Object.is(prev, entry.data) ? prev : entry.data));
        setError((prev) => (prev === entry.error ? prev : entry.error));
        setFetchedAt(entry.fetchedAt);
      }
    });
    return unsubscribe;
  }, [cache, key]);

  const refresh = useCallback(
    async (force = false): Promise<T | undefined> => {
      if (!force) {
        const cached = cache.get<T>(key);
        if (cached && cached.data !== undefined && cached.data !== null) {
          return cached.data;
        }
      }

      if (mountedRef.current) setIsRefreshing(true);
      try {
        const result = await cache.dedupe<T>(key, () => fetcherRef.current());
        if (mountedRef.current) {
          setDataState(result);
          setError(null);
          setFetchedAt(Date.now());
        }
        return result;
      } catch (err: any) {
        const message =
          err?.response?.data?.message ||
          err?.message ||
          'Request failed';
        if (mountedRef.current) setError(message);
        return undefined;
      } finally {
        if (mountedRef.current) setIsRefreshing(false);
      }
    },
    [cache, key],
  );

  // Background refetch on mount and whenever deps change.
  useEffect(() => {
    if (options.skipInitialFetch) return undefined;
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...(options.deps ?? [])]);

  const setData = useCallback(
    (updater: T | ((prev: T | undefined) => T)) => {
      setDataState((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: T | undefined) => T)(prev)
            : updater;
        cache.set(key, next, null);
        return next;
      });
      setFetchedAt(Date.now());
    },
    [cache, key],
  );

  const hasData = data !== undefined && data !== null;
  // Only the very first render with no cached entry should show the skeleton.
  const isLoading = !hasData && !error && !options.skipInitialFetch;

  return useMemo(
    () => ({ data, error, isLoading, isRefreshing, hasData, fetchedAt, refetch: refresh, setData }),
    [data, error, isLoading, isRefreshing, hasData, fetchedAt, refresh, setData],
  );
}

export default useCachedFetch;