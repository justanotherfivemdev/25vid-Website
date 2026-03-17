import React from 'react';
import { useEventsStore } from '@/stores/threatMapStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, RefreshCw, Activity, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ThreatMapHeader({ onRefresh, isLoading }) {
  const { filteredEvents } = useEventsStore();

  const threatCounts = filteredEvents.reduce((acc, event) => {
    acc[event.threatLevel] = (acc[event.threatLevel] || 0) + 1;
    return acc;
  }, {});

  return (
    <header className="relative flex h-14 items-center justify-between border-b border-tropic-gold-dark/30 bg-black px-4">
      <div className="flex items-center gap-3">
        <Link
          to="/hub"
          className="flex items-center gap-1 text-tropic-gold/70 hover:text-tropic-gold transition-colors mr-2"
          title="Back to Hub"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Globe className="h-6 w-6 text-tropic-gold" />
          <h1 className="text-lg font-bold text-tropic-gold-light">
            Global Threat Map
          </h1>
        </div>
        <Badge variant="outline" className="hidden md:flex border-tropic-gold/40 text-tropic-gold bg-tropic-gold/10">
          <Activity className="mr-1 h-3 w-3" />
          Live
        </Badge>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 text-sm text-gray-500 hidden lg:block">
        Powered by{' '}
        <a
          href="https://www.valyu.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-tropic-gold hover:text-tropic-gold-light hover:underline"
        >
          Valyu
        </a>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 md:flex">
          {threatCounts.critical > 0 && (
            <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10">
              {threatCounts.critical} Critical
            </Badge>
          )}
          {threatCounts.high > 0 && (
            <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-500/10">
              {threatCounts.high} High
            </Badge>
          )}
          <Badge variant="outline" className="border-tropic-gold-dark/50 text-tropic-gold bg-tropic-gold/5">
            {filteredEvents.length} Events
          </Badge>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh events"
          className="text-tropic-gold/70 hover:text-tropic-gold hover:bg-tropic-gold/10"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </header>
  );
}
