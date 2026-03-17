import { create } from 'zustand';

const THREAT_LEVEL_PRIORITY = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const threatLevelColors = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  info: '#3b82f6',
};

export const categoryIcons = {
  conflict: 'Swords',
  protest: 'Users',
  disaster: 'CloudLightning',
  diplomatic: 'Landmark',
  economic: 'TrendingDown',
  terrorism: 'AlertTriangle',
  cyber: 'Shield',
  health: 'Heart',
  environmental: 'Leaf',
  military: 'Target',
  crime: 'Skull',
  piracy: 'Anchor',
  infrastructure: 'Droplets',
  commodities: 'ShoppingCart',
};

const MAX_EVENTS = 1000;

const DEFAULT_VIEWPORT = {
  longitude: 0,
  latitude: 20,
  zoom: 2,
  bearing: 0,
  pitch: 0,
};

export const useMapStore = create((set) => ({
  viewport: DEFAULT_VIEWPORT,
  showHeatmap: false,
  showClusters: true,
  showMilitaryBases: true,
  isAutoPlaying: false,
  entityLocations: [],
  militaryBases: [],
  militaryBasesLoading: false,

  setViewport: (viewport) =>
    set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

  flyTo: (longitude, latitude, zoom = 8) =>
    set((state) => ({ viewport: { ...state.viewport, longitude, latitude, zoom } })),

  toggleHeatmap: () => set((state) => ({ showHeatmap: !state.showHeatmap })),
  toggleClusters: () => set((state) => ({ showClusters: !state.showClusters })),
  toggleMilitaryBases: () => set((state) => ({ showMilitaryBases: !state.showMilitaryBases })),

  startAutoPlay: () => set({ isAutoPlaying: true }),
  stopAutoPlay: () => set({ isAutoPlaying: false }),

  setEntityLocations: (entityName, locations) =>
    set({ entityLocations: locations.map((loc) => ({ ...loc, entityName })) }),
  clearEntityLocations: () => set({ entityLocations: [] }),

  setMilitaryBases: (bases) => set({ militaryBases: bases }),
  setMilitaryBasesLoading: (loading) => set({ militaryBasesLoading: loading }),
}));

export const useEventsStore = create((set, get) => ({
  events: [],
  filteredEvents: [],
  selectedEvent: null,
  isLoading: false,
  error: null,
  timeRange: null,
  categoryFilters: [],
  threatLevelFilters: [],
  searchQuery: '',

  setEvents: (events) => {
    set({ events });
    get().applyFilters();
  },

  addEvents: (events) => {
    set((state) => ({ events: [...events, ...state.events].slice(0, MAX_EVENTS) }));
    get().applyFilters();
  },

  selectEvent: (event) => set({ selectedEvent: event }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  setTimeRange: (timeRange) => {
    set({ timeRange });
    get().applyFilters();
  },

  setCategoryFilters: (categoryFilters) => {
    set({ categoryFilters });
    get().applyFilters();
  },

  setThreatLevelFilters: (threatLevelFilters) => {
    set({ threatLevelFilters });
    get().applyFilters();
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
    get().applyFilters();
  },

  applyFilters: () => {
    const { events, timeRange, categoryFilters, threatLevelFilters, searchQuery } = get();
    let filtered = [...events];

    if (timeRange) {
      filtered = filtered.filter((event) => {
        const eventTime = new Date(event.timestamp);
        return eventTime >= timeRange.start && eventTime <= timeRange.end;
      });
    }

    if (categoryFilters.length > 0) {
      filtered = filtered.filter((event) => categoryFilters.includes(event.category));
    }

    if (threatLevelFilters.length > 0) {
      filtered = filtered.filter((event) => threatLevelFilters.includes(event.threatLevel));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(query) ||
          event.summary.toLowerCase().includes(query) ||
          (event.location.placeName || '').toLowerCase().includes(query) ||
          (event.location.country || '').toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      const priorityA = THREAT_LEVEL_PRIORITY[a.threatLevel] ?? 5;
      const priorityB = THREAT_LEVEL_PRIORITY[b.threatLevel] ?? 5;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    set({ filteredEvents: filtered });
  },

  clearFilters: () => {
    set({ timeRange: null, categoryFilters: [], threatLevelFilters: [], searchQuery: '' });
    get().applyFilters();
  },
}));
