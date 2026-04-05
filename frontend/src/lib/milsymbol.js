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

// Fail-fast: surface a clear diagnostic instead of the cryptic minified
// "Ce is not a constructor" error that appears in production bundles when
// the Vite alias or milsymbol internal layout changes.
if (typeof MilSymbol !== 'function') {
  console.error(
    '[milsymbol] Symbol constructor not available (got %s). ' +
      'Check the "milsymbol-symbol" Vite alias in vite.config.mjs — ' +
      'it must resolve to milsymbol/src/ms/symbol.js which should ' +
      'export a default function.',
    typeof MilSymbol,
  );
}

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
  } catch (err) {
    console.warn('[milsymbol] render failed for SIDC %s:', sidc, err);
    return null;
  }
}

export { ms as milsymbol };
