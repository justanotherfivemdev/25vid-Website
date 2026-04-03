import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API } from '@/utils/api';
import {
  Cpu,
  FolderTree,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react';

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-right text-xs text-gray-300 ${mono ? 'font-mono break-all' : ''}`}>
        {value || '-'}
      </span>
    </div>
  );
}

function SystemSettingsModule() {
  const { serverId } = useOutletContext();
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/diagnostics`);
      setDiagnostics(res.data);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  if (loading && !diagnostics) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
      </div>
    );
  }

  const mounts = diagnostics?.mounts || [];
  const paths = diagnostics?.paths || {};
  const ports = diagnostics?.ports || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          INFRASTRUCTURE DIAGNOSTICS
        </h2>
        <Button size="sm" variant="outline" onClick={fetchDiagnostics} className="h-7 border-zinc-800 text-xs text-gray-400">
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="rounded border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-xs text-amber-400">
        Docker image, container identity, env, and mounts are backend-managed and read-only here.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <Server className="h-3.5 w-3.5 text-tropic-gold" /> CONTAINER
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Image" value={diagnostics?.image} mono />
            <Row label="Container" value={diagnostics?.container_name} mono />
            <Row label="Container ID" value={diagnostics?.container_id} mono />
            <Row label="Status" value={diagnostics?.docker?.status || diagnostics?.status} />
            <Row label="Readiness" value={diagnostics?.readiness_state} />
            <Row label="Provisioning" value={diagnostics?.provisioning_step} />
            {diagnostics?.last_docker_error && (
              <div className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-[11px] text-red-400">
                {diagnostics.last_docker_error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <ShieldAlert className="h-3.5 w-3.5 text-tropic-gold" /> HOST PORTS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Game UDP" value={String(ports.game || '')} mono />
            <Row label="A2S UDP" value={String(ports.query || '')} mono />
            <Row label="RCON UDP" value={String(ports.rcon || '')} mono />
            <div className="pt-2">
              <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-500">
                Host-level ports are allocated by the backend to avoid collisions.
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <FolderTree className="h-3.5 w-3.5 text-tropic-gold" /> MANAGED PATHS
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            <Row label="Data Root" value={paths.data_root} mono />
            <Row label="Config Path" value={paths.config_path} mono />
            <Row label="Profile Path" value={paths.profile_path} mono />
            <Row label="Workshop Path" value={paths.workshop_path} mono />
            <Row label="Diagnostics Path" value={paths.diagnostics_path} mono />
            <Row label="SAT Config Path" value={paths.sat_config_path || 'Not discovered yet'} mono />
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <HardDrive className="h-3.5 w-3.5 text-tropic-gold" /> MOUNTS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mounts.length === 0 ? (
              <p className="text-xs text-gray-600">Mount information is not available yet.</p>
            ) : (
              mounts.map((mount) => (
                <div key={`${mount.Source}-${mount.Destination}`} className="rounded border border-zinc-800/70 bg-black/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-4 text-[11px]">
                    <span className="font-mono text-gray-400 break-all">{mount.Source}</span>
                    <span className="text-gray-600">to</span>
                    <span className="font-mono text-gray-300 break-all">{mount.Destination}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SystemSettingsModule;
