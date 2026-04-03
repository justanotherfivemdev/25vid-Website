import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Clock,
  RefreshCw,
  Loader2,
  Search,
  ChevronRight,
  XCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { API } from '@/utils/api';

function IncidentsModule() {
  const { serverId, canManage } = useOutletContext();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await axios.get(`${API}/servers/${serverId}/incidents${params}`);
      setIncidents(res.data?.incidents || res.data || []);
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, statusFilter]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const filtered = incidents.filter(inc => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return inc.title?.toLowerCase().includes(q) || inc.description?.toLowerCase().includes(q);
  });

  const severityIcon = (sev) => {
    if (sev === 'critical') return <AlertOctagon className="h-4 w-4 text-red-400" />;
    if (sev === 'high') return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    return <AlertTriangle className="h-4 w-4 text-gray-400" />;
  };

  const statusBadge = (status) => {
    const map = {
      open: 'border-red-600/30 text-red-400',
      investigating: 'border-amber-600/30 text-amber-400',
      resolved: 'border-green-600/30 text-green-400',
    };
    return map[status] || 'border-zinc-600/30 text-gray-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          INCIDENTS & TROUBLESHOOTING
        </h2>
        <Button size="sm" variant="outline" onClick={fetchIncidents}
          className="h-7 border-zinc-800 text-xs text-gray-400">
          <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Search incidents..."
            className="h-8 border-zinc-800 bg-black/60 pl-9 text-xs text-white placeholder:text-gray-600" />
        </div>
        {['all', 'open', 'investigating', 'resolved'].map((s) => (
          <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
            className={`h-8 text-xs ${statusFilter === s
              ? 'bg-tropic-gold text-black'
              : 'border-zinc-800 text-gray-400'
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Incidents list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="mb-2 h-8 w-8 text-green-600/40" />
            <p className="text-sm text-gray-500">No incidents found</p>
            <p className="mt-1 text-xs text-gray-600">
              {statusFilter === 'open' ? 'All clear — no open incidents' : 'No incidents match your search'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((inc, i) => (
            <Card key={inc.id || i} className="border-zinc-800 bg-black/60 hover:border-zinc-700 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {severityIcon(inc.severity)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-200">{inc.title || 'Untitled Incident'}</span>
                      <Badge variant="outline" className={`${statusBadge(inc.status)} text-[10px]`}>
                        {inc.status?.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${
                        inc.severity === 'critical' ? 'border-red-600/30 text-red-400' :
                        inc.severity === 'high' ? 'border-amber-600/30 text-amber-400' :
                        'border-zinc-600/30 text-gray-400'
                      }`}>
                        {inc.severity?.toUpperCase()}
                      </Badge>
                      {inc.auto_detected && (
                        <Badge variant="outline" className="border-blue-600/30 text-blue-400 text-[10px]">AUTO</Badge>
                      )}
                    </div>
                    {inc.description && (
                      <p className="mt-1 text-xs text-gray-400 line-clamp-2">{inc.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {inc.detected_at ? new Date(inc.detected_at).toLocaleString() : '—'}
                      </span>
                      {inc.incident_type && <span>Type: {inc.incident_type}</span>}
                      {inc.related_mod_issues?.length > 0 && (
                        <span className="text-amber-400">{inc.related_mod_issues.length} related mod issues</span>
                      )}
                    </div>
                    {inc.log_excerpts?.length > 0 && (
                      <div className="mt-2 rounded border border-zinc-800 bg-black/80 p-2">
                        <div className="font-mono text-[10px] text-gray-500 max-h-20 overflow-hidden">
                          {inc.log_excerpts.slice(0, 3).map((log, j) => (
                            <div key={j}>{log}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default IncidentsModule;
