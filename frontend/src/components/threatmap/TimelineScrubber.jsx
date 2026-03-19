import React, { useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/threatMapStore';
import { Play, Pause } from 'lucide-react';

const PAN_SPEED = 0.3;

export default function TimelineScrubber() {
  const { isAutoPlaying, startAutoPlay, stopAutoPlay, viewport, setViewport } = useMapStore();
  const animationRef = useRef(null);

  const handlePlayToggle = () => {
    if (isAutoPlaying) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  };

  useEffect(() => {
    if (!isAutoPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = () => {
      setViewport({ longitude: ((viewport.longitude + PAN_SPEED + 180) % 360) - 180 });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAutoPlaying, viewport.longitude, setViewport]);

  return (
    <div className="absolute bottom-6 left-3 md:left-6 z-10">
      <button
        onClick={handlePlayToggle}
        className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          isAutoPlaying
            ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light shadow-tropic-gold/30'
            : 'bg-black/95 text-tropic-gold hover:bg-tropic-gold/10 border border-tropic-gold-dark/30'
        } backdrop-blur-sm`}
        title={isAutoPlaying ? 'Pause auto-pan' : 'Start auto-pan'}
      >
        {isAutoPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </button>
    </div>
  );
}
