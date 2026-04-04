import React, { useEffect, useMemo } from 'react';
import { useEventsStore } from '@/stores/threatMapStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
import { THREAT_LEVELS, EVENT_CATEGORIES } from '@/utils/threatMapUtils';

const threatBadgeVariant = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
  info: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export default function FeedFilters({ isAdmin = false }) {
  const {
    events, searchQuery, categoryFilters, threatLevelFilters,
    sourceFilters, campaignFilter,
    setSearchQuery, setCategoryFilters, setThreatLevelFilters,
    setSourceFilters, setCampaignFilter, clearFilters,
  } = useEventsStore();

  const hasFilters = (
    searchQuery ||
    categoryFilters.length > 0 ||
    threatLevelFilters.length > 0 ||
    sourceFilters.length > 0 ||
    campaignFilter !== 'all'
  );

  const sourceOptions = useMemo(() => {
    return [...new Set(events.map((event) => {
      if (event?.is_simulated || event?.event_nature === 'fictional') return 'simulated-intel';
      return event?.provider || event?.source || 'unknown';
    }))].filter(Boolean);
  }, [events]);

  const campaignOptions = useMemo(() => {
    return events
      .filter((event) => event.campaign_id || event.campaign_name)
      .map((event) => ({
        id: event.campaign_id || event.campaign_name,
        label: event.campaign_name || event.campaign_id,
      }))
      .filter((value, index, arr) => arr.findIndex((candidate) => candidate.id === value.id) === index);
  }, [events]);

  const toggleCategory = (category) => {
    if (categoryFilters.includes(category)) {
      setCategoryFilters(categoryFilters.filter((c) => c !== category));
    } else {
      setCategoryFilters([...categoryFilters, category]);
    }
  };

  const toggleThreatLevel = (level) => {
    if (threatLevelFilters.includes(level)) {
      setThreatLevelFilters(threatLevelFilters.filter((l) => l !== level));
    } else {
      setThreatLevelFilters([...threatLevelFilters, level]);
    }
  };

  const toggleSource = (source) => {
    if (sourceFilters.includes(source)) {
      setSourceFilters(sourceFilters.filter((value) => value !== source));
    } else {
      setSourceFilters([...sourceFilters, source]);
    }
  };

  // Non-admin users see a simplified curated view with search only
  // Clear any leftover category/threat filters so the feed isn't unexpectedly empty
  useEffect(() => {
    if (!isAdmin && (categoryFilters.length > 0 || threatLevelFilters.length > 0 || sourceFilters.length > 0 || campaignFilter !== 'all')) {
      setCategoryFilters([]);
      setThreatLevelFilters([]);
      setSourceFilters([]);
      setCampaignFilter('all');
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) {
    return (
      <div className="border-b border-tropic-gold-dark/20 p-4 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tropic-gold-dark" />
          <Input
            placeholder="Search intelligence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 bg-black border-tropic-gold-dark/30 text-gray-200 placeholder:text-gray-600 focus:border-tropic-gold/50 focus:ring-tropic-gold/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-tropic-gold"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-600 text-center">Curated intelligence feed</p>
      </div>
    );
  }

  // Admin users get full filtering controls
  return (
    <div className="border-b border-tropic-gold-dark/20 p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tropic-gold-dark" />
        <Input
          placeholder="Search events..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 bg-black border-tropic-gold-dark/30 text-gray-200 placeholder:text-gray-600 focus:border-tropic-gold/50 focus:ring-tropic-gold/20"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-tropic-gold"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-tropic-gold-dark">Threat Level</p>
        <div className="flex flex-wrap gap-1">
          {THREAT_LEVELS.map((level) => (
            <Badge
              key={level}
              variant="outline"
              className={`cursor-pointer capitalize text-xs ${
                threatLevelFilters.includes(level)
                  ? threatBadgeVariant[level]
                  : 'border-gray-600 text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => toggleThreatLevel(level)}
            >
              {level}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-tropic-gold-dark">Category</p>
        <div className="flex flex-wrap gap-1">
          {EVENT_CATEGORIES.map((category) => (
            <Badge
              key={category}
              variant="outline"
              className={`cursor-pointer capitalize text-xs ${
                categoryFilters.includes(category)
                  ? 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30'
                  : 'border-tropic-gold-dark/20 text-gray-500 hover:text-tropic-gold-light hover:border-tropic-gold-dark/40'
              }`}
              onClick={() => toggleCategory(category)}
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>

      {sourceOptions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-tropic-gold-dark">Source</p>
          <div className="flex flex-wrap gap-1">
            {sourceOptions.map((source) => (
              <Badge
                key={source}
                variant="outline"
                className={`cursor-pointer text-xs ${
                  sourceFilters.includes(source)
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'border-tropic-gold-dark/20 text-gray-500 hover:text-tropic-gold-light hover:border-tropic-gold-dark/40'
                }`}
                onClick={() => toggleSource(source)}
              >
                {source}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {campaignOptions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-tropic-gold-dark">Campaign</p>
          <select
            value={campaignFilter}
            onChange={(event) => setCampaignFilter(event.target.value)}
            className="w-full rounded-md border border-tropic-gold-dark/30 bg-black px-3 py-2 text-sm text-gray-200 focus:border-tropic-gold/50 focus:outline-none"
          >
            <option value="all">All campaigns</option>
            {campaignOptions.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.label}</option>
            ))}
          </select>
        </div>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="w-full text-tropic-gold-dark hover:text-tropic-gold hover:bg-tropic-gold/10"
        >
          <X className="mr-2 h-4 w-4" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
