import React from 'react';
import { useEventsStore } from '@/stores/threatMapStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import EventCard from './EventCard';
import FeedFilters from './FeedFilters';
import { Loader2 } from 'lucide-react';

export default function EventFeed({ isAdmin = false }) {
  const { filteredEvents, isLoading, error, selectedEvent, selectEvent } = useEventsStore();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-tropic-gold-dark/20 p-4">
        <h2 className="text-lg font-semibold text-tropic-gold-light">Event Feed</h2>
        <p className="text-sm text-tropic-gold-dark">{filteredEvents.length} events</p>
      </div>

      <FeedFilters isAdmin={isAdmin} />

      <ScrollArea className="flex-1 p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
            <span className="ml-2 text-sm text-tropic-gold-dark">Loading events...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-tropic-red/10 border border-tropic-red/20 p-4 text-center">
            <p className="text-sm text-tropic-red-light">{error}</p>
          </div>
        )}

        {!isLoading && !error && filteredEvents.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">No events match your filters</p>
          </div>
        )}

        <div className="space-y-3">
          {filteredEvents.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              isSelected={selectedEvent?.id === event.id}
              onClick={() => selectEvent(event)}
              style={{ animationDelay: `${index * 50}ms` }}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
