import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import EventFeed from './EventFeed';
import EntitySearch from './EntitySearch';
import { Activity, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ThreatMapSidebar() {
  const [activeTab, setActiveTab] = useState('feed');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tabs = [
    { id: 'feed', label: 'Live Feed', icon: Activity },
    { id: 'search', label: 'Intel', icon: FileText },
  ];

  return (
    <div
      className={`relative flex h-full flex-col border-l border-tropic-gold-dark/20 bg-black transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-96'
      }`}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-3 top-4 z-10 h-6 w-6 rounded-full border border-tropic-gold-dark/40 bg-black text-tropic-gold hover:bg-tropic-gold/10 hover:text-tropic-gold-light"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>

      {!isCollapsed && (
        <>
          <div className="flex border-b border-tropic-gold-dark/20">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-tropic-gold text-tropic-gold'
                    : 'text-gray-500 hover:text-tropic-gold-light'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'feed' && <EventFeed />}
            {activeTab === 'search' && <EntitySearch />}
          </div>
        </>
      )}

      {isCollapsed && (
        <div className="flex flex-col items-center gap-2 pt-12">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="ghost"
              size="icon"
              onClick={() => {
                setActiveTab(tab.id);
                setIsCollapsed(false);
              }}
              className={`h-8 w-8 text-gray-500 hover:text-tropic-gold ${
                activeTab === tab.id ? 'bg-tropic-gold/10 text-tropic-gold' : ''
              }`}
            >
              <tab.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
