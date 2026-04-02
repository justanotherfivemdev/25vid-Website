import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users,
  Search,
  RefreshCw,
  Clock,
  Wifi,
  Shield,
  UserMinus,
  AlertTriangle,
  Loader2,
  ArrowUpDown,
  LogIn,
  LogOut,
} from 'lucide-react';

function PlayersModule() {
  const { server, serverId, canManage } = useOutletContext();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const isRunning = server?.status === 'running';

  const fetchPlayers = useCallback(async () => {
    // Player data comes from RCON or metrics - for now we show placeholder
    setLoading(false);
    // The actual player list would come from RCON #players command or a dedicated endpoint
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  const playerCount = server?.config?.game?.playerCountLimit || 64;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Online</span>
              <Users className="h-4 w-4 text-green-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              0 <span className="text-sm text-gray-600">/ {playerCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Peak Today</span>
              <ArrowUpDown className="h-4 w-4 text-tropic-gold" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>—</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Avg Session</span>
              <Clock className="h-4 w-4 text-blue-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>—</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Unique 24h</span>
              <Shield className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>—</div>
          </CardContent>
        </Card>
      </div>

      {/* Player Table */}
      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <Users className="h-4 w-4 text-tropic-gold" /> ACTIVE PLAYERS
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchPlayers}
              className="h-7 border-zinc-800 text-xs text-gray-400">
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="h-8 border-zinc-800 bg-black/60 pl-9 text-xs text-white placeholder:text-gray-600" />
          </div>
        </CardHeader>
        <CardContent>
          {!isRunning ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-600">
              <AlertTriangle className="mb-2 h-8 w-8 text-gray-700" />
              <p className="text-sm">Server is offline</p>
              <p className="mt-1 text-xs">Start the server to view active players</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-600">
              <Users className="mb-2 h-8 w-8 text-gray-700" />
              <p className="text-sm">No players connected</p>
              <p className="mt-1 text-xs">Player data will appear when players join the server</p>
            </div>
          )}

          {/* Table structure ready for when player data is available */}
          {players.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-gray-500">
                    <th className="pb-2 font-medium">Player</th>
                    <th className="pb-2 font-medium">Ping</th>
                    <th className="pb-2 font-medium">Session</th>
                    <th className="pb-2 font-medium">Joined</th>
                    {canManage && <th className="pb-2 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                      <td className="py-2 text-gray-200">{p.name}</td>
                      <td className="py-2">
                        <span className={p.ping > 150 ? 'text-red-400' : p.ping > 80 ? 'text-amber-400' : 'text-green-400'}>
                          {p.ping}ms
                        </span>
                      </td>
                      <td className="py-2 text-gray-400">{p.duration}</td>
                      <td className="py-2 text-gray-500">{p.joined}</td>
                      {canManage && (
                        <td className="py-2 text-right">
                          <Button size="sm" variant="ghost" className="h-6 text-gray-500 hover:text-red-400">
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
            <Clock className="h-4 w-4 text-tropic-gold" /> RECENT ACTIVITY
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-gray-600">
            <p className="text-xs">Join/leave activity will appear here</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PlayersModule;
