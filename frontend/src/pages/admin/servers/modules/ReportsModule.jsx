import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  RotateCcw,
  AlertTriangle,
  Settings,
  Puzzle,
  Download,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { API } from '@/utils/api';

function ReportsModule() {
  const { serverId } = useOutletContext();
  const [incidents, setIncidents] = useState([]);
  const [configHistory, setConfigHistory] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, confRes, backRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/incidents`),
        axios.get(`${API}/servers/${serverId}/config/history`),
        axios.get(`${API}/servers/${serverId}/backups`),
      ]);
      if (incRes.status === 'fulfilled') setIncidents(incRes.value.data?.incidents || incRes.value.data || []);
      if (confRes.status === 'fulfilled') setConfigHistory(confRes.value.data?.history || confRes.value.data || []);
      if (backRes.status === 'fulfilled') setBackups(backRes.value.data?.backups || backRes.value.data || []);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportReport = useCallback(() => {
    const report = {
      generated_at: new Date().toISOString(),
      server_id: serverId,
      summary: {
        total_incidents: incidents.length,
        open_incidents: incidents.filter(i => i.status === 'open').length,
        config_changes: configHistory.length,
        backups: backups.length,
      },
      incidents,
      config_changes: configHistory,
      backups: backups.map(b => ({ ...b, config_snapshot: undefined })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `server-report-${serverId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [serverId, incidents, configHistory, backups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          REPORTS
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchData}
            className="h-7 border-zinc-800 text-xs text-gray-400">
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
          <Button size="sm" onClick={exportReport}
            className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Total Incidents" value={incidents.length} icon={AlertTriangle} color="text-red-400" border="border-red-600/20" />
        <SummaryCard label="Open" value={incidents.filter(i => i.status === 'open').length} icon={AlertTriangle} color="text-amber-400" border="border-amber-600/20" />
        <SummaryCard label="Config Changes" value={configHistory.length} icon={Settings} color="text-blue-400" border="border-blue-600/20" />
        <SummaryCard label="Backups" value={backups.length} icon={CheckCircle} color="text-green-400" border="border-green-600/20" />
      </div>

      {/* Incident summary */}
      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">INCIDENT HISTORY</CardTitle>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <p className="text-xs text-gray-600 py-4 text-center">No incidents recorded</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {incidents.slice(0, 20).map((inc, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1">
                  <Badge variant="outline" className={`text-[9px] ${
                    inc.severity === 'critical' ? 'border-red-600/30 text-red-400' :
                    inc.severity === 'high' ? 'border-amber-600/30 text-amber-400' :
                    'border-zinc-600/30 text-gray-400'
                  }`}>{inc.severity}</Badge>
                  <span className="text-gray-300 flex-1 truncate">{inc.title}</span>
                  <Badge variant="outline" className={`text-[9px] ${
                    inc.status === 'open' ? 'border-red-600/30 text-red-400' :
                    inc.status === 'resolved' ? 'border-green-600/30 text-green-400' :
                    'border-zinc-600/30 text-gray-400'
                  }`}>{inc.status}</Badge>
                  <span className="text-[10px] text-gray-600">{inc.detected_at ? new Date(inc.detected_at).toLocaleDateString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restart / Config change history */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">CONFIG CHANGE HISTORY</CardTitle>
          </CardHeader>
          <CardContent>
            {configHistory.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">No config changes recorded</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {configHistory.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Settings className="h-3 w-3 text-gray-600" />
                    <span className="text-gray-400">{entry.changed_by || 'System'}</span>
                    <span className="ml-auto text-[10px] text-gray-600">{entry.changed_at ? new Date(entry.changed_at).toLocaleString() : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">BACKUP HISTORY</CardTitle>
          </CardHeader>
          <CardContent>
            {backups.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">No backups created</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {backups.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    <Badge variant="outline" className="text-[9px] border-zinc-700 text-gray-400">{b.backup_type}</Badge>
                    <span className="text-gray-400">{b.created_by || 'System'}</span>
                    <span className="ml-auto text-[10px] text-gray-600">{b.created_at ? new Date(b.created_at).toLocaleString() : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, border }) {
  return (
    <Card className={`${border} bg-black/60`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</span>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <div className="mt-1.5 text-xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default ReportsModule;
