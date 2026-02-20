/**
 * useProfileEventsGroups Hook Tests
 * Tests for profile events and groups loading via React Query
 *
 * Since React Query hooks require a QueryClient Provider (not available in node env),
 * we mock the hooks and test the data transformation logic.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockGetEvents = jest.fn();
const mockGetGroups = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('../../stores/userStore', () => ({
  useUserStore: jest.fn((selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-123' } })
  ),
}));

jest.mock('../../services/aws-api', () => ({
  __esModule: true,
  default: {
    getEvents: (...args: unknown[]) => mockGetEvents(...args),
    getGroups: (...args: unknown[]) => mockGetGroups(...args),
  },
}));

// Track queryFn callbacks from useQuery calls
let eventsQueryFn: (() => Promise<unknown>) | null = null;
let groupsQueryFn: (() => Promise<unknown>) | null = null;
let queryCallIndex = 0;

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((opts: { queryFn: () => Promise<unknown>; queryKey: unknown[]; enabled: boolean }) => {
    const callIdx = queryCallIndex++;
    if (callIdx % 2 === 0) {
      eventsQueryFn = opts.queryFn;
      return { data: undefined, isLoading: true };
    } else {
      groupsQueryFn = opts.queryFn;
      return { data: undefined, isLoading: true };
    }
  }),
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let callbackMap: Map<number, unknown> = new Map();
  let callbackIndex = 0;
  let result: T;

  const mockUseCallback = jest.fn((fn: unknown, _deps: unknown[]) => {
    const idx = callbackIndex++;
    callbackMap.set(idx, fn);
    return fn;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);

  function render() {
    callbackIndex = 0;
    queryCallIndex = 0;
    result = hookFn();
  }

  render();

  return {
    get current() { return result; },
    rerender() { render(); },
  };
}

import { useProfileEventsGroups } from '../../hooks/useProfileEventsGroups';

describe('useProfileEventsGroups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventsQueryFn = null;
    groupsQueryFn = null;
    queryCallIndex = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return expected properties', () => {
    const runner = createHookRunner(() => useProfileEventsGroups());

    expect(runner.current.events).toEqual([]);
    expect(runner.current.groups).toEqual([]);
    expect(runner.current.isLoading).toBe(true);
    expect(typeof runner.current.refresh).toBe('function');
  });

  it('should create two useQuery calls (events and groups)', () => {
    const { useQuery } = require('@tanstack/react-query');
    createHookRunner(() => useProfileEventsGroups());

    expect(useQuery).toHaveBeenCalledTimes(2);
  });

  // ========================================
  // Events query function
  // ========================================

  describe('events queryFn', () => {
    it('should fetch events and map them to flat format', async () => {
      mockGetEvents.mockResolvedValue({
        success: true,
        events: [
          {
            id: 'e1',
            title: 'Music Festival',
            location: { address: '123 Main St' },
            participants: { current: 50, max: 100 },
            coverImageUrl: 'https://cdn.example.com/cover.jpg',
            startsAt: '2026-03-01T10:00:00Z',
            category: { slug: 'music' },
            creator: { id: 'creator-1' },
          },
        ],
      });

      createHookRunner(() => useProfileEventsGroups());

      expect(eventsQueryFn).toBeTruthy();
      const result = await eventsQueryFn!();

      expect(mockGetEvents).toHaveBeenCalledWith({ filter: 'my-events' });
      expect(result).toEqual([
        {
          id: 'e1',
          title: 'Music Festival',
          address: '123 Main St',
          cover_image_url: 'https://cdn.example.com/cover.jpg',
          starts_at: '2026-03-01T10:00:00Z',
          current_participants: 50,
          max_participants: 100,
          category: 'music',
          creator_id: 'creator-1',
        },
      ]);
    });

    it('should return empty array when events fetch fails', async () => {
      mockGetEvents.mockResolvedValue({ success: false });

      createHookRunner(() => useProfileEventsGroups());
      const result = await eventsQueryFn!();

      expect(result).toEqual([]);
    });

    it('should handle missing optional fields', async () => {
      mockGetEvents.mockResolvedValue({
        success: true,
        events: [
          {
            id: 'e2',
            title: 'Simple Event',
            // no location, participants, coverImageUrl, etc.
          },
        ],
      });

      createHookRunner(() => useProfileEventsGroups());
      const result = await eventsQueryFn!();

      expect(result).toEqual([
        {
          id: 'e2',
          title: 'Simple Event',
          address: undefined,
          cover_image_url: undefined,
          starts_at: undefined,
          current_participants: 0,
          max_participants: undefined,
          category: undefined,
          creator_id: undefined,
        },
      ]);
    });
  });

  // ========================================
  // Groups query function
  // ========================================

  describe('groups queryFn', () => {
    it('should fetch groups and map them to flat format', async () => {
      mockGetGroups.mockResolvedValue({
        success: true,
        groups: [
          {
            id: 'g1',
            name: 'Running Club',
            address: '456 Park Ave',
            coverImageUrl: 'https://cdn.example.com/group.jpg',
            startsAt: '2026-04-01T08:00:00Z',
            currentParticipants: 25,
            maxParticipants: 50,
            category: 'sports',
            creator: { id: 'creator-2' },
          },
        ],
      });

      createHookRunner(() => useProfileEventsGroups());
      const result = await groupsQueryFn!();

      expect(mockGetGroups).toHaveBeenCalledWith({ filter: 'my-groups' });
      expect(result).toEqual([
        {
          id: 'g1',
          name: 'Running Club',
          address: '456 Park Ave',
          cover_image_url: 'https://cdn.example.com/group.jpg',
          starts_at: '2026-04-01T08:00:00Z',
          current_participants: 25,
          max_participants: 50,
          category: 'sports',
          creator_id: 'creator-2',
        },
      ]);
    });

    it('should return empty array when groups fetch fails', async () => {
      mockGetGroups.mockResolvedValue({ success: false });

      createHookRunner(() => useProfileEventsGroups());
      const result = await groupsQueryFn!();

      expect(result).toEqual([]);
    });

    it('should default currentParticipants to 0', async () => {
      mockGetGroups.mockResolvedValue({
        success: true,
        groups: [
          { id: 'g2', name: 'New Group' },
        ],
      });

      createHookRunner(() => useProfileEventsGroups());
      const result = await groupsQueryFn!();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any[])[0].current_participants).toBe(0);
    });
  });

  // ========================================
  // Refresh
  // ========================================

  describe('refresh', () => {
    it('should invalidate both events and groups queries', async () => {
      mockInvalidateQueries.mockResolvedValue(undefined);

      const runner = createHookRunner(() => useProfileEventsGroups());
      await runner.current.refresh();

      expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
    });
  });
});
