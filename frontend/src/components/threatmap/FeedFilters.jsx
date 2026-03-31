import React, { useEffect } from 'react';
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
    searchQuery, categoryFilters, threatLevelFilters,
    setSearchQuery, setCategoryFilters, setThreatLevelFilters, clearFilters,
  } = useEventsStore();

  const hasFilters = searchQuery || categoryFilters.length > 0 || threatLevelFilters.length > 0;

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

  // Non-admin users see a simplified curated view with search only
  // Clear any leftover category/threat filters so the feed isn't unexpectedly empty
  useEffect(() => {
    if (!isAdmin && (categoryFilters.length > 0 || threatLevelFilters.length > 0)) {
      setCategoryFilters([]);
      setThreatLevelFilters([]);
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
