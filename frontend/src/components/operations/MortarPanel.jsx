/**
 * MortarPanel.jsx
 *
 * Integrated mortar calculator panel for the unified Operations Planner.
 * Context-aware: can accept mortar/target positions from map clicks.
 * Adapted from the standalone MortarCalculator.jsx for sidebar panel use.
 */

import React, { useState, useMemo } from 'react';

import { BALLISTIC_DATA, MILS_PER_REVOLUTION, getAmmoTypes } from '@/utils/ballisticData';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Target, Crosshair, AlertTriangle, Clock, Compass,
  ArrowUp, ArrowDown, Calculator, MapPin,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   CALCULATION HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function interpolate(x, x1, y1, x2, y2) {
  if (x2 === x1) return y1;
  return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
}

function parseGrid(gridStr) {
  const cleaned = gridStr.replace(/\s+/g, '');
  if (cleaned.length === 8) {
    const half = cleaned.length / 2;
    return { easting: parseInt(cleaned.slice(0, half), 10) * 10, northing: parseInt(cleaned.slice(half), 10) * 10 };
  }
  if (cleaned.length === 10) {
    const half = cleaned.length / 2;
    return { easting: parseInt(cleaned.slice(0, half), 10), northing: parseInt(cleaned.slice(half), 10) };
  }
  return null;
}

function calculateTargetCoords(foGrid, foAzimuthDeg, foDist, foElevDiff) {
  const fo = parseGrid(foGrid);
  if (!fo) return null;
  const azRad = foAzimuthDeg * Math.PI / 180;
  const targetE = fo.easting + foDist * Math.sin(azRad);
  const targetN = fo.northing + foDist * Math.cos(azRad);
  const targetElev = foElevDiff;
  return { easting: targetE, northing: targetN, elev: targetElev };
}

function findFiringSolutions(faction, ammo, distance, elevDiff) {
  const factionData = BALLISTIC_DATA[faction];
  if (!factionData) return [];
  const ammoData = factionData[ammo];
  if (!ammoData) return [];

  const solutions = [];

  for (const [chargeStr, chargeData] of Object.entries(ammoData)) {
    const charge = parseInt(chargeStr, 10);
    const ranges = chargeData.ranges;
    const sortedRanges = Object.keys(ranges).map(Number).sort((a, b) => a - b);

    if (distance < sortedRanges[0] || distance > sortedRanges[sortedRanges.length - 1]) continue;

    for (let i = 0; i < sortedRanges.length - 1; i++) {
      if (sortedRanges[i] <= distance && distance <= sortedRanges[i + 1]) {
        const r1 = sortedRanges[i];
        const r2 = sortedRanges[i + 1];
        const d1 = ranges[r1];
        const d2 = ranges[r2];

        const baseElev = interpolate(distance, r1, d1.elev, r2, d2.elev);
        const baseTof = interpolate(distance, r1, d1.tof, r2, d2.tof);
        const baseDelev = interpolate(distance, r1, d1.delev, r2, d2.delev);

        const finalElev = baseElev - (elevDiff / 100) * baseDelev;

        solutions.push({
          charge,
          elevation: Math.round(finalElev),
          tof: Math.round(baseTof * 10) / 10,
          dispersion: chargeData.dispersion,
        });
        break;
      }
    }
  }

  return solutions.sort((a, b) => a.tof - b.tof);
}

