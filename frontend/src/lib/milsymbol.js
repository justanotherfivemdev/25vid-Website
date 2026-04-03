import {
  ms,
  numberair,
  numberlandunit,
  path2d,
} from 'milsymbol-modern';

let milsymbolConfigured = false;

function ensureMilSymbolConfigured() {
  if (milsymbolConfigured) {
    return;
  }

  // The package default import eagerly registers every legacy symbol standard.
  // The planner only exposes numeric air/land-unit SIDCs, so we keep the
  // families we actually render instead of shipping the entire catalog.
  ms.addIcons(numberair);
  ms.addIcons(numberlandunit);
  ms.Path2D = path2d;
  milsymbolConfigured = true;
}

export function renderMilSymbolDataUrl(sidc, size = 40) {
  ensureMilSymbolConfigured();

  try {
    const symbol = new ms.Symbol(sidc, { size });
    return symbol.toDataURL();
  } catch {
    return null;
  }
}

export { ms as milsymbol };
