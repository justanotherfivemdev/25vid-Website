/**
 * Ballistic data for Arma Reforger mortar calculations.
 *
 * Ported from the ArmaReforgerMortarCalculator Python project (MIT License)
 * by arcticfr33d0m: https://github.com/arcticfr33d0m/ArmaReforgerMortarCalculator
 *
 * Each faction → ammo → charge → { dispersion, ranges: { distance: { elev, tof, delev } } }
 */

export const MILS_PER_REVOLUTION = { NATO: 6400, RU: 6000 };

export const BALLISTIC_DATA = {
  NATO: {
    'M821 HE': {
      0: { dispersion: 10, ranges: {
        50: { elev: 1540, tof: 13.2, delev: 61 },
        100: { elev: 1479, tof: 13.2, delev: 63 },
        150: { elev: 1416, tof: 13.0, delev: 66 },
        200: { elev: 1350, tof: 12.8, delev: 71 },
        250: { elev: 1279, tof: 12.6, delev: 78 },
        300: { elev: 1201, tof: 12.3, delev: 95 },
        350: { elev: 1106, tof: 11.7, delev: 151 },
        400: { elev: 955, tof: 10.7, delev: 0 },
      }},
      1: { dispersion: 23, ranges: {
        100: { elev: 1547, tof: 20.0, delev: 28 },
        200: { elev: 1492, tof: 19.9, delev: 27 },
        300: { elev: 1437, tof: 19.7, delev: 29 },
        400: { elev: 1378, tof: 19.5, delev: 31 },
        500: { elev: 1317, tof: 19.2, delev: 33 },
        600: { elev: 1249, tof: 18.8, delev: 35 },
        700: { elev: 1174, tof: 18.3, delev: 42 },
        800: { elev: 1085, tof: 17.5, delev: 57 },
        900: { elev: 954, tof: 16.1, delev: 148 },
      }},
      2: { dispersion: 39, ranges: {
        200: { elev: 1538, tof: 26.6, delev: 15 },
        300: { elev: 1507, tof: 26.5, delev: 16 },
        400: { elev: 1475, tof: 26.4, delev: 16 },
        500: { elev: 1443, tof: 26.3, delev: 16 },
        600: { elev: 1410, tof: 26.2, delev: 17 },
        700: { elev: 1376, tof: 26.0, delev: 17 },
        800: { elev: 1341, tof: 25.8, delev: 18 },
        900: { elev: 1305, tof: 25.5, delev: 20 },
        1000: { elev: 1266, tof: 25.2, delev: 20 },
        1100: { elev: 1225, tof: 24.9, delev: 22 },
        1200: { elev: 1180, tof: 24.4, delev: 23 },
        1300: { elev: 1132, tof: 23.9, delev: 27 },
        1400: { elev: 1076, tof: 23.2, delev: 31 },
        1500: { elev: 1009, tof: 22.3, delev: 43 },
        1600: { elev: 912, tof: 20.9, delev: 109 },
      }},
      3: { dispersion: 54, ranges: {
        300: { elev: 1534, tof: 31.7, delev: 12 },
        400: { elev: 1511, tof: 31.6, delev: 11 },
        500: { elev: 1489, tof: 31.6, delev: 12 },
        600: { elev: 1466, tof: 31.5, delev: 12 },
        700: { elev: 1442, tof: 31.4, delev: 12 },
        800: { elev: 1419, tof: 31.3, delev: 12 },
        900: { elev: 1395, tof: 31.1, delev: 13 },
        1000: { elev: 1370, tof: 31.0, delev: 13 },
        1100: { elev: 1344, tof: 30.8, delev: 13 },
        1200: { elev: 1318, tof: 30.6, delev: 13 },
        1300: { elev: 1291, tof: 30.3, delev: 14 },
        1400: { elev: 1263, tof: 30.1, delev: 15 },
        1500: { elev: 1233, tof: 29.7, delev: 15 },
        1600: { elev: 1202, tof: 29.4, delev: 16 },
        1700: { elev: 1169, tof: 29.0, delev: 17 },
        1800: { elev: 1133, tof: 28.5, delev: 19 },
        1900: { elev: 1094, tof: 28.0, delev: 21 },
        2000: { elev: 1051, tof: 27.3, delev: 26 },
        2100: { elev: 999, tof: 26.5, delev: 31 },
        2200: { elev: 931, tof: 25.3, delev: 46 },
        2300: { elev: 801, tof: 22.7, delev: 0 },
      }},
      4: { dispersion: 69, ranges: {
        400: { elev: 1531, tof: 36.3, delev: 9 },
        500: { elev: 1514, tof: 36.2, delev: 9 },
        600: { elev: 1496, tof: 36.2, delev: 9 },
        700: { elev: 1478, tof: 36.1, delev: 9 },
        800: { elev: 1460, tof: 36.0, delev: 9 },
        900: { elev: 1442, tof: 35.9, delev: 9 },
        1000: { elev: 1424, tof: 35.8, delev: 10 },
        1100: { elev: 1405, tof: 35.7, delev: 10 },
        1200: { elev: 1385, tof: 35.6, delev: 9 },
        1300: { elev: 1366, tof: 35.4, delev: 10 },
        1400: { elev: 1346, tof: 35.3, delev: 10 },
        1500: { elev: 1326, tof: 35.1, delev: 11 },
        1600: { elev: 1305, tof: 34.9, delev: 11 },
        1700: { elev: 1283, tof: 34.6, delev: 11 },
        1800: { elev: 1261, tof: 34.4, delev: 11 },
        1900: { elev: 1238, tof: 34.1, delev: 12 },
        2000: { elev: 1214, tof: 33.8, delev: 12 },
        2100: { elev: 1188, tof: 33.5, delev: 13 },
        2200: { elev: 1162, tof: 33.1, delev: 14 },
        2300: { elev: 1134, tof: 32.7, delev: 15 },
        2400: { elev: 1104, tof: 32.2, delev: 17 },
        2500: { elev: 1070, tof: 31.7, delev: 20 },
        2600: { elev: 1034, tof: 31.0, delev: 25 },
        2700: { elev: 993, tof: 30.3, delev: 31 },
        2800: { elev: 942, tof: 29.2, delev: 64 },
        2900: { elev: 870, tof: 27.7, delev: 0 },
      }},
    },
  },
  RU: {
    'O-832DU HE': {
      0: { dispersion: 8, ranges: {
        50: { elev: 1413, tof: 15.0, delev: 44 },
        100: { elev: 1411, tof: 15.0, delev: 46 },
        150: { elev: 1365, tof: 14.9, delev: 47 },
        200: { elev: 1318, tof: 14.8, delev: 50 },
        250: { elev: 1268, tof: 14.6, delev: 51 },
        300: { elev: 1217, tof: 14.4, delev: 58 },
        350: { elev: 1159, tof: 14.1, delev: 64 },
        400: { elev: 1095, tof: 13.7, delev: 72 },
        450: { elev: 1023, tof: 13.2, delev: 101 },
        500: { elev: 922, tof: 12.4, delev: 0 },
      }},
      1: { dispersion: 13, ranges: {
        100: { elev: 1446, tof: 19.5, delev: 27 },
        200: { elev: 1392, tof: 19.4, delev: 28 },
        300: { elev: 1335, tof: 19.2, delev: 29 },
        400: { elev: 1275, tof: 18.9, delev: 31 },
        500: { elev: 1212, tof: 18.6, delev: 35 },
        600: { elev: 1141, tof: 18.1, delev: 40 },
        700: { elev: 1058, tof: 17.4, delev: 48 },
        800: { elev: 952, tof: 16.4, delev: 81 },
      }},
      2: { dispersion: 19, ranges: {
        200: { elev: 1432, tof: 24.8, delev: 17 },
        300: { elev: 1397, tof: 24.7, delev: 18 },
        400: { elev: 1362, tof: 24.6, delev: 18 },
        500: { elev: 1325, tof: 24.4, delev: 18 },
        600: { elev: 1288, tof: 24.2, delev: 20 },
        700: { elev: 1248, tof: 24.0, delev: 20 },
        800: { elev: 1207, tof: 23.7, delev: 22 },
        900: { elev: 1162, tof: 23.3, delev: 23 },
        1000: { elev: 1114, tof: 22.9, delev: 26 },
        1100: { elev: 1060, tof: 22.3, delev: 29 },
        1200: { elev: 997, tof: 21.5, delev: 37 },
        1300: { elev: 914, tof: 20.4, delev: 55 },
        1400: { elev: 755, tof: 17.8, delev: 0 },
      }},
      3: { dispersion: 27, ranges: {
        300: { elev: 1423, tof: 28.9, delev: 13 },
        400: { elev: 1397, tof: 28.9, delev: 14 },
        500: { elev: 1370, tof: 28.8, delev: 13 },
        600: { elev: 1343, tof: 28.6, delev: 14 },
        700: { elev: 1315, tof: 28.5, delev: 14 },
        800: { elev: 1286, tof: 28.3, delev: 14 },
        900: { elev: 1257, tof: 28.1, delev: 16 },
        1000: { elev: 1226, tof: 27.9, delev: 16 },
        1100: { elev: 1193, tof: 27.6, delev: 16 },
        1200: { elev: 1159, tof: 27.2, delev: 18 },
        1300: { elev: 1123, tof: 26.8, delev: 19 },
        1400: { elev: 1084, tof: 26.4, delev: 22 },
        1500: { elev: 1040, tof: 25.8, delev: 24 },
        1600: { elev: 991, tof: 25.1, delev: 28 },
        1700: { elev: 932, tof: 24.2, delev: 36 },
        1800: { elev: 851, tof: 22.8, delev: 68 },
      }},
      4: { dispersion: 34, ranges: {
        400: { elev: 1418, tof: 32.9, delev: 10 },
        500: { elev: 1398, tof: 32.9, delev: 11 },
        600: { elev: 1376, tof: 32.8, delev: 10 },
        700: { elev: 1355, tof: 32.7, delev: 11 },
        800: { elev: 1333, tof: 32.6, delev: 11 },
        900: { elev: 1311, tof: 32.4, delev: 12 },
        1000: { elev: 1288, tof: 32.2, delev: 12 },
        1100: { elev: 1264, tof: 32.1, delev: 12 },
        1200: { elev: 1240, tof: 31.8, delev: 13 },
        1300: { elev: 1215, tof: 31.6, delev: 13 },
        1400: { elev: 1189, tof: 31.3, delev: 14 },
        1500: { elev: 1161, tof: 31.0, delev: 14 },
        1600: { elev: 1133, tof: 30.7, delev: 15 },
        1700: { elev: 1102, tof: 30.3, delev: 16 },
        1800: { elev: 1069, tof: 29.8, delev: 17 },
        1900: { elev: 1034, tof: 29.3, delev: 19 },
        2000: { elev: 995, tof: 28.7, delev: 22 },
        2100: { elev: 950, tof: 27.9, delev: 26 },
        2200: { elev: 896, tof: 26.9, delev: 34 },
        2300: { elev: 820, tof: 25.3, delev: 65 },
      }},
    },
  },
};

/**
 * List all ammo types for a given faction.
 */
export function getAmmoTypes(faction) {
  return Object.keys(BALLISTIC_DATA[faction] || {});
}

/**
 * List all charge levels for a given faction + ammo.
 */
export function getCharges(faction, ammo) {
  const ammoData = BALLISTIC_DATA[faction]?.[ammo];
  if (!ammoData) return [];
  return Object.keys(ammoData).map(Number).sort((a, b) => a - b);
}
