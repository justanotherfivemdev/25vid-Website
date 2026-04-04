import React, { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  RotateCcw,
  HardDrive,
  Loader2,
  AlertTriangle,
  Zap,
  Shield,
  Package,
} from 'lucide-react';
import { API } from '@/utils/api';

const TASKS = [
  {
    id: 'restart',
    label: 'Restart Server',
    desc: 'Gracefully restart the game server container',
    icon: RotateCcw,
    action: 'restart',
    color: 'text-amber-400',
    border: 'border-amber-600/20',
    confirm: true,
  },
  {
    id: 'backup',
    label: 'Create Backup',
    desc: 'Snapshot current config and mod state',
    icon: HardDrive,
    action: 'backup',
    color: 'text-blue-400',
    border: 'border-blue-600/20',
    confirm: false,
  },
  {
    id: 'validate',
    label: 'Validate Config',
    desc: 'Check configuration for errors',
    icon: Shield,
    action: 'validate',
    color: 'text-green-400',
    border: 'border-green-600/20',
    confirm: false,
  },
  {
    id: 'refresh_mods',
    label: 'Re-ingest Mods',
    desc: 'Refresh all mod metadata from workshop',
    icon: Package,
    action: 'refresh_mods',
    color: 'text-purple-400',
    border: 'border-purple-600/20',
    confirm: false,
  },
];

function TriggerExecModule() {
  const { server, serverId, fetchServer, canManage } = useOutletContext();
  const [executing, setExecuting] = useState(null);
  const [results, setResults] = useState([]);
  const [confirmTask, setConfirmTask] = useState(null);

  const executeTask = useCallback(async (task) => {
    setConfirmTask(null);
    setExecuting(task.id);
    const result = { task: task.label, ts: new Date(), success: false, message: '' };

    try {
      if (task.action === 'restart') {
        await axios.post(`${API}/servers/${serverId}/restart`);
        result.success = true;
        result.message = 'Server restart initiated';
      } else if (task.action === 'backup') {
        await axios.post(`${API}/servers/${serverId}/backups`);
        result.success = true;
        result.message = 'Backup created successfully';
      } else if (task.action === 'validate') {
        const mods = server?.mods || [];
        const res = await axios.post(`${API}/servers/${serverId}/mods/validate`, { mods });
        const issues = res.data?.issues || [];
        result.success = true;
        result.message = issues.length === 0
          ? 'Configuration valid — no issues found'
          : `Validation found ${issues.length} issue(s)`;
      } else if (task.action === 'refresh_mods') {
        const mods = server?.mods || [];
        let successCount = 0;
        let failureCount = 0;
        for (const mod of mods) {
          const modId = mod.mod_id || mod.modId;
          if (modId) {
            try {
              await axios.post(`${API}/servers/workshop/mod/${modId}/refresh`);
              successCount++;
            } catch {
              failureCount++;
            }
          }
        }
        result.success = failureCount === 0;
        result.message = failureCount > 0
          ? `Refreshed ${successCount} mod(s), ${failureCount} failed`
          : `Refreshed metadata for ${successCount} mod(s)`;
      }
      await fetchServer(true);
    } catch (err) {
      result.message = err.response?.data?.detail || 'Task failed';
    }
    setResults(prev => [result, ...prev.slice(0, 19)]);
    setExecuting(null);
  }, [serverId, server?.mods, fetchServer]);

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
        TRIGGER / EXEC
      </h2>

      {/* Task grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TASKS.map((task) => {
          const Icon = task.icon;
          const isRunning = executing === task.id;
          return (
            <Card key={task.id} className={`${task.border} bg-[#050a0e]/60 hover:border-tropic-gold-dark/30 transition-colors`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${task.border} bg-[#050a0e]/40`}>
                    <Icon className={`h-4 w-4 ${task.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#d0d8e0]">{task.label}</div>
                    <div className="mt-0.5 text-[10px] text-[#4a6070]">{task.desc}</div>
                  </div>
                </div>
                <Button size="sm" className="mt-3 w-full h-7 bg-zinc-800 text-xs text-[#8a9aa8] hover:bg-zinc-700"
                  disabled={isRunning || !canManage}
                  onClick={() => task.confirm ? setConfirmTask(task) : executeTask(task)}>
                  {isRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
                  Execute
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Execution results */}
      {results.length > 0 && (
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">EXECUTION LOG</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-60 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {r.success ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                <span className="text-[#8a9aa8]">{r.task}</span>
                <span className="flex-1 text-[#4a6070]">{r.message}</span>
                <span className="text-[10px] text-[#4a6070]">{r.ts.toLocaleTimeString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!confirmTask} onOpenChange={() => setConfirmTask(null)}>
        <DialogContent className="max-w-sm border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-amber-400">Confirm Action</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#8a9aa8]">
            Are you sure you want to execute <strong className="text-white">{confirmTask?.label}</strong>?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmTask(null)}
              className="border-zinc-700 text-[#8a9aa8]">Cancel</Button>
            <Button size="sm" onClick={() => executeTask(confirmTask)}
              className="bg-amber-600 text-white hover:bg-amber-700">Execute</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TriggerExecModule;
