/**
 * OrbatMapper.jsx
 *
 * Standalone ORBAT (Order of Battle) hierarchy creator.
 * Allows staff to build and visualise unit organisation charts
 * independently of the Operations creation flow.  Can optionally
 * link to an existing operation or be used "on-the-fly" for
 * ad-hoc planning.  Created ORBATs can be exported into the
 * Operations Planner as placed unit symbols.
 *
 * Persists ORBAT data to localStorage for quick ad-hoc use.
 * When linked to an operation, the ORBAT context is associated with
 * that operation but persistence is still handled client-side here.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

import { API } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  ChevronLeft, Plus, Trash2, ChevronDown, ChevronUp,
  Users, Copy, Download, Upload, Save, GripVertical,
  Network, Send,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const UNIT_ECHELONS = [
  { value: 'team', label: 'Team / Fire Team', size: '4' },
  { value: 'squad', label: 'Squad', size: '9-13' },
  { value: 'platoon', label: 'Platoon', size: '16-44' },
  { value: 'company', label: 'Company', size: '60-200' },
  { value: 'battalion', label: 'Battalion', size: '300-1000' },
  { value: 'regiment', label: 'Regiment / Group', size: '1000-3000' },
  { value: 'brigade', label: 'Brigade', size: '3000-5000' },
  { value: 'division', label: 'Division', size: '10000-15000' },
];

const BRANCH_TYPES = [
  { value: 'infantry', label: 'Infantry' },
  { value: 'armor', label: 'Armor' },
  { value: 'artillery', label: 'Artillery' },
  { value: 'aviation', label: 'Aviation' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'signal', label: 'Signal' },
  { value: 'medical', label: 'Medical' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'recon', label: 'Recon / Scout' },
  { value: 'hq', label: 'Headquarters' },
  { value: 'other', label: 'Other' },
];

const ECHELON_COLORS = {
  division: 'border-purple-500/60 bg-purple-900/20',
  brigade: 'border-blue-500/60 bg-blue-900/20',
  regiment: 'border-cyan-500/60 bg-cyan-900/20',
  battalion: 'border-teal-500/60 bg-teal-900/20',
  company: 'border-green-500/60 bg-green-900/20',
  platoon: 'border-yellow-500/60 bg-yellow-900/20',
  squad: 'border-orange-500/60 bg-orange-900/20',
  team: 'border-red-500/60 bg-red-900/20',
};

const ECHELON_TEXT_COLORS = {
  division: 'text-purple-400',
  brigade: 'text-blue-400',
  regiment: 'text-cyan-400',
  battalion: 'text-teal-400',
  company: 'text-green-400',
  platoon: 'text-yellow-400',
  squad: 'text-orange-400',
  team: 'text-red-400',
};

const ECHELON_DOT_COLORS = {
  division: 'bg-purple-500',
  brigade: 'bg-blue-500',
  regiment: 'bg-cyan-500',
  battalion: 'bg-teal-500',
  company: 'bg-green-500',
  platoon: 'bg-yellow-500',
  squad: 'bg-orange-500',
  team: 'bg-red-500',
};

const LOCAL_STORAGE_KEY = 'orbat_mapper_data';
const ORBAT_EXPORT_KEY = 'orbat_export_to_planner';

let _uidCounter = 0;
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${++_uidCounter}-${Math.random().toString(36).slice(2)}`;

/* ═══════════════════════════════════════════════════════════════════════════
   UNIT NODE COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const OrbatUnitNode = ({ unit, depth, onUpdate, onRemove, onAddChild, onDuplicate }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(!unit.designation);
  const echelonCfg = UNIT_ECHELONS.find(e => e.value === unit.echelon);
  const colorClass = ECHELON_COLORS[unit.echelon] || 'border-[rgba(201,162,39,0.15)] bg-[#0c1117]/40';
  const textColor = ECHELON_TEXT_COLORS[unit.echelon] || 'text-[#8a9aa8]';
  const hasChildren = unit.children && unit.children.length > 0;

  const handleFieldChange = (field, value) => {
    onUpdate(unit.id, { ...unit, [field]: value });
  };

  const handleChildUpdate = useCallback((childId, updated) => {
    const newChildren = unit.children.map(c => c.id === childId ? updated : c);
    onUpdate(unit.id, { ...unit, children: newChildren });
  }, [unit, onUpdate]);

  const handleChildRemove = useCallback((childId) => {
    const newChildren = unit.children.filter(c => c.id !== childId);
    onUpdate(unit.id, { ...unit, children: newChildren });
  }, [unit, onUpdate]);

  const handleChildAddChild = useCallback((parentId, newChild) => {
    const addToTree = (nodes) =>
      nodes.map(n => {
        if (n.id === parentId) return { ...n, children: [...(n.children || []), newChild] };
        if (n.children) return { ...n, children: addToTree(n.children) };
        return n;
      });
    const newChildren = addToTree(unit.children);
    onUpdate(unit.id, { ...unit, children: newChildren });
  }, [unit, onUpdate]);

  const handleChildDuplicate = useCallback((childId) => {
    const child = unit.children.find(c => c.id === childId);
    if (!child) return;
    const deepClone = (node) => ({
      ...node,
      id: uid(),
      designation: `${node.designation} (Copy)`,
      children: (node.children || []).map(deepClone),
    });
    const dupe = deepClone(child);
    const newChildren = [...unit.children, dupe];
    onUpdate(unit.id, { ...unit, children: newChildren });
  }, [unit, onUpdate]);

  return (
    <div style={{ marginLeft: depth > 0 ? `${depth * 1.25}rem` : 0 }}>
      <div className={`border rounded-lg p-3 ${colorClass} transition-all`}>
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <GripVertical className="w-4 h-4 text-[#4a6070] shrink-0 cursor-grab" />
          <Badge className={`${textColor} bg-transparent border border-current text-[10px] uppercase tracking-wider`}>
            {echelonCfg?.label || unit.echelon}
          </Badge>

          {editing ? (
            <Input
              autoFocus
              value={unit.designation}
              onChange={(e) => handleFieldChange('designation', e.target.value)}
              onBlur={() => { if (unit.designation) setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && unit.designation) setEditing(false); }}
              placeholder="Unit designation…"
              className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-sm flex-1 min-w-[120px]"
            />
          ) : (
            <button
              className="text-sm font-bold text-white hover:text-[#C9A227] transition truncate flex-1 text-left"
              onClick={() => setEditing(true)}
              title="Click to edit"
            >
              {unit.designation || 'Unnamed Unit'}
            </button>
          )}

          <div className="flex items-center gap-1 ml-auto shrink-0">
            {hasChildren && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="p-1 rounded hover:bg-white/10 transition text-[#8a9aa8]"
                title={collapsed ? 'Expand sub-units' : 'Collapse sub-units'}
              >
                {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => onAddChild(unit.id, { id: uid(), designation: '', echelon: getChildEchelon(unit.echelon), branch: unit.branch, callsign: '', commander: '', personnel: '', notes: '', children: [] })}
              className="p-1 rounded hover:bg-white/10 transition text-green-400"
              title="Add sub-unit"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDuplicate(unit.id)}
              className="p-1 rounded hover:bg-white/10 transition text-blue-400"
              title="Duplicate unit"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={() => onRemove(unit.id)}
              className="p-1 rounded hover:bg-white/10 transition text-red-400"
              title="Remove unit"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Detail fields — compact inline row */}
        <Collapsible defaultOpen={!unit.designation}>
          <CollapsibleTrigger asChild>
            <button className="text-[10px] text-[#4a6070] hover:text-[#8a9aa8] mt-1.5 flex items-center gap-1 transition">
              <ChevronDown className="w-3 h-3" />Details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
              <div>
                <label className="text-[9px] text-[#4a6070] uppercase tracking-wider">Echelon</label>
                <Select value={unit.echelon} onValueChange={(v) => handleFieldChange('echelon', v)}>
                  <SelectTrigger className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                    {UNIT_ECHELONS.map(e => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[9px] text-[#4a6070] uppercase tracking-wider">Branch</label>
                <Select value={unit.branch} onValueChange={(v) => handleFieldChange('branch', v)}>
                  <SelectTrigger className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                    {BRANCH_TYPES.map(b => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[9px] text-[#4a6070] uppercase tracking-wider">Callsign</label>
                <Input value={unit.callsign} onChange={(e) => handleFieldChange('callsign', e.target.value)} placeholder="e.g., Warhorse 6" className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs" />
              </div>
              <div>
                <label className="text-[9px] text-[#4a6070] uppercase tracking-wider">Commander</label>
                <Input value={unit.commander} onChange={(e) => handleFieldChange('commander', e.target.value)} placeholder="e.g., CPT Smith" className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs" />
              </div>
              <div>
                <label className="text-[9px] text-[#4a6070] uppercase tracking-wider">Personnel</label>
                <Input value={unit.personnel} onChange={(e) => handleFieldChange('personnel', e.target.value)} placeholder="Strength count" className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs" />
              </div>
              <div className="col-span-2 sm:col-span-1 lg:col-span-3">
                <label className="text-[9px] text-[#4a6070] uppercase tracking-wider">Notes</label>
                <Input value={unit.notes} onChange={(e) => handleFieldChange('notes', e.target.value)} placeholder="Additional notes…" className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Children */}
      {!collapsed && hasChildren && (
        <div className="mt-1 space-y-1 border-l-2 border-[rgba(201,162,39,0.12)] ml-3">
          {unit.children.map(child => (
            <OrbatUnitNode
              key={child.id}
              unit={child}
              depth={depth + 1}
              onUpdate={handleChildUpdate}
              onRemove={handleChildRemove}
              onAddChild={handleChildAddChild}
              onDuplicate={handleChildDuplicate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Given a parent echelon, return a sensible default for a new child. */
function getChildEchelon(parentEchelon) {
  const order = ['division', 'brigade', 'regiment', 'battalion', 'company', 'platoon', 'squad', 'team'];
  const idx = order.indexOf(parentEchelon);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : 'team';
}

/** Count every node in the tree. */
function countNodes(nodes) {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children || []), 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function OrbatMapper() {
  const { operationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = hasPermission(user?.role, PERMISSIONS.MANAGE_PLANS) || hasPermission(user?.role, PERMISSIONS.MANAGE_OPERATIONS);

  /* ── State ──────────────────────────────────────────────────────────── */
  const [orbatTitle, setOrbatTitle] = useState('');
  const [units, setUnits] = useState([]);
  const [operation, setOperation] = useState(null);
  const [operations, setOperations] = useState([]);
  const [linkedOperationId, setLinkedOperationId] = useState(operationId || 'none');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialLoadRef = useRef(true);

  /* ── Load linked operation (if any) ────────────────────────────────── */
  useEffect(() => {
    if (operationId) {
      axios.get(`${API}/operations/${operationId}`).then(r => {
        setOperation(r.data);
        setOrbatTitle(r.data.title ? `ORBAT – ${r.data.title}` : '');
      }).catch(() => {});
    }
  }, [operationId]);

  /* ── Load available operations for linking ─────────────────────────── */
  useEffect(() => {
    axios.get(`${API}/operations`).then(r => setOperations(r.data || [])).catch(() => {});
  }, []);

  /* ── Restore from localStorage on mount (ad-hoc mode) ──────────────── */
  useEffect(() => {
    if (operationId) return; // linked mode uses server data
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setUnits(parsed.units || []);
        setOrbatTitle(parsed.title || '');
        setLinkedOperationId(parsed.linkedOperationId || 'none');
      }
    } catch { /* ignore corrupt data */ }
  }, [operationId]);

  /* ── Mark dirty on change (skip initial mount) ─────────────────────── */
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    setDirty(true);
    setSaved(false);
  }, [units, orbatTitle, linkedOperationId]);

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const addRootUnit = () => {
    setUnits(prev => [...prev, {
      id: uid(),
      designation: '',
      echelon: 'company',
      branch: 'infantry',
      callsign: '',
      commander: '',
      personnel: '',
      notes: '',
      children: [],
    }]);
  };

  const handleRootUpdate = useCallback((id, updated) => {
    setUnits(prev => prev.map(u => u.id === id ? updated : u));
  }, []);

  const handleRootRemove = useCallback((id) => {
    if (!window.confirm('Remove this unit and all its sub-units?')) return;
    setUnits(prev => prev.filter(u => u.id !== id));
  }, []);

  const handleRootAddChild = useCallback((parentId, newChild) => {
    const addToTree = (nodes) =>
      nodes.map(n => {
        if (n.id === parentId) return { ...n, children: [...(n.children || []), newChild] };
        if (n.children) return { ...n, children: addToTree(n.children) };
        return n;
      });
    setUnits(prev => addToTree(prev));
  }, []);

  const handleRootDuplicate = useCallback((id) => {
    setUnits(prev => {
      const original = prev.find(u => u.id === id);
      if (!original) return prev;
      const deepClone = (node) => ({
        ...node,
        id: uid(),
        designation: `${node.designation} (Copy)`,
        children: (node.children || []).map(deepClone),
      });
      return [...prev, deepClone(original)];
    });
  }, []);

  const handleSave = () => {
    const payload = { title: orbatTitle, units, linkedOperationId };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    setSaved(true);
    setDirty(false);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify({ title: orbatTitle, units, linkedOperationId }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbat-${(orbatTitle || 'unnamed').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (data.units) {
            setUnits(data.units);
            setOrbatTitle(data.title || '');
            if (data.linkedOperationId) setLinkedOperationId(data.linkedOperationId);
          }
        } catch {
          alert('Invalid ORBAT JSON file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClear = () => {
    if (!window.confirm('Clear all units? This cannot be undone.')) return;
    setUnits([]);
    setOrbatTitle('');
    setLinkedOperationId('none');
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  /**
   * Export the ORBAT tree to the Operations Planner.
   * Flattens all units into planner-compatible format with NATO SIDC codes
   * and navigates to the Operations Planner for placement.
   */
  const handleExportToPlanner = () => {
    if (units.length === 0) {
      alert('No units to export. Add units first.');
      return;
    }

    const BRANCH_TO_SIDC = {
      infantry:   { friendly: '10031000001211000000', hostile: '10061000001211000000' },
      armor:      { friendly: '10031000001205000000', hostile: '10061000001205000000' },
      artillery:  { friendly: '10031000001206000000', hostile: '10061000001206000000' },
      aviation:   { friendly: '10031000001210000000', hostile: '10061000001210000000' },
      engineer:   { friendly: '10031000001207000000', hostile: '10061000001207000000' },
      signal:     { friendly: '10031000001209000000', hostile: '10061000001209000000' },
      medical:    { friendly: '10031000001213000000', hostile: '10061000001213000000' },
      logistics:  { friendly: '10031000001216000000', hostile: '10061000001216000000' },
      recon:      { friendly: '10031000001220000000', hostile: '10061000001220000000' },
      hq:         { friendly: '10031000001200000000', hostile: '10061000001200000000' },
      other:      { friendly: '10031000001211000000', hostile: '10061000001211000000' },
    };

    const flattenUnits = (nodes, depth = 0) => {
      const result = [];
      nodes.forEach((node, i) => {
        const sidc = BRANCH_TO_SIDC[node.branch]?.friendly || BRANCH_TO_SIDC.infantry.friendly;
        const spread = 0.08;
        result.push({
          id: crypto.randomUUID(),
          symbol_code: sidc,
          name: node.designation || `${node.echelon} ${i + 1}`,
          affiliation: 'friendly',
          x: 0.3 + (depth * spread),
          y: 0.2 + (result.length * 0.05),
          rotation: 0,
          scale: 1,
          z_index: result.length,
          notes: [node.callsign && `Callsign: ${node.callsign}`, node.commander && `CDR: ${node.commander}`, node.personnel && `PAX: ${node.personnel}`, node.notes].filter(Boolean).join(' | '),
          geo_lat: '',
          geo_lng: '',
          location_name: '',
        });
        if (node.children?.length) {
          result.push(...flattenUnits(node.children, depth + 1));
        }
      });
      return result;
    };

    const exportData = {
      title: orbatTitle || 'Imported ORBAT',
      units: flattenUnits(units),
      exportedAt: new Date().toISOString(),
    };

    localStorage.setItem(ORBAT_EXPORT_KEY, JSON.stringify(exportData));
    navigate('/hub/operations-planner');
  };

  const totalUnits = useMemo(() => countNodes(units), [units]);

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#060a14] text-white flex flex-col">
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-[rgba(201,162,39,0.12)] bg-[#0c1322] px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link to="/hub" className="text-[#8a9aa8] hover:text-white transition">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Network className="w-5 h-5 text-[#C9A227]" />
        <h1 className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          ORBAT CREATOR
        </h1>

        {operation && (
          <Badge className="bg-[#C9A227]/20 text-[#C9A227] border border-[#C9A227]/40 text-[10px]">
            Linked: {operation.title}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Badge className="bg-[#111a24] text-[#8a9aa8] text-[10px]">
            <Users className="w-3 h-3 mr-1 inline" />{totalUnits} unit{totalUnits !== 1 ? 's' : ''}
          </Badge>
          {dirty && !saved && (
            <Badge className="bg-yellow-900/40 text-yellow-400 border border-yellow-700/40 text-[10px]">Unsaved</Badge>
          )}
          {saved && (
            <Badge className="bg-green-900/40 text-green-400 border border-green-700/40 text-[10px]">Saved</Badge>
          )}
        </div>
      </header>

      {/* ── Main Layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="w-72 border-r border-[rgba(201,162,39,0.12)] bg-[#0c1322] shrink-0 hidden md:flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Title */}
              <div>
                <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">ORBAT Title</label>
                <Input
                  value={orbatTitle}
                  onChange={(e) => setOrbatTitle(e.target.value)}
                  placeholder="e.g., TF Warhorse ORBAT"
                  className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-sm"
                  disabled={!canEdit}
                />
              </div>

              {/* Link to Operation */}
              <div>
                <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">Link to Operation (optional)</label>
                <Select value={linkedOperationId} onValueChange={(v) => setLinkedOperationId(v)} disabled={!canEdit}>
                  <SelectTrigger className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-sm h-8">
                    <SelectValue placeholder="None — Ad-hoc ORBAT" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] max-h-60">
                    <SelectItem value="none">None — Ad-hoc</SelectItem>
                    {operations.map(op => (
                      <SelectItem key={op.id} value={op.id}>{op.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quick-add root unit */}
              {canEdit && (
                <div>
                  <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-2">Add Root Unit</label>
                  <Button onClick={addRootUnit} size="sm" className="w-full bg-[#C9A227] text-black hover:bg-[#b8931f]">
                    <Plus className="w-4 h-4 mr-1" /> Add Unit
                  </Button>
                </div>
              )}

              {/* Echelon legend */}
              <div>
                <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-2">Echelon Legend</label>
                <div className="space-y-1">
                  {UNIT_ECHELONS.map(e => (
                    <div key={e.value} className="flex items-center gap-2 text-[11px]">
                      <span className={`w-2 h-2 rounded-full ${ECHELON_DOT_COLORS[e.value] || 'bg-[#4a6070]'}`} />
                      <span className={ECHELON_TEXT_COLORS[e.value]}>{e.label}</span>
                      <span className="text-[#4a6070] ml-auto">{e.size}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2 border-t border-[rgba(201,162,39,0.12)]">
                <Button onClick={handleSave} size="sm" variant="outline" className="w-full border-[rgba(201,162,39,0.15)] text-xs" disabled={!canEdit}>
                  <Save className="w-3 h-3 mr-1" /> Save Locally
                </Button>
                <Button onClick={handleExportToPlanner} size="sm" className="w-full bg-[#C9A227] text-black hover:bg-[#b8931f] text-xs" disabled={units.length === 0}>
                  <Send className="w-3 h-3 mr-1" /> Export to Operations Planner
                </Button>
                <Button onClick={handleExportJSON} size="sm" variant="outline" className="w-full border-[rgba(201,162,39,0.15)] text-xs">
                  <Download className="w-3 h-3 mr-1" /> Export JSON
                </Button>
                <Button onClick={handleImportJSON} size="sm" variant="outline" className="w-full border-[rgba(201,162,39,0.15)] text-xs" disabled={!canEdit}>
                  <Upload className="w-3 h-3 mr-1" /> Import JSON
                </Button>
                <Button onClick={handleClear} size="sm" variant="outline" className="w-full border-red-900/60 text-red-400 text-xs hover:bg-red-900/20" disabled={!canEdit}>
                  <Trash2 className="w-3 h-3 mr-1" /> Clear All
                </Button>
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* ── Main Canvas ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {/* Mobile action bar (visible below md breakpoint) */}
          <div className="md:hidden flex items-center gap-2 p-3 border-b border-[rgba(201,162,39,0.12)] bg-[#0c1322] flex-wrap">
            {canEdit && (
              <Button onClick={addRootUnit} size="sm" className="bg-[#C9A227] text-black text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Unit
              </Button>
            )}
            <Button onClick={handleSave} size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-xs" disabled={!canEdit}>
              <Save className="w-3 h-3 mr-1" /> Save
            </Button>
            <Button onClick={handleExportJSON} size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-xs">
              <Download className="w-3 h-3" />
            </Button>
            {canEdit && (
              <Button onClick={handleImportJSON} size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-xs">
                <Upload className="w-3 h-3" />
              </Button>
            )}
          </div>

          <div className="p-4 space-y-2">
            {units.length === 0 ? (
              <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                <CardContent className="py-16 text-center space-y-4">
                  <Network className="w-16 h-16 text-[#4a6070] mx-auto" />
                  <div>
                    <p className="text-lg text-[#8a9aa8] font-semibold">No units in ORBAT</p>
                    <p className="text-sm text-[#4a6070] mt-1">
                      {canEdit
                        ? <>Click <strong>"Add Unit"</strong> to begin building your Order of Battle.</>
                        : 'No units have been added yet.'}
                    </p>
                    <p className="text-xs text-[#4a6070] mt-3">
                      You can build an ORBAT independently or link it to an existing operation.
                    </p>
                  </div>
                  {canEdit && (
                    <Button onClick={addRootUnit} className="bg-[#C9A227] text-black hover:bg-[#b8931f]">
                      <Plus className="w-4 h-4 mr-2" /> Add First Unit
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              units.map(unit => (
                <OrbatUnitNode
                  key={unit.id}
                  unit={unit}
                  depth={0}
                  onUpdate={handleRootUpdate}
                  onRemove={handleRootRemove}
                  onAddChild={handleRootAddChild}
                  onDuplicate={handleRootDuplicate}
                />
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
