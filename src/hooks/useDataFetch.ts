/**
 * useDataFetch — eliminates the repeated useEffect-fetch-loading-error pattern.
 *
 * Usage:
 *   const { data, isLoading, isRefreshing, refresh } = useDataFetch(
 *     () => awsAPI.getBusinessDashboard(),
 *     { extractData: (r) => r.stats }
 *   );
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseDataFetchOptions<TResponse, TData> {
  /** Extract the data from the API response. Default: (r) => r */
  extractData?: (response: TResponse) => TData;
  /** Default value when fetch fails or data is null */
  defaultValue?: TData;
  /** Whether to fetch immediately on mount. Default: true */
  fetchOnMount?: boolean;
}

interface UseDataFetchResult<TData> {
  data: TData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  refresh: () => void;
  reload: () => void;
}

export function useDataFetch<TResponse extends { success?: boolean }, TData = TResponse>(
  fetcher: () => Promise<TResponse>,
  options: UseDataFetchOptions<TResponse, TData> = {},
): UseDataFetchResult<TData> {
  const { extractData, defaultValue, fetchOnMount = true } = options;

  const [data, setData] = useState<TData | null>(defaultValue ?? null);
  const [isLoading, setIsLoading] = useState(fetchOnMount);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  // Store options in refs to avoid stale closures without adding them to deps
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const extractDataRef = useRef(extractData);
  extractDataRef.current = extractData;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const response = await fetcherRef.current();
      if (!mountedRef.current) return;
      if (response.success !== false) {
        const extracted = extractDataRef.current
          ? extractDataRef.current(response)
          : (response as unknown as TData);
        setData(extracted);
      } else if (defaultValueRef.current !== undefined) {
        setData(defaultValueRef.current as TData);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (__DEV__) console.warn('useDataFetch error:', err);
      setError(err);
      if (defaultValueRef.current !== undefined) setData(defaultValueRef.current as TData);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (fetchOnMount) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    loadData(false);
  }, [loadData]);

  const reload = useCallback(() => {
    loadData(true);
  }, [loadData]);

  return { data, isLoading, isRefreshing, error, refresh, reload };
}
