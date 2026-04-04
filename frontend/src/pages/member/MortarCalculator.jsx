/**
 * MortarCalculator.jsx
 *
 * Arma Reforger mortar firing solution calculator.
 * Ported from ArmaReforgerMortarCalculator (MIT License) by arcticfr33d0m.
 *
 * Calculates elevation (MILs), azimuth, and time-of-flight for indirect fire
 * based on mortar position, forward observer data, and target acquisition.
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { BALLISTIC_DATA, MILS_PER_REVOLUTION, getAmmoTypes, getCharges } from '@/utils/ballisticData';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft, Target, Crosshair, AlertTriangle, Clock, Compass,
  ArrowUp, ArrowDown, Calculator,
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
  const targetElev = foElevDiff; // relative elevation difference
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
  // Convert degrees to mils
  const milsPerRev = MILS_PER_REVOLUTION[faction] || 6400;
  return Math.round(azDeg / 360 * milsPerRev);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function MortarCalculator() {
  /* ── Input state ──────────────────────────────────────────────────────── */
  const [faction, setFaction] = useState('NATO');
  const [ammo, setAmmo] = useState('M821 HE');
  const [mortarGrid, setMortarGrid] = useState('');
  const [mortarElev, setMortarElev] = useState('');
  const [foGrid, setFoGrid] = useState('');
  const [foAzimuth, setFoAzimuth] = useState('');
  const [foDistance, setFoDistance] = useState('');
  const [foElevDiff, setFoElevDiff] = useState('');
  const [error, setError] = useState('');

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const ammoTypes = useMemo(() => getAmmoTypes(faction), [faction]);

  // Reset ammo when faction changes
  const handleFactionChange = (f) => {
    setFaction(f);
    const types = getAmmoTypes(f);
    setAmmo(types[0] || '');
  };

  /* ── Calculate ───────────────────────────────────────────────────────── */
  const [results, setResults] = useState(null);

  const handleCalculate = () => {
    setError('');
    setResults(null);

    // Validate mortar grid
    const mortar = parseGrid(mortarGrid);
    if (!mortar) {
      setError('Invalid mortar grid. Use 8 or 10 digit format (e.g., 12340 56780).');
      return;
    }

    const mElev = parseFloat(mortarElev);
    if (isNaN(mElev)) {
      setError('Enter a valid mortar elevation (meters).');
      return;
    }

    // Calculate target from FO data
    const foAz = parseFloat(foAzimuth);
    const foDist = parseFloat(foDistance);
    const foElev = parseFloat(foElevDiff);

    if (isNaN(foAz) || isNaN(foDist)) {
      setError('Enter valid FO azimuth (degrees) and distance (meters).');
      return;
    }

    const target = calculateTargetCoords(foGrid, foAz, foDist, isNaN(foElev) ? 0 : foElev);
    if (!target) {
      setError('Invalid FO grid. Use 8 or 10 digit format.');
      return;
    }

    // Distance from mortar to target
    const dist = Math.sqrt(
      Math.pow(target.easting - mortar.easting, 2) +
      Math.pow(target.northing - mortar.northing, 2)
    );

    // Elevation difference
    const elevDiff = (isNaN(foElev) ? 0 : foElev);
    const totalElevDiff = elevDiff + (target.elev || 0) - mElev;

    // Azimuth from mortar to target
    const azimuthMils = calculateAzimuthMils(mortar, target, faction);

    // Find solutions
    const solutions = findFiringSolutions(faction, ammo, dist, totalElevDiff);

    if (solutions.length === 0) {
      setError(`No valid firing solution found. Target may be out of range (${Math.round(dist)}m).`);
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
    <div className="min-h-screen bg-[#060a14] text-white">
      <header className="border-b border-[rgba(201,162,39,0.12)] bg-[#0c1322] px-4 py-3 flex items-center gap-3">
        <Link to="/hub" className="text-[#8a9aa8] hover:text-white transition">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Target className="w-5 h-5 text-[#C9A227]" />
        <h1 className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          MORTAR CALCULATOR
        </h1>
        <Badge className="bg-[#111a24] text-[#8a9aa8] text-[10px]">Arma Reforger</Badge>
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Input section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Mortar + FO Data */}
          <div className="space-y-4">
            {/* Faction & Ammo */}
            <Card className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#C9A227] uppercase tracking-wider">Ordnance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">Faction</label>
                    <Select value={faction} onValueChange={handleFactionChange}>
                      <SelectTrigger className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        <SelectItem value="NATO">NATO</SelectItem>
                        <SelectItem value="RU">Russia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">Ammunition</label>
                    <Select value={ammo} onValueChange={setAmmo}>
                      <SelectTrigger className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm">
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
              </CardContent>
            </Card>

            {/* Mortar Position */}
            <Card className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-blue-400 uppercase tracking-wider">
                  <Crosshair className="w-3.5 h-3.5 inline mr-1" />Mortar Position
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
                    Grid Coordinate (8 or 10 digit)
                  </label>
                  <Input
                    value={mortarGrid}
                    onChange={(e) => setMortarGrid(e.target.value)}
                    placeholder="e.g., 12340 56780"
                    className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm font-mono"
                    maxLength={12}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
                    Elevation (m ASL)
                  </label>
                  <Input
                    type="number"
                    value={mortarElev}
                    onChange={(e) => setMortarElev(e.target.value)}
                    placeholder="e.g., 150"
                    className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Forward Observer Data */}
            <Card className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-green-400 uppercase tracking-wider">
                  <Compass className="w-3.5 h-3.5 inline mr-1" />Forward Observer Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
                    FO Grid Coordinate
                  </label>
                  <Input
                    value={foGrid}
                    onChange={(e) => setFoGrid(e.target.value)}
                    placeholder="e.g., 12500 57000"
                    className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm font-mono"
                    maxLength={12}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
                      Azimuth to Target (°)
                    </label>
                    <Input
                      type="number"
                      value={foAzimuth}
                      onChange={(e) => setFoAzimuth(e.target.value)}
                      placeholder="0 - 360"
                      className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
                      Distance to Target (m)
                    </label>
                    <Input
                      type="number"
                      value={foDistance}
                      onChange={(e) => setFoDistance(e.target.value)}
                      placeholder="e.g., 1200"
                      className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
                    Elevation Difference (m) — positive = uphill
                  </label>
                  <Input
                    type="number"
                    value={foElevDiff}
                    onChange={(e) => setFoElevDiff(e.target.value)}
                    placeholder="e.g., 25 or -10"
                    className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.15)] h-8 text-sm font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Calculate button */}
            <Button
              className="w-full bg-[#C9A227] text-black hover:bg-[#b8931f] font-bold"
              onClick={handleCalculate}
            >
              <Calculator className="w-4 h-4 mr-2" />
              Calculate Firing Solution
            </Button>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>

          {/* Right: Results */}
          <div className="space-y-4">
            {results ? (
              <>
                {/* Target details */}
                <Card className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-red-400 uppercase tracking-wider">
                      <Target className="w-3.5 h-3.5 inline mr-1" />Calculated Target Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-[#4a6070] uppercase tracking-wider">Distance</span>
                        <p className="text-lg font-bold font-mono text-white">{results.distance}m</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#4a6070] uppercase tracking-wider">Elevation Diff</span>
                        <p className={`text-lg font-bold font-mono ${results.elevDiff >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                          {results.elevDiff >= 0 ? <ArrowUp className="w-4 h-4 inline" /> : <ArrowDown className="w-4 h-4 inline" />}
                          {Math.abs(results.elevDiff)}m
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#4a6070] uppercase tracking-wider">Mortar-Target Azimuth</span>
                      <p className="text-2xl font-bold font-mono text-[#C9A227]">
                        {results.azimuthMils} MIL
                        <span className="text-sm text-[#4a6070] ml-2">({results.azimuthDeg}°)</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Firing solutions */}
                <Card className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-[#C9A227] uppercase tracking-wider">
                      Firing Solutions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {results.solutions.map((sol, i) => (
                      <div
                        key={sol.charge}
                        className={`rounded-lg border p-3 ${
                          i === 0
                            ? 'border-green-700/50 bg-green-900/10'
                            : 'border-[rgba(201,162,39,0.075)] bg-[#111a24]/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={`text-[10px] ${i === 0 ? 'bg-green-900/40 text-green-400 border-green-700' : 'bg-[#111a24] text-[#8a9aa8] border-[rgba(201,162,39,0.15)]'}`}>
                            Charge {sol.charge}
                            {i === 0 && ' — RECOMMENDED'}
                          </Badge>
                          <Badge className="bg-[#111a24] text-[#8a9aa8] text-[10px]">
                            Dispersion: ±{sol.dispersion}m
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] text-[#4a6070] uppercase tracking-wider">Corrected Elevation</span>
                            <p className="text-xl font-bold font-mono text-white">{sol.elevation} MIL</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#4a6070] uppercase tracking-wider">Time of Flight</span>
                            <p className="text-xl font-bold font-mono text-yellow-400">
                              <Clock className="w-4 h-4 inline mr-1" />{sol.tof}s
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Quick reference */}
                <Card className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-[#8a9aa8] uppercase tracking-wider">Quick Reference</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-[#4a6070]">
                    <p><strong className="text-[#8a9aa8]">R key:</strong> Hold for range (left) and elevation diff (right)</p>
                    <p><strong className="text-[#8a9aa8]">V key:</strong> Hold for vector/azimuth</p>
                    <p><strong className="text-[#8a9aa8]">Tip:</strong> Fire longest ToF charge first, then switch to shortest. Start fast rounds after ~half the first round's ToF has elapsed.</p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)]">
                <CardContent className="py-16 text-center space-y-4">
                  <Target className="w-16 h-16 text-[#4a6070] mx-auto" />
                  <div>
                    <p className="text-lg text-[#8a9aa8] font-semibold">No firing solution</p>
                    <p className="text-sm text-[#4a6070] mt-1">
                      Enter mortar position and FO data, then click Calculate.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
