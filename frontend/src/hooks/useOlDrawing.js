/**
 * useOlDrawing.js
 *
 * React hook that manages OpenLayers Draw interactions for the Operations Planner.
 * Creates and manages vector layers for drawings and movement paths,
 * with proper style rendering for each type.
 */

import { useRef, useCallback, useEffect } from 'react';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Draw, Modify, Select } from 'ol/interaction';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import CircleGeom from 'ol/geom/Circle';
import { Style, Stroke, Fill, Circle as CircleStyle, Icon, Text as OlText } from 'ol/style';

/* ── Style helpers ───────────────────────────────────────────────────────── */

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Create OL Style for a drawing based on its type and style properties.
 */
function createDrawingStyle(drawing) {
  const s = drawing.style || {};
  const color = s.color || '#C9A227';
  const width = s.stroke_width || 2;
  const opacity = s.opacity || 1;
  const fillColor = s.fill_color || null;
  const lineDash = s.line_dash || null;

  const strokeStyle = new Stroke({
    color: hexToRgba(color, opacity),
    width,
    lineDash: lineDash || undefined,
  });

  const fillStyle = fillColor
    ? new Fill({ color: hexToRgba(fillColor, opacity * 0.3) })
    : (drawing.drawing_type === 'polygon' || drawing.drawing_type === 'circle' ||
       drawing.drawing_type === 'engagement_area' || drawing.drawing_type === 'objective')
      ? new Fill({ color: hexToRgba(color, opacity * 0.1) })
      : undefined;

  const styles = [new Style({ stroke: strokeStyle, fill: fillStyle })];

  // Arrow head for arrow type
  if (drawing.drawing_type === 'arrow' && drawing.coordinates?.length >= 2) {
    const coords = drawing.coordinates;
    const last = coords[coords.length - 1];
    const prev = coords[coords.length - 2];
    const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);

    styles.push(
      new Style({
        geometry: new Point(last),
        image: new CircleStyle({
          radius: width * 3,
          fill: new Fill({ color: hexToRgba(color, opacity) }),
        }),
      }),
    );
  }

  // Phase line dashes
  if (drawing.drawing_type === 'phase_line') {
    styles[0] = new Style({
      stroke: new Stroke({
        color: hexToRgba(color, opacity),
        width: width + 1,
        lineDash: [15, 10],
      }),
    });
  }

  // Boundary double line
  if (drawing.drawing_type === 'boundary') {
    styles.push(
      new Style({
        stroke: new Stroke({
          color: hexToRgba(color, opacity * 0.4),
          width: width + 4,
        }),
      }),
    );
  }

  // Label text
  if (drawing.label) {
    styles.push(
      new Style({
        text: new OlText({
          text: drawing.label,
          font: 'bold 11px Rajdhani, sans-serif',
          fill: new Fill({ color: hexToRgba(color, opacity) }),
          stroke: new Stroke({ color: 'rgba(0,0,0,0.7)', width: 3 }),
          offsetY: -12,
        }),
      }),
    );
  }

  return styles;
}

/**
 * Create OL Style for a movement path.
 */
function createPathStyle(path) {
  const s = path.style || {};
  const color = s.color || '#3B82F6';
  const width = s.stroke_width || 3;

  return [
    // Outer glow
    new Style({
      stroke: new Stroke({ color: hexToRgba(color, 0.2), width: width + 6 }),
    }),
    // Main line
    new Style({
      stroke: new Stroke({ color: hexToRgba(color, 0.8), width, lineDash: [12, 8] }),
    }),
    // Direction arrow overlay
    new Style({
      stroke: new Stroke({ color: hexToRgba(color, 0.5), width: width - 1, lineDash: [2, 20] }),
    }),
  ];
}

/* ── Active draw style (while drawing) ───────────────────────────────────── */

function createActiveDrawStyle(drawStyle) {
  const color = drawStyle?.color || '#C9A227';
  return new Style({
    stroke: new Stroke({ color: hexToRgba(color, 0.8), width: (drawStyle?.stroke_width || 2), lineDash: [8, 4] }),
    fill: new Fill({ color: hexToRgba(color, 0.1) }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: hexToRgba(color, 0.8) }),
      stroke: new Stroke({ color: '#000', width: 1 }),
    }),
  });
}

/* ── Map tool type to OL geometry type ───────────────────────────────────── */

