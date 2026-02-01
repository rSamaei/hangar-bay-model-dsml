import type { Model } from '../../../language/out/generated/ast.js';
import { SCHEDULER_CONFIG } from '../config.js';

export function calculateSearchWindow(model: Model): { start: Date; end: Date } {
    let baseline = new Date(SCHEDULER_CONFIG.DEFAULT_START_TIME);
    
    if (model.inductions.length > 0) {
        const manualTimes = model.inductions.map(ind => new Date(ind.start));
        const earliestManual = new Date(Math.min(...manualTimes.map(t => t.getTime())));
        baseline = earliestManual;
    }
    
    const searchEnd = new Date(baseline.getTime() + SCHEDULER_CONFIG.SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    
    return { start: baseline, end: searchEnd };
}