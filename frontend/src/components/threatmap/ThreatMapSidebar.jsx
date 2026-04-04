import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import EventFeed from './EventFeed';
import EntitySearch from './EntitySearch';
import { Activity, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ThreatMapSidebar({ isAdmin = false }) {
  const [activeTab, setActiveTab] = useState('feed');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsCollapsed(true);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const tabs = [
    { id: 'feed', label: 'Live Feed', icon: Activity },
    { id: 'search', label: 'Intel', icon: FileText },
  ];

  // On mobile when expanded, render as overlay
  if (isMobile && !isCollapsed) {
    return (
      <>
        <div className="fixed inset-0 z-30 bg-[#050a0e]/50" onClick={() => setIsCollapsed(true)} />
        <div className="fixed right-0 top-14 bottom-0 z-40 w-80 max-w-[85vw] flex flex-col border-l border-tropic-gold-dark/20 bg-[#050a0e]">
          <Button
            variant="ghost"
            size="icon"
            className="absolute -left-3 top-4 z-10 h-6 w-6 rounded-full border border-tropic-gold-dark/40 bg-[#050a0e] text-tropic-gold hover:bg-tropic-gold/10 hover:text-tropic-gold-light"
            onClick={() => setIsCollapsed(true)}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <div className="flex border-b border-tropic-gold-dark/20">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-tropic-gold text-tropic-gold'
                    : 'text-[#4a6070] hover:text-tropic-gold-light'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            {activeTab === 'feed' && <EventFeed isAdmin={isAdmin} />}
            {activeTab === 'search' && <EntitySearch />}
          </div>
        </div>
      </>
    );
  }

  // On mobile when collapsed, just show the toggle button
  if (isMobile && isCollapsed) {
    return (
      <div className="absolute right-2 top-2 z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full border border-tropic-gold-dark/40 bg-[#050a0e]/80 text-tropic-gold hover:bg-tropic-gold/10"
          onClick={() => setIsCollapsed(false)}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Desktop layout (unchanged)
  return (
    <div
      className={`relative flex h-full flex-col border-l border-tropic-gold-dark/20 bg-[#050a0e] transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-96'
      }`}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-3 top-4 z-10 h-6 w-6 rounded-full border border-tropic-gold-dark/40 bg-[#050a0e] text-tropic-gold hover:bg-tropic-gold/10 hover:text-tropic-gold-light"
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
                    : 'text-[#4a6070] hover:text-tropic-gold-light'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'feed' && <EventFeed isAdmin={isAdmin} />}
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
              className={`h-8 w-8 text-[#4a6070] hover:text-tropic-gold ${
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
