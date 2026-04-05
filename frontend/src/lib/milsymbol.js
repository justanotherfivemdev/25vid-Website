import {
  ms,
  numberair,
  numberlandunit,
  path2d,
} from 'milsymbol-modern';

// Import Symbol constructor directly instead of relying on ms.Symbol being set
// via a side-effect in milsymbol's re-export chain.  Vite/Rollup can optimize
// away the intermediate src/milsymbol.js module that does `ms.Symbol = Symbol`,
// leaving ms.Symbol undefined in production builds (the "Ce is not a constructor"
// error).  The "milsymbol-symbol" alias is defined in vite.config.mjs.
import MilSymbol from 'milsymbol-symbol';

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

  // Ensure ms.Symbol is set – may have been dropped by tree-shaking.
  if (!ms.Symbol) {
    ms.Symbol = MilSymbol;
  }

  milsymbolConfigured = true;
}

export function renderMilSymbolDataUrl(sidc, size = 40) {
  try {
    ensureMilSymbolConfigured();
    const symbol = new MilSymbol(sidc, { size });
    return symbol.toDataURL();
  } catch {
    return null;
  }
}

export { ms as milsymbol };
