/**
 * Pure helper functions for generating Airfield DSL text from database records.
 * Extracted here so they can be unit-tested without pulling in Express or SQLite.
 */

/** Minimal schedule entry shape required by generateDSLCode. */
export interface ScheduleEntryForDSL {
  id: number;
  aircraft_name: string;
  start_time: string;
  end_time: string;
}

/**
 * Ensure a number is formatted as a FLOAT literal understood by the grammar
 * (requires a decimal point).  Integer 32 → "32.0", float 32.5 → "32.5".
 */
export function toFloat(value: number): string {
  const num = Number(value);
  if (Number.isInteger(num)) {
    return num.toFixed(1);
  }
  return num.toString();
}

/**
 * Format an ISO date-time string to the grammar-required YYYY-MM-DDTHH:mm form.
 * Preserves the local-time interpretation of the input string.
 */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins  = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

/**
 * Convert an arbitrary string into a valid Airfield DSL identifier.
 * Replaces non-word characters with underscores; prepends underscore if
 * the first character is a digit.
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

/**
 * Build a complete `.air` DSL document from the user's aircraft, hangars and
 * schedule entries.  The result can be parsed and scheduled by the Langium
 * pipeline.
 */
export function generateDSLCode(
  userId: number,
  aircraft: any[],
  hangars: any[],
  entries: ScheduleEntryForDSL[],
): string {
  const lines: string[] = [];

  lines.push(`airfield User${userId}_Airfield {`);
  lines.push('');

  // Aircraft definitions
  for (const a of aircraft) {
    lines.push(`  aircraft ${sanitizeName(a.name)} {`);
    lines.push(`    wingspan ${toFloat(a.wingspan)} m`);
    lines.push(`    length ${toFloat(a.length)} m`);
    lines.push(`    height ${toFloat(a.height)} m`);
    lines.push(`    tailHeight ${toFloat(a.tail_height)} m`);
    lines.push('  }');
    lines.push('');
  }

  // Hangar definitions
  for (const h of hangars) {
    const hangarName = sanitizeName(h.name);
    lines.push(`  hangar ${hangarName} {`);

    // Door dimensions: max of all bay dimensions, with 20×10 as floor
    let maxWidth  = 20.0;
    let maxHeight = 10.0;
    for (const bay of h.bays) {
      if (bay.width  > maxWidth)  maxWidth  = bay.width;
      if (bay.height > maxHeight) maxHeight = bay.height;
    }

    lines.push('    doors {');
    lines.push(`      door ${hangarName}Door {`);
    lines.push(`        width ${toFloat(maxWidth)} m`);
    lines.push(`        height ${toFloat(maxHeight)} m`);
    lines.push('      }');
    lines.push('    }');

    const numBays = h.bays.length;
    lines.push('    grid baygrid {');
    lines.push(`      rows 1 cols ${numBays}`);
    for (let i = 0; i < numBays; i++) {
      const bay     = h.bays[i];
      const bayName = sanitizeName(bay.name);
      lines.push(`      bay ${bayName} {`);
      lines.push(`        at row 0 col ${i}`);
      lines.push(`        width ${toFloat(bay.width)} m`);
      lines.push(`        depth ${toFloat(bay.depth)} m`);
      lines.push(`        height ${toFloat(bay.height)} m`);

      const adjacentNames: string[] = [];
      if (i > 0)            adjacentNames.push(sanitizeName(h.bays[i - 1].name));
      if (i < numBays - 1)  adjacentNames.push(sanitizeName(h.bays[i + 1].name));
      if (adjacentNames.length > 0) {
        lines.push(`        adjacent { ${adjacentNames.join(' ')} }`);
      }

      lines.push('      }');
    }
    lines.push('    }');
    lines.push('  }');
    lines.push('');
  }

  // Schedule entries as auto-inductions
  for (const entry of entries) {
    const durationMs      = new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime();
    const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
    const aircraftName    = sanitizeName(entry.aircraft_name);
    const notBefore       = formatDateTime(entry.start_time);
    const notAfter        = formatDateTime(entry.end_time);

    lines.push(`  auto-induct id "entry_${entry.id}" ${aircraftName} duration ${durationMinutes} minutes`);
    lines.push(`    notBefore ${notBefore}`);
    lines.push(`    notAfter ${notAfter};`);
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}
