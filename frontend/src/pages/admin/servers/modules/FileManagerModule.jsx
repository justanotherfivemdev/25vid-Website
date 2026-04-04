import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { API } from '@/utils/api';
import {
  Folder,
  Loader2,
  RefreshCw,
  Server,
  Terminal,
  Wrench,
} from 'lucide-react';

function TroubleshootRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded border border-zinc-800/50 bg-[#050a0e]/40 px-3 py-2">
      <span className="text-xs text-[#4a6070]">{label}</span>
      <span className="break-all text-right font-mono text-xs text-[#8a9aa8]">{value || '-'}</span>
    </div>
  );
}

function FileManagerModule() {
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

  const paths = diagnostics?.paths || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          TROUBLESHOOTING
        </h2>
        <Button size="sm" variant="outline" onClick={fetchDiagnostics} className="h-7 border-zinc-800 text-xs text-[#8a9aa8]">
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh
        </Button>
      </div>

      <Card className="border-zinc-800 bg-[#050a0e]/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
            <Server className="h-3.5 w-3.5 text-tropic-gold" /> CONTAINER CONTEXT
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <TroubleshootRow label="Container" value={diagnostics?.container_name} />
          <TroubleshootRow label="Image" value={diagnostics?.image} />
          <TroubleshootRow label="Runtime Status" value={diagnostics?.docker?.status || diagnostics?.status} />
          <TroubleshootRow label="Provisioning Step" value={diagnostics?.provisioning_step} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
              <Folder className="h-3.5 w-3.5 text-tropic-gold" /> MANAGED DATA PATHS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <TroubleshootRow label="Configs" value={paths.config_path} />
            <TroubleshootRow label="Profile" value={paths.profile_path} />
            <TroubleshootRow label="Workshop" value={paths.workshop_path} />
            <TroubleshootRow label="SAT Config" value={paths.sat_config_path || 'Not discovered yet'} />
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
              <Terminal className="h-3.5 w-3.5 text-tropic-gold" /> WHAT TO CHECK
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-[#8a9aa8]">
            <div className="rounded border border-zinc-800/50 bg-[#050a0e]/40 px-3 py-2">
              Confirm the container is running before using RCON or viewing live logs.
            </div>
            <div className="rounded border border-zinc-800/50 bg-[#050a0e]/40 px-3 py-2">
              The mounted profile path is where Server Admin Tools files will appear after first boot.
            </div>
            <div className="rounded border border-zinc-800/50 bg-[#050a0e]/40 px-3 py-2">
              Workshop and config paths are isolated per server and should never overlap.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded border border-zinc-800/70 bg-[#050a0e]/40 px-3 py-2 text-xs text-[#4a6070]">
        <Wrench className="mr-2 inline h-3.5 w-3.5 text-tropic-gold" />
        This area is diagnostics-only. Infrastructure files and Docker mounts are owned by the backend service.
      </div>
    </div>
  );
}

export default FileManagerModule;
