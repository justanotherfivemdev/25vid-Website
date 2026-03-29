/**
 * Arma Reforger map configuration.
 *
 * Each map entry defines the game map's metadata, grid dimensions,
 * and the image source URL.  Map images are sourced from the open-source
 * ArmaReforgerMortarCalculator project (MIT License) by arcticfr33d0m:
 * https://github.com/arcticfr33d0m/ArmaReforgerMortarCalculator
 *
 * The viewer uses Leaflet CRS.Simple with these game-coordinate extents
 * so overlays, markers, and grid references map 1:1 with in-game coords.
 */

const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/arcticfr33d0m/ArmaReforgerMortarCalculator/main/maps';

export const REFORGER_MAPS = [
  {
    id: 'everon',
    name: 'Everon',
    description: 'Main island — 12.7 km × 12.7 km terrain',
    xMax: 12700,
    yMax: 12700,
    imageUrl: `${GITHUB_RAW_BASE}/Everon.png`,
    gridSize: 1000, // metres per major grid square
  },
  {
    id: 'serhiivka',
    name: 'Serhiivka',
    description: 'Eastern front urban area — 10.2 km × 10.2 km',
    xMax: 10240,
    yMax: 10240,
    imageUrl: `${GITHUB_RAW_BASE}/Serhiivka.png`,
    gridSize: 1000,
  },
  {
    id: 'zarichne',
    name: 'Zarichne',
    description: 'Compact rural terrain — 4.6 km × 4.6 km',
    xMax: 4607,
    yMax: 4607,
    imageUrl: `${GITHUB_RAW_BASE}/Zarichne.png`,
    gridSize: 500,
  },
  {
    id: 'belleau-wood',
    name: 'Belleau Wood',
    description: 'Dense woodland theatre — 12 km × 12 km',
    xMax: 12030,
    yMax: 12030,
    imageUrl: `${GITHUB_RAW_BASE}/BelleauWood.png`,
    gridSize: 1000,
  },
];

/**
 * Look up a Reforger map by its ID.
 */
export function getReforgerMap(id) {
  return REFORGER_MAPS.find((m) => m.id === id) || null;
}
