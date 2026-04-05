import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  CheckCircle,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Save,
  ShieldCheck,
  Wifi,
  XCircle,
} from 'lucide-react';
import { API } from '@/utils/api';

function IntegrationsModule() {
  const { canManage } = useOutletContext();

  /* ── state ─────────────────────────────────────────────────────────────── */

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // BattleMetrics
  const [bmKeyMasked, setBmKeyMasked] = useState('');
  const [bmKeySet, setBmKeySet] = useState(false);
  const [bmKeyInput, setBmKeyInput] = useState('');
  const [bmKeyVisible, setBmKeyVisible] = useState(false);
  const [bmKeyDirty, setBmKeyDirty] = useState(false);

  /* ── load settings ─────────────────────────────────────────────────────── */

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/integrations`);
      setBmKeyMasked(res.data.battlemetrics_api_key_masked || '');
      setBmKeySet(res.data.battlemetrics_api_key_set || false);
      setBmKeyInput('');
      setBmKeyDirty(false);
    } catch {
      // Settings may not exist yet — that's fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /* ── save ───────────────────────────────────────────────────────────────── */

  const handleSave = useCallback(async () => {
    if (!canManage) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await axios.put(`${API}/servers/integrations`, {
        battlemetrics_api_key: bmKeyInput,
      });
      setSaveMsg({ type: 'success', text: 'Settings saved successfully' });
      await fetchSettings();
    } catch (err) {
      setSaveMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  }, [bmKeyInput, canManage, fetchSettings]);

  /* ── test connection ───────────────────────────────────────────────────── */

  const handleTestBattleMetrics = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${API}/servers/integrations/test-battlemetrics`);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.detail || 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  }, []);

  /* ── clear key ─────────────────────────────────────────────────────────── */

  const handleClearBmKey = useCallback(async () => {
    if (!canManage) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await axios.put(`${API}/servers/integrations`, {
        battlemetrics_api_key: '',
      });
      setSaveMsg({ type: 'success', text: 'API key cleared' });
      await fetchSettings();
      setTestResult(null);
    } catch (err) {
      setSaveMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to clear API key',
      });
    } finally {
      setSaving(false);
    }
  }, [canManage, fetchSettings]);

  /* ── render ────────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#4a6070]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading integration settings...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hero banner */}
      <div className="relative rounded-lg border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] p-6">
        <div className="corner-bracket" />
        <p className="mb-1 font-['Oswald'] text-[10px] uppercase tracking-[0.2em] text-[#c9a227]">
          CONFIGURATION
        </p>
        <h1 className="font-['Share_Tech'] text-2xl font-bold text-[#e8c547]">
          Integrations
        </h1>
        <p className="mt-1 font-['Inter'] text-sm text-[#8a9aa8]">
          Configure API keys and external service connections. Changes take effect immediately — no server restart required.
        </p>
      </div>

      {/* Status message */}
      {saveMsg && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            saveMsg.type === 'success'
              ? 'border-green-600/30 bg-green-900/10 text-green-400'
              : 'border-red-600/30 bg-red-900/10 text-red-400'
          }`}
        >
          {saveMsg.type === 'success' ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {saveMsg.text}
        </div>
      )}

      {/* ── BattleMetrics ────────────────────────────────────────────────── */}
      <Card className="border-zinc-800 bg-[#0c1117]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-['Share_Tech'] text-base text-[#e8c547]">
              <ShieldCheck className="h-5 w-5" /> BattleMetrics
            </CardTitle>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                bmKeySet
                  ? 'border-green-600/30 text-green-400'
                  : 'border-zinc-600/30 text-zinc-400'
              }`}
            >
              {bmKeySet ? 'API Key Configured' : 'Using Public API'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-[#8a9aa8]">
            An API key from{' '}
            <a
              href="https://www.battlemetrics.com/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c9a227] hover:underline"
            >
              battlemetrics.com/developers
            </a>
            {' '}enables higher rate limits and access to additional data.
            The Compare Servers feature works without a key, but may be rate-limited.
          </p>

          {/* Current key status */}
          {bmKeySet && (
            <div className="flex items-center gap-2 rounded border border-zinc-800 bg-[#050a0e]/60 px-3 py-2">
              <Key className="h-3.5 w-3.5 text-[#c9a227]" />
              <span className="font-mono text-xs text-[#8a9aa8]">
                Current key: {bmKeyMasked}
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearBmKey}
                  disabled={saving}
                  className="ml-auto h-6 text-[10px] text-red-400 hover:text-red-300"
                >
                  Clear
                </Button>
              )}
            </div>
          )}

          {/* Input new key */}
          {canManage && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[#8a9aa8]">
                {bmKeySet ? 'Replace API Key' : 'Set API Key'}
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4a6070]" />
                  <Input
                    type={bmKeyVisible ? 'text' : 'password'}
                    value={bmKeyInput}
                    onChange={(e) => {
                      setBmKeyInput(e.target.value);
                      setBmKeyDirty(true);
                    }}
                    placeholder="Paste your BattleMetrics API key..."
                    className="h-9 border-zinc-800 bg-[#050a0e]/60 pl-9 pr-9 font-mono text-xs text-white placeholder:text-[#4a6070]"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setBmKeyVisible((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a6070] hover:text-[#8a9aa8]"
                  >
                    {bmKeyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  disabled={saving || !bmKeyDirty || !bmKeyInput.trim()}
                  onClick={handleSave}
                  className="h-9 bg-[rgba(201,162,39,0.15)] text-xs text-[#e8c547] hover:bg-[rgba(201,162,39,0.25)]"
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Test connection */}
          <div className="flex items-center gap-3 border-t border-zinc-800 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={handleTestBattleMetrics}
              className="h-8 border-zinc-800 text-xs text-[#8a9aa8]"
            >
              {testing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Connection
            </Button>

            {testResult && (
              <div className="flex items-center gap-2 text-xs">
                {testResult.success ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-green-400">{testResult.message}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-red-400">{testResult.message}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Info card ────────────────────────────────────────────────────── */}
      <Card className="border-zinc-800 bg-[#0c1117]">
        <CardContent className="p-4">
          <p className="text-xs leading-relaxed text-[#4a6070]">
            <strong className="text-[#8a9aa8]">Note:</strong> API keys are stored
            encrypted in the database and never exposed in full to the browser.
            Changes take effect immediately for all server management features —
            no restart is required. You can also set <code className="rounded bg-zinc-800 px-1 text-[10px]">BATTLEMETRICS_API_KEY</code> as
            an environment variable as a fallback; the value configured here takes priority.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default IntegrationsModule;
