import type { Model } from '../../../language/out/generated/ast.js';
import { SCHEDULER_CONFIG } from '../config.js';

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the date range over which the auto-scheduler will search for slots.
 *
 * The window starts at whichever is earlier: the earliest manually-scheduled
 * induction start time, or now (if no manual inductions exist). It then extends
 * for `SCHEDULER_CONFIG.SEARCH_WINDOW_DAYS` days.
 *
 * Anchoring to the earliest manual induction avoids scheduling auto-inductions
 * far in the future when the model already has near-term manual work planned.
 */
export function calculateSearchWindow(model: Model): { start: Date; end: Date } {
    const start = model.inductions.length > 0
        ? new Date(Math.min(...model.inductions.map(ind => new Date(ind.start).getTime())))
        : new Date();

    const end = new Date(start.getTime() + SCHEDULER_CONFIG.SEARCH_WINDOW_DAYS * MILLIS_PER_DAY);

    return { start, end };
}
