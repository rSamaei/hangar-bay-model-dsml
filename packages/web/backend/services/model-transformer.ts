import type { Model as LangiumModel } from '../../../language/out/generated/ast.js';
import type { DomainModel } from '../../../simulator/out/types/model.js';

export function transformToDomainModel(langiumModel: LangiumModel): DomainModel {
  return {
    airfield: {
      name: langiumModel.name || 'Unnamed Airfield'
    },
    clearances: (langiumModel.clearanceEnvelopes || []).map(c => ({
      name: c.name,
      lateralMargin: c.lateralMargin,
      longitudinalMargin: c.longitudinalMargin,
      verticalMargin: c.verticalMargin
    })),
    aircraft: (langiumModel.aircraftTypes || []).map(a => ({
      name: a.name,
      wingspan: a.wingspan,
      length: a.length,
      height: a.height,
      tailHeight: a.tailHeight || a.height,
      clearance: a.clearance?.ref?.name
    })),
    accessPaths: (langiumModel.accessPaths || []).map(ap => ({
      name: ap.name,
      nodes: (ap.nodes || []).map(n => ({
        name: n.name,
        width: n.width,
        height: n.height
      })),
      links: (ap.links || []).map(l => ({
        from: l.from?.ref?.name || 'unknown',
        to: l.to?.ref?.name || 'unknown',
        bidirectional: l.bidirectional || false,
        type: l.type || 'taxi'
      }))
    })),
    hangars: (langiumModel.hangars || []).map(h => ({
      name: h.name,
      doors: (h.doors || []).map(d => ({
        name: d.name,
        width: d.width,
        height: d.height,
        accessNode: d.accessNode?.ref?.name
      })),
      bays: (h.grid?.bays || []).map(b => ({
        name: b.name,
        width: b.width,
        depth: b.depth,
        height: b.height,
        row: b.row,
        col: b.col,
        adjacent: (b.adjacent || []).map(adj => adj.ref?.name).filter(Boolean) as string[],
        accessNode: b.accessNode?.ref?.name
      })),
      gridRows: h.grid?.rows,
      gridCols: h.grid?.cols
    })),
    inductions: (langiumModel.inductions || []).map(i => ({
      id: i.id || `induction_${i.aircraft?.ref?.name}_${i.start}`,
      aircraft: i.aircraft?.ref?.name || 'unknown',
      hangar: i.hangar?.ref?.name || 'unknown',
      bays: (i.bays || []).map(b => b.ref?.name).filter(Boolean) as string[],
      door: i.door?.ref?.name,
      start: i.start || '',
      end: i.end || '',
      span: i.span,
      requires: i.requires,
      metadata: i.metadata?.tags ? Object.fromEntries(
        i.metadata.tags.map(t => [t.key, t.value.replace(/['"]/g, '')])
      ) : {}
    })),
    autoInductions: (langiumModel.autoInductions || []).map(ai => ({
      id: ai.id || `auto_${ai.aircraft?.ref?.name}_${ai.duration}`,
      aircraft: ai.aircraft?.ref?.name || 'unknown',
      duration: ai.duration,
      preferredHangar: ai.preferredHangar?.ref?.name,
      requires: ai.requires,
      precedingInductions: (ai.precedingInductions || []).map(p => p.ref?.id).filter(Boolean) as string[],
      notBefore: ai.notBefore,
      notAfter: ai.notAfter,
      metadata: ai.metadata?.tags ? Object.fromEntries(
        ai.metadata.tags.map(t => [t.key, t.value.replace(/['"]/g, '')])
      ) : {}
    }))
  };
}
