/**
 * Unit tests for the EventQueue min-heap.
 *
 * Validates ordering by: (1) timestamp, (2) event-type priority, (3) inductionId.
 */
import { describe, expect, test } from 'vitest';
import { EventQueue } from '../../src/simulation/event-queue.js';
import { EVENT_PRIORITY, type ScheduledEvent } from '../../src/simulation/types.js';

// ---------------------------------------------------------------------------
// Helpers — shorthand event constructors
// ---------------------------------------------------------------------------

function arrival(time: number, inductionId: string): ScheduledEvent {
    return {
        kind: 'ARRIVAL',
        time,
        priority: EVENT_PRIORITY.ARRIVAL,
        inductionId,
        autoInduction: {} as any,
        spatialCandidates: null,
    };
}

function departure(time: number, inductionId: string, fixed = false): ScheduledEvent {
    return {
        kind: 'DEPARTURE',
        time,
        priority: EVENT_PRIORITY.DEPARTURE,
        inductionId,
        hangarName: 'H',
        bayNames: ['B1'],
        doorName: 'D1',
        fixed,
    };
}

function retryPlacement(time: number): ScheduledEvent {
    return {
        kind: 'RETRY_PLACEMENT',
        time,
        priority: EVENT_PRIORITY.RETRY_PLACEMENT,
    };
}

function departureRetry(time: number, inductionId: string): ScheduledEvent {
    return {
        kind: 'DEPARTURE_RETRY',
        time,
        priority: EVENT_PRIORITY.DEPARTURE_RETRY,
        inductionId,
    };
}

/** Drain the queue into an array. */
function drainAll(q: EventQueue): ScheduledEvent[] {
    const result: ScheduledEvent[] = [];
    while (!q.isEmpty()) result.push(q.pop()!);
    return result;
}

// ---------------------------------------------------------------------------
// Tests: basic operations
// ---------------------------------------------------------------------------

describe('EventQueue — basic operations', () => {
    test('new queue is empty', () => {
        const q = new EventQueue();
        expect(q.isEmpty()).toBe(true);
        expect(q.size()).toBe(0);
        expect(q.peek()).toBeUndefined();
        expect(q.pop()).toBeUndefined();
    });

    test('push increases size, pop decreases it', () => {
        const q = new EventQueue();
        q.push(arrival(100, 'A'));
        expect(q.size()).toBe(1);
        expect(q.isEmpty()).toBe(false);

        q.push(arrival(200, 'B'));
        expect(q.size()).toBe(2);

        q.pop();
        expect(q.size()).toBe(1);

        q.pop();
        expect(q.size()).toBe(0);
        expect(q.isEmpty()).toBe(true);
    });

    test('peek returns next event without removing it', () => {
        const q = new EventQueue();
        q.push(arrival(100, 'A'));
        q.push(arrival(50, 'B'));

        expect(q.peek()!.time).toBe(50);
        expect(q.size()).toBe(2); // still 2

        q.pop();
        expect(q.peek()!.time).toBe(100);
    });
});

// ---------------------------------------------------------------------------
// Tests: timestamp ordering
// ---------------------------------------------------------------------------

describe('EventQueue — timestamp ordering', () => {
    test('events dequeue in ascending timestamp order', () => {
        const q = new EventQueue();
        q.push(arrival(300, 'C'));
        q.push(arrival(100, 'A'));
        q.push(arrival(200, 'B'));

        const drained = drainAll(q);
        expect(drained.map(e => e.time)).toEqual([100, 200, 300]);
    });

    test('many events with same type dequeue by timestamp', () => {
        const q = new EventQueue();
        const times = [500, 100, 300, 200, 400];
        for (const t of times) q.push(arrival(t, `ID_${t}`));

        const drained = drainAll(q);
        expect(drained.map(e => e.time)).toEqual([100, 200, 300, 400, 500]);
    });
});

// ---------------------------------------------------------------------------
// Tests: event-type priority ordering (same timestamp)
// ---------------------------------------------------------------------------

describe('EventQueue — event-type priority at same timestamp', () => {
    test('DEPARTURE (0) before DEPARTURE_RETRY (1) before RETRY_PLACEMENT (2) before ARRIVAL (3)', () => {
        const q = new EventQueue();
        const t = 1000;

        // Push in reverse priority order
        q.push(arrival(t, 'A'));
        q.push(retryPlacement(t));
        q.push(departureRetry(t, 'DR'));
        q.push(departure(t, 'D'));

        const drained = drainAll(q);
        expect(drained.map(e => e.kind)).toEqual([
            'DEPARTURE',
            'DEPARTURE_RETRY',
            'RETRY_PLACEMENT',
            'ARRIVAL',
        ]);
    });

    test('multiple departures at same time, arrivals after', () => {
        const q = new EventQueue();
        const t = 500;

        q.push(arrival(t, 'A1'));
        q.push(departure(t, 'D1'));
        q.push(arrival(t, 'A2'));
        q.push(departure(t, 'D2'));

        const drained = drainAll(q);
        // All departures before all arrivals
        expect(drained[0].kind).toBe('DEPARTURE');
        expect(drained[1].kind).toBe('DEPARTURE');
        expect(drained[2].kind).toBe('ARRIVAL');
        expect(drained[3].kind).toBe('ARRIVAL');
    });
});

