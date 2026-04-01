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
  info: '#94a3b8',
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
  showADSB: JSON.parse(localStorage.getItem('showADSB') ?? 'false'),
  adsbFilters: JSON.parse(localStorage.getItem('adsbFilters') ?? JSON.stringify({
    originCountry: '',
    altitudeMin: null,
    altitudeMax: null,
    showOnGround: true,
    callsignSearch: '',
  })),
  isAutoPlaying: false,
  entityLocations: [],
  militaryBases: [],
  militaryBasesLoading: false,

  // Dual map system
  mapViewMode: localStorage.getItem('mapViewMode') || 'globe', // 'globe' | 'overlay'

  // Data source filter
  dataSourceFilter: localStorage.getItem('dataSourceFilter') || 'all', // 'all' | 'real' | 'fictional'

  // Layer visibility (worldmonitor-inspired)
  overlayLayers: JSON.parse(localStorage.getItem('overlayLayers') || JSON.stringify({
    conflicts: true,
    infrastructure: false,
    economic: false,
    military: true,
    diplomatic: false,
    environmental: false,
    flights: false,
    earthquakes: false,
    weather: false,
  })),

  setMapViewMode: (mode) => {
    localStorage.setItem('mapViewMode', mode);
    set({ mapViewMode: mode });
  },

  setDataSourceFilter: (filter) => {
    localStorage.setItem('dataSourceFilter', filter);
    set({ dataSourceFilter: filter });
    // Re-apply event filters so the data source change takes effect immediately
    useEventsStore.getState().applyFilters();
  },

  setOverlayLayer: (layer, visible) =>
    set((state) => {
      const next = { ...state.overlayLayers, [layer]: visible };
      localStorage.setItem('overlayLayers', JSON.stringify(next));
      return { overlayLayers: next };
    }),

  toggleOverlayLayer: (layer) =>
    set((state) => {
      const next = { ...state.overlayLayers, [layer]: !state.overlayLayers[layer] };
      localStorage.setItem('overlayLayers', JSON.stringify(next));
      return { overlayLayers: next };
    }),

  setViewport: (viewport) =>
    set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

  flyTo: (longitude, latitude, zoom = 8) =>
    set((state) => ({ viewport: { ...state.viewport, longitude, latitude, zoom } })),

  toggleHeatmap: () => set((state) => ({ showHeatmap: !state.showHeatmap })),
  toggleClusters: () => set((state) => ({ showClusters: !state.showClusters })),
  toggleMilitaryBases: () => set((state) => ({ showMilitaryBases: !state.showMilitaryBases })),
  toggleADSB: () =>
    set((state) => {
      const next = !state.showADSB;
      localStorage.setItem('showADSB', JSON.stringify(next));
      return { showADSB: next };
    }),
  setAdsbFilter: (key, value) =>
    set((state) => {
      const next = { ...state.adsbFilters, [key]: value };
      localStorage.setItem('adsbFilters', JSON.stringify(next));
      return { adsbFilters: next };
    }),
  resetAdsbFilters: () => {
    const defaults = { originCountry: '', altitudeMin: null, altitudeMax: null, showOnGround: true, callsignSearch: '' };
    localStorage.setItem('adsbFilters', JSON.stringify(defaults));
    set({ adsbFilters: defaults });
  },

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
    const { dataSourceFilter } = useMapStore.getState();
    let filtered = [...events];

    // Filter by data source (real-world vs fictional/milsim)
    if (dataSourceFilter === 'real') {
      filtered = filtered.filter((event) => event.event_nature !== 'fictional');
    } else if (dataSourceFilter === 'fictional') {
      filtered = filtered.filter((event) => event.event_nature === 'fictional');
    }

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
