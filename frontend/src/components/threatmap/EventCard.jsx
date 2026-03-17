import React, { memo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, stripUrls } from '@/utils/threatMapUtils';
import { useMapStore } from '@/stores/threatMapStore';
import {
  MapPin, Clock, Swords, Users, CloudLightning, Landmark,
  TrendingDown, AlertTriangle, Shield, Heart, Leaf, Target,
  Skull, Anchor, Droplets, ShoppingCart,
} from 'lucide-react';

const categoryIconMap = {
  conflict: Swords,
  protest: Users,
  disaster: CloudLightning,
  diplomatic: Landmark,
  economic: TrendingDown,
  terrorism: AlertTriangle,
  cyber: Shield,
  health: Heart,
  environmental: Leaf,
  military: Target,
  crime: Skull,
  piracy: Anchor,
  infrastructure: Droplets,
  commodities: ShoppingCart,
};

const threatBg = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-green-500/20 text-green-400',
  info: 'bg-blue-500/20 text-blue-400',
};

const EventCard = memo(function EventCard({ event, isSelected, onClick, style }) {
  const flyTo = useMapStore((state) => state.flyTo);
  const CategoryIcon = categoryIconMap[event.category] || AlertTriangle;

  const handleClick = useCallback(() => {
    onClick();
    flyTo(event.location.longitude, event.location.latitude, 6);
  }, [onClick, flyTo, event.location.longitude, event.location.latitude]);

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:bg-tropic-gold/5 border-tropic-gold-dark/15 bg-black/80 ${
        isSelected ? 'ring-2 ring-tropic-gold bg-tropic-gold/10' : ''
      }`}
      style={style}
      onClick={handleClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${threatBg[event.threatLevel] || threatBg.info}`}>
            <CategoryIcon className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium text-tropic-gold-light line-clamp-2">
                {event.title}
              </h3>
              <Badge
                variant="outline"
                className={`shrink-0 text-xs capitalize border-none ${threatBg[event.threatLevel] || threatBg.info}`}
              >
                {event.threatLevel}
              </Badge>
            </div>

            <div className="mt-1 text-xs text-gray-400 line-clamp-2 break-words">
              {stripUrls(event.summary)}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.location?.placeName || event.location?.country || 'Unknown'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(event.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default EventCard;