// ---------------------------------------------------------------------------
// Tests: inductionId tie-breaking (same timestamp + same priority)
// ---------------------------------------------------------------------------

describe('EventQueue — inductionId tie-break', () => {
    test('same timestamp and kind: lexicographic by inductionId', () => {
        const q = new EventQueue();
        const t = 1000;

        q.push(arrival(t, 'Charlie'));
        q.push(arrival(t, 'Alpha'));
        q.push(arrival(t, 'Bravo'));

        const drained = drainAll(q);
        expect(drained.map(e => (e as any).inductionId)).toEqual([
            'Alpha', 'Bravo', 'Charlie',
        ]);
    });

    test('departures at same time: lexicographic by inductionId', () => {
        const q = new EventQueue();
        const t = 2000;

        q.push(departure(t, 'Z'));
        q.push(departure(t, 'A'));
        q.push(departure(t, 'M'));

        const drained = drainAll(q);
        expect(drained.map(e => (e as any).inductionId)).toEqual(['A', 'M', 'Z']);
    });
});

// ---------------------------------------------------------------------------
// Tests: mixed timestamp + priority
// ---------------------------------------------------------------------------

describe('EventQueue — mixed scenarios', () => {
    test('earlier timestamp always wins over higher priority', () => {
        const q = new EventQueue();

        // Arrival at t=100 should come before departure at t=200
        q.push(departure(200, 'D'));
        q.push(arrival(100, 'A'));

        const first = q.pop()!;
        expect(first.kind).toBe('ARRIVAL');
        expect(first.time).toBe(100);

        const second = q.pop()!;
        expect(second.kind).toBe('DEPARTURE');
        expect(second.time).toBe(200);
    });

    test('complex interleaving: timestamps, priorities, and IDs', () => {
        const q = new EventQueue();

        q.push(arrival(200, 'A2'));
        q.push(departure(100, 'D1'));
        q.push(retryPlacement(200));
        q.push(arrival(100, 'A1'));
        q.push(departure(200, 'D2'));
        q.push(departureRetry(200, 'DR2'));

        const drained = drainAll(q);
        // t=100: departure D1, then arrival A1
        // t=200: departure D2, departureRetry DR2, retryPlacement, arrival A2
        expect(drained.map(e => `${e.time}:${e.kind}`)).toEqual([
            '100:DEPARTURE',
            '100:ARRIVAL',
            '200:DEPARTURE',
            '200:DEPARTURE_RETRY',
            '200:RETRY_PLACEMENT',
            '200:ARRIVAL',
        ]);
    });

    test('single element queue works correctly', () => {
        const q = new EventQueue();
        q.push(arrival(42, 'only'));

        expect(q.size()).toBe(1);
        const e = q.pop()!;
        expect(e.time).toBe(42);
        expect(q.isEmpty()).toBe(true);
    });

    test('stress: 100 random events dequeue in correct order', () => {
        const q = new EventQueue();
        const events: ScheduledEvent[] = [];
        const kinds: Array<() => ScheduledEvent> = [
            () => arrival(Math.floor(Math.random() * 1000), `A${Math.random()}`),
            () => departure(Math.floor(Math.random() * 1000), `D${Math.random()}`),
            () => retryPlacement(Math.floor(Math.random() * 1000)),
            () => departureRetry(Math.floor(Math.random() * 1000), `DR${Math.random()}`),
        ];

        for (let i = 0; i < 100; i++) {
            const e = kinds[Math.floor(Math.random() * kinds.length)]();
            events.push(e);
            q.push(e);
        }

        const drained = drainAll(q);
        expect(drained).toHaveLength(100);

        // Verify ordering invariant: each event is <= the next
        for (let i = 1; i < drained.length; i++) {
            const prev = drained[i - 1];
            const curr = drained[i];
            // time must not go backwards
            expect(curr.time).toBeGreaterThanOrEqual(prev.time);
            // same time → priority must not go backwards
            if (curr.time === prev.time) {
                expect(curr.priority).toBeGreaterThanOrEqual(prev.priority);
            }
        }
    });
});
