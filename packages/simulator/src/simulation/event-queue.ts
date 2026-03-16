/**
 * Min-heap priority queue for simulation events.
 *
 * Events are ordered by:
 *   1. `time` ascending (earliest first)
 *   2. `priority` ascending (lower = higher priority, see EVENT_PRIORITY)
 *   3. `inductionId` lexicographic (deterministic tie-break)
 *
 * Design reference: SIMULATION_DESIGN.md §4
 */

import type { ScheduledEvent } from './types.js';

/** Extract inductionId if the event carries one; empty string otherwise. */
function eventInductionId(e: ScheduledEvent): string {
    if ('inductionId' in e) return e.inductionId;
    return '';
}

/**
 * Compare two events for heap ordering.
 * Returns negative if `a` should be dequeued before `b`.
 */
function compareEvents(a: ScheduledEvent, b: ScheduledEvent): number {
    if (a.time !== b.time) return a.time - b.time;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const idA = eventInductionId(a);
    const idB = eventInductionId(b);
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
}

/**
 * Binary min-heap priority queue for ScheduledEvents.
 *
 * Standard array-backed heap with O(log n) push/pop, O(1) peek/size/isEmpty.
 */
export class EventQueue {
    private heap: ScheduledEvent[] = [];

    /** Insert an event into the queue. O(log n). */
    push(event: ScheduledEvent): void {
        this.heap.push(event);
        this.bubbleUp(this.heap.length - 1);
    }

    /** Remove and return the highest-priority (earliest) event. O(log n). */
    pop(): ScheduledEvent | undefined {
        const { heap } = this;
        if (heap.length === 0) return undefined;
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
            heap[0] = last;
            this.sinkDown(0);
        }
        return top;
    }

    /** Return the highest-priority event without removing it. O(1). */
    peek(): ScheduledEvent | undefined {
        return this.heap[0];
    }

    /** Number of events in the queue. */
    size(): number {
        return this.heap.length;
    }

    /** True if the queue is empty. */
    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    // -- heap internals --

    private bubbleUp(i: number): void {
        const { heap } = this;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (compareEvents(heap[i], heap[parent]) >= 0) break;
            [heap[i], heap[parent]] = [heap[parent], heap[i]];
            i = parent;
        }
    }

    private sinkDown(i: number): void {
        const { heap } = this;
        const n = heap.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && compareEvents(heap[left], heap[smallest]) < 0) {
                smallest = left;
            }
            if (right < n && compareEvents(heap[right], heap[smallest]) < 0) {
                smallest = right;
            }
            if (smallest === i) break;
            [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
            i = smallest;
        }
    }
}