function getOlGeometryType(toolId) {
  switch (toolId) {
    case 'line':
    case 'arrow':
    case 'polyline':
    case 'phase_line':
    case 'boundary':
    case 'movement_path':
      return 'LineString';
    case 'polygon':
    case 'engagement_area':
    case 'objective':
      return 'Polygon';
    case 'circle':
      return 'Circle';
    case 'freehand':
      return 'LineString'; // with freehand option
    default:
      return null;
  }
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

/**
 * @param {Object} params
 * @param {import('ol/Map').default|null} olMap
 * @param {Object} mapDimensions - { w, h }
 * @param {string} activeTool
 * @param {Object} drawStyle
 * @param {Array} drawings
 * @param {Array} movementPaths
 * @param {Function} onDrawingComplete - (drawingData) => void
 * @param {Function} onMovementPathComplete - (pathData) => void
 * @param {string|null} selectedDrawingId
 * @param {Function} onSelectDrawing - (drawingId | null) => void
 * @param {string|null} selectedPathId
 * @param {Function} onSelectPath - (pathId | null) => void
 * @param {boolean} isViewOnly
 */
export default function useOlDrawing({
  olMap,
  mapDimensions,
  activeTool,
  drawStyle,
  drawings,
  movementPaths,
  onDrawingComplete,
  onMovementPathComplete,
  selectedDrawingId,
  onSelectDrawing,
  selectedPathId,
  onSelectPath,
  isViewOnly,
}) {
  const drawLayerRef = useRef(null);
  const drawSourceRef = useRef(null);
  const pathLayerRef = useRef(null);
  const pathSourceRef = useRef(null);
  const drawInteractionRef = useRef(null);
  const selectInteractionRef = useRef(null);
  const modifyInteractionRef = useRef(null);

  /* ── Ensure vector layers exist on the map ─────────────────────────── */
  const ensureLayers = useCallback(() => {
    if (!olMap) return;

    if (!drawSourceRef.current) {
      drawSourceRef.current = new VectorSource();
      drawLayerRef.current = new VectorLayer({
        source: drawSourceRef.current,
        zIndex: 5,
      });
      olMap.addLayer(drawLayerRef.current);
    }

    if (!pathSourceRef.current) {
      pathSourceRef.current = new VectorSource();
      pathLayerRef.current = new VectorLayer({
        source: pathSourceRef.current,
        zIndex: 4,
      });
      olMap.addLayer(pathLayerRef.current);
    }
  }, [olMap]);

  /* ── Sync drawings → OL features ──────────────────────────────────── */
  const syncDrawings = useCallback(() => {
    const src = drawSourceRef.current;
    if (!src || !mapDimensions.w) return;

    src.clear();
    (drawings || []).forEach((d) => {
      const coords = (d.coordinates || []).map(([x, y]) => [
        x * mapDimensions.w,
        y * mapDimensions.h,
      ]);
      if (coords.length === 0) return;

      let geom;
      if (d.drawing_type === 'circle' && d.radius != null) {
        const centre = coords[0];
        geom = new CircleGeom(centre, d.radius * Math.max(mapDimensions.w, mapDimensions.h));
      } else if (
        d.drawing_type === 'polygon' ||
        d.drawing_type === 'engagement_area' ||
        d.drawing_type === 'objective'
      ) {
        if (coords.length >= 3) {
          geom = new Polygon([coords]);
        } else {
          return;
        }
      } else {
        if (coords.length >= 2) {
          geom = new LineString(coords);
        } else {
          return;
        }
      }

      const feat = new Feature({ geometry: geom });
      feat.set('drawingId', d.id);
      feat.set('drawingType', d.drawing_type);
      feat.setStyle(createDrawingStyle(d));
      src.addFeature(feat);
    });
  }, [drawings, mapDimensions]);

  /* ── Sync movement paths → OL features ────────────────────────────── */
  const syncPaths = useCallback(() => {
    const src = pathSourceRef.current;
    if (!src || !mapDimensions.w) return;

    src.clear();
    (movementPaths || []).forEach((p) => {
      const coords = (p.coordinates || []).map(([x, y]) => [
        x * mapDimensions.w,
        y * mapDimensions.h,
      ]);
      if (coords.length < 2) return;

      const feat = new Feature({ geometry: new LineString(coords) });
      feat.set('pathId', p.id);
      feat.setStyle(createPathStyle(p));
      src.addFeature(feat);

      // Start/end markers
      const startMarker = new Feature({ geometry: new Point(coords[0]) });
      startMarker.set('pathId', p.id);
      startMarker.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: '#22C55E' }),
            stroke: new Stroke({ color: '#000', width: 1 }),
          }),
          text: new OlText({
            text: 'S',
            font: 'bold 8px sans-serif',
            fill: new Fill({ color: '#fff' }),
          }),
        }),
      );
      src.addFeature(startMarker);

      const endMarker = new Feature({ geometry: new Point(coords[coords.length - 1]) });
      endMarker.set('pathId', p.id);
      endMarker.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: '#EF4444' }),
            stroke: new Stroke({ color: '#000', width: 1 }),
          }),
          text: new OlText({
            text: 'E',
            font: 'bold 8px sans-serif',
            fill: new Fill({ color: '#fff' }),
          }),
        }),
      );
      src.addFeature(endMarker);
    });
  }, [movementPaths, mapDimensions]);

  /* ── Manage draw interaction based on active tool ─────────────────── */
  const updateDrawInteraction = useCallback(() => {
    if (!olMap) return;

    // Remove previous draw interaction
    if (drawInteractionRef.current) {
      olMap.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }

    if (isViewOnly || activeTool === 'select' || !activeTool) return;

    const geomType = getOlGeometryType(activeTool);
    if (!geomType) return;

    const isFreehand = activeTool === 'freehand';
    const isMovementPath = activeTool === 'movement_path';

    const draw = new Draw({
      source: isMovementPath ? pathSourceRef.current : drawSourceRef.current,
      type: geomType,
      freehand: isFreehand,
      style: createActiveDrawStyle(drawStyle),
      // For lines: max 2 points; polylines: unlimited
      ...(activeTool === 'line' || activeTool === 'arrow'
        ? { maxPoints: 2 }
        : {}),
    });

    draw.on('drawend', (e) => {
      const geom = e.feature.getGeometry();
      let coords;
      let radius = null;

      if (geom.getType() === 'Circle') {
        const centre = geom.getCenter();
        coords = [[centre[0] / mapDimensions.w, centre[1] / mapDimensions.h]];
        radius = geom.getRadius() / Math.max(mapDimensions.w, mapDimensions.h);
      } else if (geom.getType() === 'Polygon') {
        coords = geom.getCoordinates()[0].map(([x, y]) => [
          Math.max(0, Math.min(1, x / mapDimensions.w)),
          Math.max(0, Math.min(1, y / mapDimensions.h)),
        ]);
      } else {
        coords = geom.getCoordinates().map(([x, y]) => [
          Math.max(0, Math.min(1, x / mapDimensions.w)),
          Math.max(0, Math.min(1, y / mapDimensions.h)),
        ]);
      }

      if (isMovementPath) {
        // Remove the temporary feature (we manage path features ourselves)
        setTimeout(() => {
          const src = pathSourceRef.current;
          if (src) src.removeFeature(e.feature);
        }, 0);
        onMovementPathComplete?.({
          coordinates: coords,
          duration: 60,
          name: '',
          style: { color: '#3B82F6', stroke_width: 3, opacity: 1.0 },
          notes: '',
        });
      } else {
        // Remove the temporary feature (we manage drawing features ourselves)
        setTimeout(() => {
          const src = drawSourceRef.current;
          if (src) src.removeFeature(e.feature);
        }, 0);
        onDrawingComplete?.({
          drawing_type: activeTool,
          coordinates: coords,
          radius,
          style: { ...drawStyle },
          label: '',
          notes: '',
          z_index: (drawings?.length || 0),
        });
      }
    });

    olMap.addInteraction(draw);
    drawInteractionRef.current = draw;
  }, [
    olMap, activeTool, drawStyle, mapDimensions, isViewOnly,
    onDrawingComplete, onMovementPathComplete, drawings,
  ]);

  /* ── Click to select drawings/paths ───────────────────────────────── */
  const setupClickSelect = useCallback(() => {
    if (!olMap) return;

    // We use the map click event rather than Select interaction for simplicity
    const handleClick = (e) => {
      if (activeTool !== 'select') return;

      let found = false;
      olMap.forEachFeatureAtPixel(e.pixel, (feat) => {
        if (found) return;
        const drawingId = feat.get('drawingId');
        const pathId = feat.get('pathId');
        if (drawingId) {
          onSelectDrawing?.(drawingId);
          onSelectPath?.(null);
          found = true;
        } else if (pathId) {
          onSelectPath?.(pathId);
          onSelectDrawing?.(null);
          found = true;
        }
      });

      if (!found) {
        // Don't clear selection if clicking on a unit (which is on a different layer)
        const unitFeat = olMap.forEachFeatureAtPixel(e.pixel, (f) => f.get('unitId') ? f : null);
        if (!unitFeat) {
          onSelectDrawing?.(null);
          onSelectPath?.(null);
        }
      }
    };

    olMap.on('click', handleClick);
    return () => olMap.un('click', handleClick);
  }, [olMap, activeTool, onSelectDrawing, onSelectPath]);

  /* ── Effects ───────────────────────────────────────────────────────── */

  useEffect(() => {
    ensureLayers();
  }, [ensureLayers]);

  useEffect(() => {
    syncDrawings();
  }, [syncDrawings]);

  useEffect(() => {
    syncPaths();
  }, [syncPaths]);

  useEffect(() => {
    updateDrawInteraction();
    return () => {
      if (drawInteractionRef.current && olMap) {
        olMap.removeInteraction(drawInteractionRef.current);
        drawInteractionRef.current = null;
      }
    };
  }, [updateDrawInteraction, olMap]);

  useEffect(() => {
    const cleanup = setupClickSelect();
    return cleanup;
  }, [setupClickSelect]);

  return {
    drawSourceRef,
    pathSourceRef,
  };
}

export { createDrawingStyle, createPathStyle };
