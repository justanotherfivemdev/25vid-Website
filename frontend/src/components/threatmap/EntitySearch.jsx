import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Search, Loader2, Building2, User, Globe, Users,
  FileText, MapPin, ExternalLink, Maximize2, X,
} from 'lucide-react';
import { useMapStore } from '@/stores/threatMapStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';

import { API } from '@/utils/api';

const typeIcons = {
  organization: Building2,
  person: User,
  country: Globe,
  group: Users,
};

export default function EntitySearch() {
  const [query, setQuery] = useState('');
  const [entity, setEntity] = useState(null);
  const [researchResult, setResearchResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showFullReport, setShowFullReport] = useState(false);

  const { flyTo, setEntityLocations, clearEntityLocations } = useMapStore();

  const handleSearch = async () => {
    if (!query.trim()) return;

    clearEntityLocations();
    setEntity(null);
    setResearchResult(null);
    setError(null);
    setIsLoading(true);

    try {
      const res = await axios.post(`${API}/entity-search`, {
        name: query,
        includeDeepResearch: true,
      }, { withCredentials: true });

      const data = res.data;
      setEntity(data.entity);
      if (data.research) {
        setResearchResult(data.research);
      }

      // Show locations on map
      if (data.entity?.locations && data.entity.locations.length > 0) {
        setEntityLocations(data.entity.name, data.entity.locations);
        flyTo(data.entity.locations[0].longitude, data.entity.locations[0].latitude, 4);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Entity search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleFlyToLocation = (longitude, latitude) => {
    flyTo(longitude, latitude, 8);
  };

  const TypeIcon = entity ? (typeIcons[entity.type] || Building2) : Building2;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-tropic-gold-dark/20 p-4">
        <h2 className="text-lg font-semibold text-tropic-gold-light">Build Dossier</h2>
        <p className="text-sm text-tropic-gold-dark">Deep research on any actor with sourced analysis</p>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tropic-gold-dark" />
            <Input
              placeholder="e.g. Wagner Group, Hezbollah, North Korea..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9 bg-black border-tropic-gold-dark/30 text-gray-200 placeholder:text-gray-600 focus:border-tropic-gold/50 focus:ring-tropic-gold/20"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={isLoading || !query.trim()}
            className="bg-tropic-gold hover:bg-tropic-gold-light text-black font-semibold"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Research'}
          </Button>
        </div>

        {isLoading && (
          <div className="rounded-lg bg-tropic-gold/10 border border-tropic-gold/20 p-3 text-sm">
            <div className="flex items-center gap-2 text-tropic-gold-light font-medium mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-tropic-gold" />
              Generating Intelligence Report
            </div>
            <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
              <div className="h-full bg-tropic-gold/50 animate-pulse w-1/3" />
            </div>
            <p className="text-gray-500 text-xs mt-2">
              This may take a moment. Powered by <span className="text-tropic-gold">Valyu</span> intelligence.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-tropic-red/10 border border-tropic-red/20 p-3 text-sm text-tropic-red-light">
            {error}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        {entity && researchResult && (
          <Card className="bg-black border-tropic-gold-dark/20">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tropic-gold/20">
                  <TypeIcon className="h-5 w-5 text-tropic-gold" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg text-tropic-gold-light">{entity.name}</CardTitle>
                  <Badge variant="outline" className="mt-1 capitalize text-tropic-gold-dark border-tropic-gold-dark/30">
                    {entity.type}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Report preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-tropic-gold-light">
                    <FileText className="h-4 w-4" />
                    Intelligence Report
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFullReport(true)}
                    className="h-7 text-xs border-tropic-gold-dark/30 text-tropic-gold hover:text-tropic-gold-light hover:bg-tropic-gold/10"
                  >
                    <Maximize2 className="mr-1 h-3 w-3" />
                    View Full Report
                  </Button>
                </div>

                <div className="text-sm text-gray-400 max-h-40 overflow-hidden relative">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {(() => {
                      const text = researchResult.summary || '';
                      return text.length > 800 ? text.slice(0, 800) + '...' : text;
                    })()}
                  </ReactMarkdown>
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black to-transparent" />
                </div>
              </div>

              {/* Locations */}
              {entity.locations && entity.locations.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-tropic-gold-light flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Known Locations ({entity.locations.length})
                  </h4>
                  <div className="space-y-1">
                    {entity.locations.slice(0, 8).map((loc, i) => (
                      <button
                        key={i}
                        onClick={() => handleFlyToLocation(loc.longitude, loc.latitude)}
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-tropic-gold transition-colors w-full text-left"
                      >
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{loc.placeName || loc.country || `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources */}
              {researchResult.sources && researchResult.sources.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-tropic-gold-light">
                    Sources ({researchResult.sources.length})
                  </h4>
                  <div className="space-y-1">
                    {researchResult.sources.slice(0, 10).map((source, i) => (
                      <a
                        key={i}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-tropic-gold transition-colors"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{source.title || source.url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!entity && !isLoading && (
          <div className="py-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-tropic-gold-dark/50" />
            <p className="mt-4 text-sm text-gray-400">
              Enter any actor to compile an intelligence dossier
            </p>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <p>Wagner Group, Houthis, Hezbollah, North Korea</p>
              <p>Nations, militias, PMCs, cartels, political figures</p>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-tropic-gold/5 border border-tropic-gold-dark/20 text-xs text-gray-500">
              Reports are powered by <span className="text-tropic-gold font-medium">Valyu</span> intelligence and provide sourced analysis.
            </div>
          </div>
        )}

        {entity && isLoading && (
          <Card className="bg-black border-tropic-gold-dark/20">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tropic-gold/20">
                  <TypeIcon className="h-5 w-5 text-tropic-gold" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg text-tropic-gold-light">{entity.name}</CardTitle>
                  <Badge variant="outline" className="mt-1 capitalize text-tropic-gold-dark border-tropic-gold-dark/30">
                    {entity.type}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-4 bg-tropic-gold-dark/20 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-tropic-gold-dark/20 rounded animate-pulse w-full" />
                <div className="h-4 bg-tropic-gold-dark/20 rounded animate-pulse w-5/6" />
              </div>
            </CardContent>
          </Card>
        )}
      </ScrollArea>

      {/* Full Report Dialog */}
      {showFullReport && researchResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-black border border-tropic-gold-dark/30 rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-tropic-gold-dark/20">
              <h2 className="text-lg font-bold text-tropic-gold-light flex items-center gap-2">
                <FileText className="h-5 w-5 text-tropic-gold" />
                Intelligence Report: {entity?.name}
              </h2>
              <button
                onClick={() => setShowFullReport(false)}
                className="text-tropic-gold-dark hover:text-tropic-gold transition-colors p-1 rounded hover:bg-tropic-gold/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {researchResult.summary}
                </ReactMarkdown>
              </div>
              {researchResult.sources && researchResult.sources.length > 0 && (
                <div className="mt-8 pt-4 border-t border-tropic-gold-dark/20">
                  <h4 className="text-sm font-medium text-tropic-gold-light mb-3">
                    Sources ({researchResult.sources.length})
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {researchResult.sources.slice(0, 20).map((source, i) => (
                      <a
                        key={i}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-gray-400 hover:text-tropic-gold truncate"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{source.title || source.url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
