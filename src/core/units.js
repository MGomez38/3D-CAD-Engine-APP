// Internal model units are INCHES (standard for US shop drawings).
// This module parses user input in several formats and formats lengths
// for display in architectural (ft-in), decimal inch, or millimeter styles.

export const Units = {
  mode: 'arch', // 'arch' | 'in' | 'mm'

  /**
   * Parse a length string into inches. Returns null if unparseable.
   * Accepted: 3' 6"  |  3'6 1/2"  |  42  |  42"  |  3.5'  |  1200mm  |  30cm  |  1.2m
   * A bare number is interpreted as inches.
   */
  parse(text) {
    if (text == null) return null;
    let s = String(text).trim().toLowerCase().replace(/[""]/g, '"').replace(/['']/g, "'");
    if (!s) return null;

    let sign = 1;
    if (s.startsWith('-')) { sign = -1; s = s.slice(1).trim(); }

    // metric
    let m = s.match(/^([\d.]+)\s*(mm|cm|m)$/);
    if (m) {
      const v = parseFloat(m[1]);
      if (isNaN(v)) return null;
      const factor = { mm: 1 / 25.4, cm: 1 / 2.54, m: 39.3700787 }[m[2]];
      return sign * v * factor;
    }

    // feet / inches / fractions:  [F'] [I] [N/D] ["]
    m = s.match(/^(?:([\d.]+)\s*')?\s*(?:([\d.]+))?\s*(?:(\d+)\s*\/\s*(\d+))?\s*"?$/);
    if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null;
    let inches = 0;
    if (m[1] != null) inches += parseFloat(m[1]) * 12;
    if (m[2] != null) inches += parseFloat(m[2]);
    if (m[3] != null && m[4] != null && parseInt(m[4]) !== 0) inches += parseInt(m[3]) / parseInt(m[4]);
    return isNaN(inches) ? null : sign * inches;
  },

  /** Format inches per current display mode. */
  format(inches) {
    if (inches == null || isNaN(inches)) return '—';
    switch (this.mode) {
      case 'mm': return `${Math.round(inches * 25.4)} mm`;
      case 'in': return `${roundTo(inches, 3)}"`;
      case 'arch':
      default: return formatArch(inches);
    }
  },

  formatArea(sqIn) {
    if (this.mode === 'mm') return `${roundTo(sqIn * 645.16 / 1e6, 3)} m²`;
    return `${roundTo(sqIn / 144, 2)} sq ft`;
  },
};

function roundTo(v, digits) {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

/** 42.53 -> 3' 6 1/2"  (nearest 1/16") */
export function formatArch(inches) {
  const neg = inches < 0 ? '-' : '';
  let totalSixteenths = Math.round(Math.abs(inches) * 16);
  let feet = Math.floor(totalSixteenths / (12 * 16));
  totalSixteenths -= feet * 12 * 16;
  let whole = Math.floor(totalSixteenths / 16);
  let sixteenths = totalSixteenths - whole * 16;

  let frac = '';
  if (sixteenths > 0) {
    let n = sixteenths, d = 16;
    while (n % 2 === 0) { n /= 2; d /= 2; }
    frac = ` ${n}/${d}`;
  }
  const inchPart = `${whole}${frac}"`;
  return feet > 0 ? `${neg}${feet}' ${inchPart}` : `${neg}${inchPart}`;
}