function calculateAzimuthMils(mortarCoords, targetCoords, faction) {
  const dE = targetCoords.easting - mortarCoords.easting;
  const dN = targetCoords.northing - mortarCoords.northing;
  let azDeg = Math.atan2(dE, dN) * 180 / Math.PI;
  if (azDeg < 0) azDeg += 360;
  const milsPerRev = MILS_PER_REVOLUTION[faction] || 6400;
  return Math.round(azDeg / 360 * milsPerRev);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function MortarPanel({
  /** If provided, mortar grid is pre-filled from map click context */
  contextMortarGrid = '',
  contextTargetGrid = '',
  isReforgerMap = false,
}) {
  /* ── Input state ──────────────────────────────────────────────────────── */
  const [faction, setFaction] = useState('NATO');
  const [ammo, setAmmo] = useState('M821 HE');
  const [mortarGrid, setMortarGrid] = useState(contextMortarGrid);
  const [mortarElev, setMortarElev] = useState('');
  const [foGrid, setFoGrid] = useState(contextTargetGrid);
  const [foAzimuth, setFoAzimuth] = useState('');
  const [foDistance, setFoDistance] = useState('');
  const [foElevDiff, setFoElevDiff] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const ammoTypes = useMemo(() => getAmmoTypes(faction), [faction]);

  const handleFactionChange = (f) => {
    setFaction(f);
    const types = getAmmoTypes(f);
    setAmmo(types[0] || '');
  };

  /* ── Sync context grids ──────────────────────────────────────────────── */
  React.useEffect(() => {
    if (contextMortarGrid) setMortarGrid(contextMortarGrid);
  }, [contextMortarGrid]);
  React.useEffect(() => {
    if (contextTargetGrid) setFoGrid(contextTargetGrid);
  }, [contextTargetGrid]);

  /* ── Calculate ───────────────────────────────────────────────────────── */
  const handleCalculate = () => {
    setError('');
    setResults(null);

    const mortar = parseGrid(mortarGrid);
    if (!mortar) {
      setError('Invalid mortar grid. Use 8 or 10 digit format.');
      return;
    }

    const mElev = parseFloat(mortarElev);
    if (isNaN(mElev)) {
      setError('Enter a valid mortar elevation (meters).');
      return;
    }

    const foAz = parseFloat(foAzimuth);
    const foDist = parseFloat(foDistance);
    const foElev = parseFloat(foElevDiff);

    if (isNaN(foAz) || isNaN(foDist)) {
      setError('Enter valid FO azimuth (°) and distance (m).');
      return;
    }

    const target = calculateTargetCoords(foGrid, foAz, foDist, isNaN(foElev) ? 0 : foElev);
    if (!target) {
      setError('Invalid FO grid. Use 8 or 10 digit format.');
      return;
    }

    const dist = Math.sqrt(
      Math.pow(target.easting - mortar.easting, 2) +
      Math.pow(target.northing - mortar.northing, 2)
    );

    const elevDiff = (isNaN(foElev) ? 0 : foElev);
    const totalElevDiff = elevDiff + (target.elev || 0) - mElev;

    const azimuthMils = calculateAzimuthMils(mortar, target, faction);

    const solutions = findFiringSolutions(faction, ammo, dist, totalElevDiff);

    if (solutions.length === 0) {
      setError(`No firing solution. Target may be out of range (${Math.round(dist)}m).`);
      return;
    }

    setResults({
      distance: Math.round(dist),
      azimuthMils,
      azimuthDeg: Math.round(azimuthMils / (MILS_PER_REVOLUTION[faction] || 6400) * 360 * 10) / 10,
      elevDiff: Math.round(totalElevDiff),
      targetCoords: target,
      solutions,
    });
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Faction & Ammo */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-[#4a6070] uppercase tracking-wider block mb-1">Faction</label>
            <Select value={faction} onValueChange={handleFactionChange}>
              <SelectTrigger className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                <SelectItem value="NATO">NATO</SelectItem>
                <SelectItem value="RU">Russia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[9px] text-[#4a6070] uppercase tracking-wider block mb-1">Ammo</label>
            <Select value={ammo} onValueChange={setAmmo}>
              <SelectTrigger className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                {ammoTypes.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mortar Position */}
        <div className="border border-blue-900/40 rounded p-2 space-y-2">
          <p className="text-[9px] text-blue-400 uppercase tracking-wider font-bold flex items-center gap-1">
            <Crosshair className="w-3 h-3" />Mortar Position
          </p>
          <Input
            value={mortarGrid}
            onChange={(e) => setMortarGrid(e.target.value)}
            placeholder="Grid (e.g., 12340 56780)"
            className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs font-mono"
            maxLength={12}
          />
          <Input
            type="number"
            value={mortarElev}
            onChange={(e) => setMortarElev(e.target.value)}
            placeholder="Elevation (m ASL)"
            className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs font-mono"
          />
        </div>

        {/* Forward Observer */}
        <div className="border border-green-900/40 rounded p-2 space-y-2">
          <p className="text-[9px] text-green-400 uppercase tracking-wider font-bold flex items-center gap-1">
            <Compass className="w-3 h-3" />Forward Observer
          </p>
          <Input
            value={foGrid}
            onChange={(e) => setFoGrid(e.target.value)}
            placeholder="FO Grid"
            className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs font-mono"
            maxLength={12}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={foAzimuth}
              onChange={(e) => setFoAzimuth(e.target.value)}
              placeholder="Azimuth (°)"
              className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs font-mono"
            />
            <Input
              type="number"
              value={foDistance}
              onChange={(e) => setFoDistance(e.target.value)}
              placeholder="Dist (m)"
              className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs font-mono"
            />
          </div>
          <Input
            type="number"
            value={foElevDiff}
            onChange={(e) => setFoElevDiff(e.target.value)}
            placeholder="Elev Diff (m) — +uphill"
            className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-7 text-xs font-mono"
          />
        </div>

        {isReforgerMap && (
          <p className="text-[9px] text-[#C9A227] flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Tip: Use grid references from the map coordinate display.
          </p>
        )}

        <Button
          className="w-full bg-[#C9A227] text-black hover:bg-[#b8931f] h-8 text-xs font-bold"
          onClick={handleCalculate}
        >
          <Calculator className="w-3.5 h-3.5 mr-1" />
          Calculate
        </Button>

        {error && (
          <div className="flex items-start gap-1.5 text-[10px] text-red-400 bg-red-900/20 border border-red-800/40 rounded p-2">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-2">
            <div className="border border-red-900/40 rounded p-2">
              <p className="text-[9px] text-red-400 uppercase tracking-wider font-bold flex items-center gap-1 mb-1">
                <Target className="w-3 h-3" />Target Details
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[9px] text-[#4a6070]">Distance</span>
                  <p className="font-bold font-mono text-white">{results.distance}m</p>
                </div>
                <div>
                  <span className="text-[9px] text-[#4a6070]">Elev Diff</span>
                  <p className={`font-bold font-mono ${results.elevDiff >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                    {results.elevDiff >= 0 ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                    {Math.abs(results.elevDiff)}m
                  </p>
                </div>
              </div>
              <div className="mt-1">
                <span className="text-[9px] text-[#4a6070]">Azimuth</span>
                <p className="text-base font-bold font-mono text-[#C9A227]">
                  {results.azimuthMils} MIL
                  <span className="text-[10px] text-[#4a6070] ml-1">({results.azimuthDeg}°)</span>
                </p>
              </div>
            </div>

            {/* Firing Solutions */}
            <div className="space-y-1.5">
              <p className="text-[9px] text-[#C9A227] uppercase tracking-wider font-bold">
                Firing Solutions
              </p>
              {results.solutions.map((sol, i) => (
                <div
                  key={sol.charge}
                  className={`rounded border p-2 text-xs ${
                    i === 0
                      ? 'border-green-700/50 bg-green-900/10'
                      : 'border-[rgba(201,162,39,0.075)] bg-[#111a24]/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge className={`text-[9px] ${i === 0 ? 'bg-green-900/40 text-green-400 border-green-700' : 'bg-[#111a24] text-[#8a9aa8] border-[rgba(201,162,39,0.15)]'}`}>
                      CHG {sol.charge} {i === 0 && '★'}
                    </Badge>
                    <span className="text-[9px] text-[#4a6070]">±{sol.dispersion}m</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-[#4a6070]">Elevation</span>
                      <p className="font-bold font-mono text-white">{sol.elevation} MIL</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#4a6070]">ToF</span>
                      <p className="font-bold font-mono text-yellow-400">
                        <Clock className="w-3 h-3 inline mr-0.5" />{sol.tof}s
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!results && !error && (
          <div className="text-center py-4">
            <Target className="w-8 h-8 text-[#4a6070] mx-auto mb-2" />
            <p className="text-[10px] text-[#4a6070]">
              Enter positions and click Calculate for firing solutions.
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
