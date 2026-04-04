import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Shield,
  Users,
} from 'lucide-react';

function PlayersModule() {
  const { server } = useOutletContext();
  const [search, setSearch] = useState('');
  const isRunning = server?.status === 'running';
  const maxPlayers = useMemo(() => server?.config?.game?.maxPlayers || 64, [server]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[#4a6070]">Online</span>
              <Users className="h-4 w-4 text-green-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>
              - <span className="text-sm text-[#4a6070]">/ {maxPlayers}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[#4a6070]">Peak Today</span>
              <Clock className="h-4 w-4 text-tropic-gold" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>-</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[#4a6070]">Avg Session</span>
              <Clock className="h-4 w-4 text-blue-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>-</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[#4a6070]">Unique 24h</span>
              <Shield className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>-</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-[#050a0e]/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
              <Users className="h-4 w-4 text-tropic-gold" /> ACTIVE PLAYERS
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-zinc-800 text-xs text-[#8a9aa8]"
              disabled
              title="Refresh is unavailable until a live player source is implemented."
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4a6070]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players..."
              className="h-8 border-zinc-800 bg-[#050a0e]/60 pl-9 text-xs text-white placeholder:text-[#4a6070]"
            />
          </div>
        </CardHeader>
        <CardContent>
          {!isRunning ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#4a6070]">
              <AlertTriangle className="mb-2 h-8 w-8 text-[#4a6070]" />
              <p className="text-sm">Server is offline.</p>
              <p className="mt-1 text-xs">Start the server to make live player data available.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[#4a6070]">
              <Users className="mb-2 h-8 w-8 text-[#4a6070]" />
              <p className="text-sm">Live player list is not available yet.</p>
              <p className="mt-1 text-xs">This workspace now avoids fake player data until a validated Reforger player source is wired in.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PlayersModule;
