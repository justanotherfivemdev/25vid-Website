import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Loader2, Plus, Trash2, Map, Puzzle, PenLine } from 'lucide-react';
import { API } from '@/utils/api';

/**
 * ScenarioSelector – replaces the plain scenarioId text input.
 *
 * Shows a dropdown with three groups:
 *   1. Vanilla (built-in Arma Reforger scenarios)
 *   2. Mod (scenarios detected from enabled mods)
 *   3. Custom (user-added manual entries)
 *
 * Also provides a manual input area to add custom scenario IDs.
 * Custom scenarios can be removed from the list.
 */
export default function ScenarioSelector({ value, onChange, serverId }) {
  const [scenarios, setScenarios] = useState({ vanilla: [], mod: [], custom: [] });
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const fetchScenarios = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/scenarios`);
      setScenarios({
        vanilla: res.data?.vanilla || [],
        mod: res.data?.mod || [],
        custom: res.data?.custom || [],
      });
    } catch {
      // Keep current state on failure
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  const allScenarios = [
    ...scenarios.vanilla,
    ...scenarios.mod,
    ...scenarios.custom,
  ];

  const selectedLabel = (() => {
    const match = allScenarios.find((s) => s.id === value);
    if (match) {
      if (match.source === 'vanilla') return `${match.name} (${match.map || 'Vanilla'})`;
      if (match.source === 'mod') return `${match.mod_name || 'Mod'} – ${match.name}`;
      return match.name;
    }
    return value || 'Select a scenario…';
  })();

  const handleSelect = (scenarioId) => {
    onChange(scenarioId);
    setDropdownOpen(false);
  };

  const persistCustomScenarios = useCallback(async (updatedCustomIds) => {
    setSavingCustom(true);
    try {
      await axios.put(`${API}/servers/${serverId}/scenarios`, {
        custom_scenarios: updatedCustomIds,
      });
      setScenarios((prev) => ({
        ...prev,
        custom: updatedCustomIds.map((id) => ({ id, name: id, source: 'custom' })),
      }));
    } catch {
      // silent failure – the user will see it wasn't added
    } finally {
      setSavingCustom(false);
    }
  }, [serverId]);

  const addCustomScenario = useCallback(async () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;

    // Avoid duplicates across all categories
    const exists = allScenarios.some((s) => s.id === trimmed);
    if (exists) {
      // Still select it even if it already exists
      onChange(trimmed);
      setManualInput('');
      return;
    }

    const customIds = [...scenarios.custom.map((s) => s.id), trimmed];
    await persistCustomScenarios(customIds);
    onChange(trimmed);
    setManualInput('');
  }, [manualInput, allScenarios, scenarios.custom, onChange, persistCustomScenarios]);

  const removeCustomScenario = useCallback(async (scenarioId) => {
    const customIds = scenarios.custom.map((s) => s.id).filter((id) => id !== scenarioId);
    await persistCustomScenarios(customIds);
    // If the removed scenario was selected, clear the selection
    if (value === scenarioId) {
      onChange('');
    }
  }, [scenarios.custom, value, onChange, persistCustomScenarios]);

  const sourceColor = (source) => {
    if (source === 'vanilla') return 'border-emerald-600/30 text-emerald-300';
    if (source === 'mod') return 'border-blue-600/30 text-blue-300';
    return 'border-amber-500/30 text-amber-300';
  };

  return (
    <div className="space-y-3">
      {/* Dropdown trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-[#050a0e]/60 px-3 py-2 text-left text-sm text-white transition-colors hover:border-zinc-700"
        >
          <span className={`truncate font-mono text-sm ${value ? 'text-white' : 'text-[#4a6070]'}`}>
            {loading ? 'Loading scenarios…' : selectedLabel}
          </span>
          <div className="flex items-center gap-1">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#4a6070]" />}
            <ChevronDown className={`h-4 w-4 text-[#4a6070] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {/* Dropdown panel */}
        {dropdownOpen && (
          <div className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
            {/* Vanilla Scenarios */}
            {scenarios.vanilla.length > 0 && (
              <div>
                <div className="sticky top-0 border-b border-zinc-800 bg-zinc-950 px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                    <Map className="h-3 w-3" /> Vanilla Scenarios
                  </span>
                </div>
                {scenarios.vanilla.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-900 ${value === s.id ? 'bg-zinc-900/80 text-tropic-gold' : 'text-[#d0d8e0]'}`}
                  >
                    <span className="flex-1 truncate">{s.name}</span>
                    <Badge variant="outline" className={`text-[9px] ${sourceColor('vanilla')}`}>{s.map}</Badge>
                  </button>
                ))}
              </div>
            )}

            {/* Mod Scenarios */}
            {scenarios.mod.length > 0 && (
              <div>
                <div className="sticky top-0 border-b border-zinc-800 bg-zinc-950 px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                    <Puzzle className="h-3 w-3" /> Mod Scenarios
                  </span>
                </div>
                {scenarios.mod.map((s, idx) => (
                  <button
                    key={`${s.mod_id}-${s.id}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(s.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-900 ${value === s.id ? 'bg-zinc-900/80 text-tropic-gold' : 'text-[#d0d8e0]'}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.id}</span>
                    <Badge variant="outline" className={`text-[9px] ${sourceColor('mod')}`}>{s.mod_name || s.mod_id}</Badge>
                  </button>
                ))}
              </div>
            )}

            {/* Custom Scenarios */}
            {scenarios.custom.length > 0 && (
              <div>
                <div className="sticky top-0 border-b border-zinc-800 bg-zinc-950 px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                    <PenLine className="h-3 w-3" /> Custom Scenarios
                  </span>
                </div>
                {scenarios.custom.map((s) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelect(s.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-900 ${value === s.id ? 'bg-zinc-900/80 text-tropic-gold' : 'text-[#d0d8e0]'}`}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCustomScenario(s.id); }}
                      className="mr-2 rounded p-1 text-[#4a6070] transition-colors hover:bg-red-900/30 hover:text-red-400"
                      title="Remove custom scenario"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {allScenarios.length === 0 && !loading && (
              <div className="px-3 py-4 text-center text-xs text-[#4a6070]">
                No scenarios available. Add a custom scenario below.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual scenario input */}
      <div className="flex items-center gap-2">
        <Input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustomScenario()}
          placeholder="Paste a custom scenario ID, e.g. {GUID}Missions/MyMission.conf"
          className="h-8 flex-1 border-zinc-800 bg-[#050a0e]/60 font-mono text-xs text-white placeholder:text-[#4a6070]"
        />
        <Button
          size="sm"
          type="button"
          onClick={addCustomScenario}
          disabled={!manualInput.trim() || savingCustom}
          className="h-8 bg-tropic-gold px-3 text-black hover:bg-tropic-gold-light"
        >
          {savingCustom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          Add
        </Button>
      </div>

      {/* Current raw value display */}
      {value && (
        <div className="flex items-center gap-2 rounded border border-zinc-800/50 bg-[#050a0e]/30 px-3 py-1.5">
          <span className="text-[10px] text-[#4a6070]">Active:</span>
          <span className="flex-1 truncate font-mono text-[11px] text-[#8a9aa8]">{value}</span>
        </div>
      )}
    </div>
  );
}
