import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Swords, ExternalLink, History, AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CountryConflictsModal({ country, onClose }) {
  const [loading, setLoading] = useState(true);
  const [streamingText, setStreamingText] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('current');
  const scrollRef = useRef(null);

  const fetchConflicts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStreamingText('');

    try {
      // Use streaming endpoint
      const response = await fetch(
        `${API}/countries/conflicts?country=${encodeURIComponent(country)}&stream=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch conflict data');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6));
              if (chunk.type === 'text') {
                fullText += chunk.text;
                setStreamingText(fullText);
              } else if (chunk.type === 'done') {
                setData(chunk.data || { content: fullText });
                setLoading(false);
              } else if (chunk.type === 'error') {
                setError(chunk.error || 'Unknown error');
                setLoading(false);
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }

      // If never got "done" event, use what we have
      if (fullText) {
        setData({ content: fullText });
        setLoading(false);
      }
    } catch (err) {
      // Fallback to non-streaming
      try {
        const res = await axios.get(`${API}/countries/conflicts`, {
          params: { country },
          withCredentials: true,
        });
        setData(res.data);
      } catch (fallbackErr) {
        setError(err.message || 'Failed to load conflict intelligence');
      }
      setLoading(false);
    }
  }, [country]);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamingText]);

  const displayContent = data
    ? (activeTab === 'current' ? data.current?.conflicts : data.past?.conflicts) || data.content || streamingText
    : streamingText;

  const sources = data
    ? (activeTab === 'current' ? data.current?.sources : data.past?.sources) || []
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20">
              <Swords className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{country}</h2>
              <p className="text-xs text-gray-400">Conflict Intelligence — Powered by Valyu</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('current')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'current'
                ? 'text-red-400 border-b-2 border-red-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            Current Conflicts
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'past'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <History className="h-4 w-4" />
            Historical Conflicts
          </button>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {loading && !streamingText && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              <p className="text-sm text-gray-400">Analyzing conflicts for {country}...</p>
              <p className="text-xs text-gray-500">This may take a moment</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <AlertTriangle className="mx-auto h-8 w-8 text-red-400 mb-3" />
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchConflicts}
                className="mt-3 text-xs text-blue-400 hover:text-blue-300"
              >
                Try again
              </button>
            </div>
          )}

          {displayContent && (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          )}

          {/* Sources */}
          {sources.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-2">
                Sources ({sources.length})
              </h4>
              <div className="space-y-1.5">
                {sources.slice(0, 10).map((source, i) => (
                  <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-gray-400 hover:text-blue-400 transition-colors"
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
  );
}
