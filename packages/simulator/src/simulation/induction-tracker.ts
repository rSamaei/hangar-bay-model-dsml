/**
 * Tracks per-induction metadata accumulated during the simulation run.
 *
 * Consolidates the many Maps that were previously scattered across
 * DiscreteEventSimulator into a single cohesive object.
 */

import type {
    ActiveInduction,
    CompletedInduction,
    PlacementRejection,
    WaitingAircraft,
} from './types.js';

/** Per-induction metadata accumulated during the simulation. */
interface InductionMeta {
    /** Epoch ms — when this aircraft first requested induction. */
    requestedArrival: number;
    /** Number of placement attempts so far. */
    placementAttempts: number;
    /** Queue position when first queued (null if placed on first attempt). */
    queuePosition: number | null;
    /** Structured reason for the first failed placement (null if placed immediately). */
    waitReason: string | null;
    /** Structured reason for the first departure block (null if no block). */
    departureDelayReason: string | null;
}

export class InductionTracker {
    private readonly meta = new Map<string, InductionMeta>();

    /** Get or create meta for an induction. */
    private ensure(inductionId: string): InductionMeta {
        let m = this.meta.get(inductionId);
        if (!m) {
            m = {
                requestedArrival: 0,
                placementAttempts: 0,
                queuePosition: null,
                waitReason: null,
                departureDelayReason: null,
            };
            this.meta.set(inductionId, m);
        }
        return m;
    }

    /** Record the originally requested arrival time (only first call sticks). */
    recordRequestedArrival(inductionId: string, time: number): void {
        const m = this.ensure(inductionId);
        if (m.requestedArrival === 0) m.requestedArrival = time;
    }

    /** Increment and return placement attempt count. */
    incrementAttempts(inductionId: string): number {
        const m = this.ensure(inductionId);
        m.placementAttempts++;
        return m.placementAttempts;
    }

    /** Record queue position when first queued (only first call sticks). */
    recordQueuePosition(inductionId: string, position: number): void {
        const m = this.ensure(inductionId);
        if (m.queuePosition === null) m.queuePosition = position;
    }

    /** Record that this induction was placed immediately (no queue). */
    recordImmediatePlacement(inductionId: string): void {
        this.ensure(inductionId);
        // queuePosition stays null — signals "placed on first attempt"
    }

    /** Record the first wait reason (only first call sticks). */
    recordWaitReason(inductionId: string, reason: string | null): void {
        const m = this.ensure(inductionId);
        if (m.waitReason === null && reason !== null) m.waitReason = reason;
    }

    /** Record the first departure delay reason (only first call sticks). */
    recordDepartureDelayReason(inductionId: string, reason: string | null): void {
        const m = this.ensure(inductionId);
        if (m.departureDelayReason === null && reason !== null) m.departureDelayReason = reason;
    }

    getRequestedArrival(inductionId: string): number | undefined {
        return this.meta.get(inductionId)?.requestedArrival || undefined;
    }

    getAttempts(inductionId: string): number {
        return this.meta.get(inductionId)?.placementAttempts ?? 1;
    }

    getQueuePosition(inductionId: string): number | null {
        return this.meta.get(inductionId)?.queuePosition ?? null;
    }

    getWaitReason(inductionId: string): string | null {
        return this.meta.get(inductionId)?.waitReason ?? null;
    }

    getDepartureDelayReason(inductionId: string): string | null {
        return this.meta.get(inductionId)?.departureDelayReason ?? null;
    }

    /**
     * Build a CompletedInduction from an active induction and current time.
     *
     * This was previously duplicated in completeDeparture() and finalise().
     */
    buildCompleted(
        active: ActiveInduction,
        currentTime: number,
        kind: 'manual' | 'auto',
    ): CompletedInduction {
        const reqArr = this.getRequestedArrival(active.id);
        const waitTime = (kind === 'auto' && reqArr !== undefined)
            ? Math.max(0, active.actualStart - reqArr)
            : 0;

        return {
            id: active.id,
            kind,
            aircraftName: active.aircraftName,
            hangarName: active.hangarName,
            doorName: active.doorName,
            bayNames: active.bayNames,
            actualStart: active.actualStart,
            maintenanceEnd: active.scheduledEnd,
            actualEnd: currentTime,
            waitTime,
            departureDelay: Math.max(0, currentTime - active.scheduledEnd),
            waitReason: this.getWaitReason(active.id),
            departureDelayReason: this.getDepartureDelayReason(active.id),
            placementAttempts: this.getAttempts(active.id),
            queuePosition: this.getQueuePosition(active.id),
        };
    }
}
