import React from 'react';
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
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export default function FeedFilters() {
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

  return (
    <div className="border-b border-gray-700 p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder="Search events..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 bg-gray-800 border-gray-600 text-gray-200 placeholder:text-gray-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">Threat Level</p>
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
        <p className="mb-2 text-xs font-medium text-gray-500">Category</p>
        <div className="flex flex-wrap gap-1">
          {EVENT_CATEGORIES.map((category) => (
            <Badge
              key={category}
              variant="outline"
              className={`cursor-pointer capitalize text-xs ${
                categoryFilters.includes(category)
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'border-gray-600 text-gray-400 hover:text-gray-200'
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
          className="w-full text-gray-400 hover:text-gray-200"
        >
          <X className="mr-2 h-4 w-4" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
