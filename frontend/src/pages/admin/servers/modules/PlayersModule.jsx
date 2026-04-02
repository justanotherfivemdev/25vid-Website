import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users,
  Search,
  RefreshCw,
  Clock,
  Shield,
  UserMinus,
  Loader2,
  ArrowUpDown,
} from 'lucide-react';
import { API } from '@/utils/api';
import ServerOfflinePanel from '@/components/servers/ServerOfflinePanel';

function PlayersModule() {
  const { server, serverId, canManage, handleServerAction, actionLoading } = useOutletContext();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('offline');
  const isRunning = server?.status === 'running';

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/players`);
      setPlayers(Array.isArray(res.data?.players) ? res.data.players : []);
      setSource(res.data?.source || 'rcon');
    } catch {
      setPlayers([]);
      setSource('rcon_error');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  const filteredPlayers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return players;
    return players.filter((player) => (player.name || '').toLowerCase().includes(term));
  }, [players, search]);

  const playerCount = server?.config?.game?.playerCountLimit || 64;

  return (
    <div className="space-y-6">
      {!isRunning && (
        <ServerOfflinePanel
          title="Players are unavailable while the server is offline"
          description="Player lists, join/leave activity, and other live server insights only appear after the server has been started."
          onStart={handleServerAction ? () => handleServerAction('start') : undefined}
          starting={actionLoading === 'start'}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Online" icon={Users} value={`${players.length} / ${playerCount}`} accent="text-green-400" />
        <StatCard label="Peak Today" icon={ArrowUpDown} value="—" accent="text-tropic-gold" />
        <StatCard label="Avg Session" icon={Clock} value="—" accent="text-blue-400" />
        <StatCard label="Unique 24h" icon={Shield} value="—" accent="text-purple-400" />
      </div>

      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <Users className="h-4 w-4 text-tropic-gold" /> ACTIVE PLAYERS
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchPlayers} disabled={loading}
              className="h-7 border-zinc-800 text-xs text-gray-400">
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Refresh
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
            <EmptyState title="Server is offline" description="Start the server to view connected players." />
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredPlayers.length === 0 ? (
            <EmptyState
              title={source === 'rcon_error' ? 'Live player data is unavailable' : 'No players connected'}
              description={source === 'rcon_error' ? 'The server is running, but live player data could not be retrieved right now.' : 'Player data will appear here when players join the server.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-gray-500">
                    <th className="pb-2 font-medium">Player</th>
                    <th className="pb-2 font-medium">Ping</th>
                    <th className="pb-2 font-medium">Source</th>
                    {canManage && <th className="pb-2 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player, index) => (
                    <tr key={`${player.name}-${index}`} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                      <td className="py-2 text-gray-200">{player.name || 'Unknown Player'}</td>
                      <td className="py-2 text-gray-400">{player.ping != null ? `${player.ping}ms` : '—'}</td>
                      <td className="py-2 text-gray-500">{source}</td>
                      {canManage && (
                        <td className="py-2 text-right">
                          <Button size="sm" variant="ghost" className="h-6 text-gray-500 hover:text-red-400" disabled>
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

      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
            <Clock className="h-4 w-4 text-tropic-gold" /> RECENT ACTIVITY
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-gray-600">
            <p className="text-xs">Join/leave activity will appear here when live player telemetry is available.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, icon: Icon, value, accent }) {
  return (
    <Card className="border-zinc-800 bg-black/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-600">
      <Users className="mb-2 h-8 w-8 text-gray-700" />
      <p className="text-sm">{title}</p>
      <p className="mt-1 text-xs">{description}</p>
    </div>
  );
}

export default PlayersModule;
