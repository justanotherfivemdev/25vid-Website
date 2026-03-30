/**
 * OrbatPanel.jsx
 *
 * Integrated ORBAT (Order of Battle) panel for the unified Operations Planner.
 * Allows creating hierarchical unit structures and placing them directly
 * on the tactical map as NATO military symbols.
 *
 * Adapted from the standalone OrbatMapper.jsx for sidebar panel use.
 */

import React, { useState, useCallback, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Plus, Trash2, ChevronDown, ChevronUp, Copy, Download, Upload,
  Network, Send, GripVertical, Users,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const UNIT_ECHELONS = [
  { value: 'team', label: 'Team', size: '4' },
  { value: 'squad', label: 'Squad', size: '9-13' },
  { value: 'platoon', label: 'Platoon', size: '16-44' },
  { value: 'company', label: 'Company', size: '60-200' },
  { value: 'battalion', label: 'Battalion', size: '300-1000' },
  { value: 'regiment', label: 'Regiment', size: '1000-3000' },
  { value: 'brigade', label: 'Brigade', size: '3000-5000' },
  { value: 'division', label: 'Division', size: '10000+' },
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
  { value: 'recon', label: 'Recon' },
  { value: 'hq', label: 'HQ' },
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

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function getChildEchelon(parentEchelon) {
  const order = ['division', 'brigade', 'regiment', 'battalion', 'company', 'platoon', 'squad', 'team'];
  const idx = order.indexOf(parentEchelon);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : 'team';
}

function countNodes(nodes) {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children || []), 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MINI UNIT NODE (compact for sidebar)
   ═══════════════════════════════════════════════════════════════════════════ */

const MiniUnitNode = ({ unit, depth, onUpdate, onRemove, onAddChild, onDuplicate }) => {
  const [collapsed, setCollapsed] = useState(depth > 1);
  const colorClass = ECHELON_COLORS[unit.echelon] || 'border-gray-700 bg-gray-900/40';
  const textColor = ECHELON_TEXT_COLORS[unit.echelon] || 'text-gray-400';
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
      ...node, id: uid(), designation: `${node.designation} (Copy)`,
      children: (node.children || []).map(deepClone),
    });
    const dupe = deepClone(child);
    onUpdate(unit.id, { ...unit, children: [...unit.children, dupe] });
  }, [unit, onUpdate]);

  return (
    <div style={{ marginLeft: depth > 0 ? `${Math.min(depth * 0.75, 3)}rem` : 0 }}>
      <div className={`border rounded p-1.5 ${colorClass} transition-all mb-0.5`}>
        <div className="flex items-center gap-1">
          <GripVertical className="w-3 h-3 text-gray-600 shrink-0" />
          <Badge className={`${textColor} bg-transparent border border-current text-[8px] px-1 py-0`}>
            {unit.echelon?.slice(0, 3).toUpperCase()}
          </Badge>
          <Input
            value={unit.designation}
            onChange={(e) => handleFieldChange('designation', e.target.value)}
            placeholder="Name…"
            className="bg-transparent border-0 h-5 text-[10px] p-0 px-1 flex-1 min-w-0 focus-visible:ring-0"
          />
          <div className="flex items-center shrink-0">
            {hasChildren && (
              <button onClick={() => setCollapsed(!collapsed)} className="p-0.5 hover:bg-white/10 rounded">
                {collapsed ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronUp className="w-3 h-3 text-gray-500" />}
              </button>
            )}
            <button
              onClick={() => onAddChild(unit.id, { id: uid(), designation: '', echelon: getChildEchelon(unit.echelon), branch: unit.branch, callsign: '', commander: '', personnel: '', notes: '', children: [] })}
              className="p-0.5 hover:bg-white/10 rounded text-green-400"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button onClick={() => onDuplicate(unit.id)} className="p-0.5 hover:bg-white/10 rounded text-blue-400">
              <Copy className="w-3 h-3" />
            </button>
            <button onClick={() => onRemove(unit.id)} className="p-0.5 hover:bg-white/10 rounded text-red-400">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Compact detail fields */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="text-[8px] text-gray-600 hover:text-gray-400 mt-0.5 flex items-center gap-0.5">
              <ChevronDown className="w-2.5 h-2.5" />Details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <Select value={unit.echelon} onValueChange={(v) => handleFieldChange('echelon', v)}>
                <SelectTrigger className="bg-black/40 border-gray-700 h-6 text-[9px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {UNIT_ECHELONS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={unit.branch} onValueChange={(v) => handleFieldChange('branch', v)}>
                <SelectTrigger className="bg-black/40 border-gray-700 h-6 text-[9px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {BRANCH_TYPES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={unit.callsign} onChange={(e) => handleFieldChange('callsign', e.target.value)} placeholder="Callsign" className="bg-black/40 border-gray-700 h-6 text-[9px]" />
              <Input value={unit.commander} onChange={(e) => handleFieldChange('commander', e.target.value)} placeholder="CDR" className="bg-black/40 border-gray-700 h-6 text-[9px]" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {!collapsed && hasChildren && (
        <div className="border-l border-gray-800 ml-2">
          {unit.children.map(child => (
            <MiniUnitNode
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
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function OrbatPanel({
  /** Callback to add flattened ORBAT units onto the map */
  onPlaceUnitsOnMap,
}) {
  const [orbatUnits, setOrbatUnits] = useState([]);

  const addRootUnit = () => {
    setOrbatUnits(prev => [...prev, {
      id: uid(), designation: '', echelon: 'company', branch: 'infantry',
      callsign: '', commander: '', personnel: '', notes: '', children: [],
    }]);
  };

  const handleRootUpdate = useCallback((id, updated) => {
    setOrbatUnits(prev => prev.map(u => u.id === id ? updated : u));
  }, []);

  const handleRootRemove = useCallback((id) => {
    setOrbatUnits(prev => prev.filter(u => u.id !== id));
  }, []);

  const handleRootAddChild = useCallback((parentId, newChild) => {
    const addToTree = (nodes) =>
      nodes.map(n => {
        if (n.id === parentId) return { ...n, children: [...(n.children || []), newChild] };
        if (n.children) return { ...n, children: addToTree(n.children) };
        return n;
      });
    setOrbatUnits(prev => addToTree(prev));
  }, []);

  const handleRootDuplicate = useCallback((id) => {
    setOrbatUnits(prev => {
      const original = prev.find(u => u.id === id);
      if (!original) return prev;
      const deepClone = (node) => ({
        ...node, id: uid(), designation: `${node.designation} (Copy)`,
        children: (node.children || []).map(deepClone),
      });
      return [...prev, deepClone(original)];
    });
  }, []);

  const handlePlaceOnMap = () => {
    if (orbatUnits.length === 0) return;

    const flattenUnits = (nodes, depth = 0) => {
      const result = [];
      nodes.forEach((node, i) => {
        const sidc = BRANCH_TO_SIDC[node.branch]?.friendly || BRANCH_TO_SIDC.infantry.friendly;
        const spread = 0.08;
        result.push({
          id: uid(),
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

    if (onPlaceUnitsOnMap) {
      onPlaceUnitsOnMap(flattenUnits(orbatUnits));
    }
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify({ title: 'ORBAT Export', units: orbatUnits }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orbat-export.json';
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
          if (data.units) setOrbatUnits(data.units);
        } catch {
          /* ignore invalid data */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const totalUnits = useMemo(() => countNodes(orbatUnits), [orbatUnits]);

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Header info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-[#C9A227]" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
              ORBAT Builder
            </span>
          </div>
          <Badge className="bg-gray-800 text-gray-400 text-[9px]">
            <Users className="w-3 h-3 mr-0.5" />{totalUnits}
          </Badge>
        </div>

        {/* Quick-add */}
        <Button onClick={addRootUnit} size="sm" className="w-full bg-[#C9A227] text-black hover:bg-[#b8931f] h-7 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Root Unit
        </Button>

        {/* Unit tree */}
        {orbatUnits.length === 0 ? (
          <div className="text-center py-4">
            <Network className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-[10px] text-gray-600">
              Build your Order of Battle hierarchy, then place units on the map.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {orbatUnits.map(unit => (
              <MiniUnitNode
                key={unit.id}
                unit={unit}
                depth={0}
                onUpdate={handleRootUpdate}
                onRemove={handleRootRemove}
                onAddChild={handleRootAddChild}
                onDuplicate={handleRootDuplicate}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        {orbatUnits.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-gray-800">
            <Button
              onClick={handlePlaceOnMap}
              size="sm"
              className="w-full bg-green-700 hover:bg-green-600 text-white h-7 text-xs"
            >
              <Send className="w-3 h-3 mr-1" /> Place on Map
            </Button>
            <div className="flex gap-1.5">
              <Button onClick={handleExportJSON} size="sm" variant="outline" className="flex-1 border-gray-700 text-[10px] h-6">
                <Download className="w-3 h-3 mr-0.5" /> JSON
              </Button>
              <Button onClick={handleImportJSON} size="sm" variant="outline" className="flex-1 border-gray-700 text-[10px] h-6">
                <Upload className="w-3 h-3 mr-0.5" /> Import
              </Button>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
