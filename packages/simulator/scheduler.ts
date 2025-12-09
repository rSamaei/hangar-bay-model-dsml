import type { Model, AutoInduction, Hangar, AircraftType, Induction } from '../language/out/generated/ast.js';

export interface ScheduledInduction {
    aircraft: AircraftType;
    hangar: Hangar;
    fromBay: number;
    toBay: number;
    start: number;
    duration: number;
}

export interface SchedulingResult {
    success: boolean;
    scheduled: ScheduledInduction[];
    unscheduled: AutoInduction[];
    reason?: string;
}

export class AutoScheduler {
    schedule(model: Model): SchedulingResult {
        const scheduled: ScheduledInduction[] = [];
        const unscheduled: AutoInduction[] = [];
        
        // Track occupied bays: Map<hangarName, Map<timeSlot, Set<bayNumber>>>
        const occupancy = new Map<string, Map<number, Set<number>>>();
        
        // Initialize with existing manual inductions
        for (const induction of model.inductions) {
            const hangar = induction.hangar?.ref;
            if (!hangar) continue;
            
            this.markOccupied(occupancy, hangar.name, induction.start, induction.duration, 
                             induction.fromBay, induction.toBay);
        }
        
        // Try to schedule each auto-induction
        for (const autoInd of model.autoInductions) {
            const aircraft = autoInd.aircraft?.ref;
            if (!aircraft) {
                unscheduled.push(autoInd);
                continue;
            }
            
            // Calculate required bays
            const requiredBays = this.calculateRequiredBays(aircraft, model.hangars);
            
            // Try to find a slot
            const slot = this.findSlot(model, occupancy, aircraft, requiredBays, 
                                      autoInd.duration, autoInd.preferredHangar?.ref);
            
            if (slot) {
                scheduled.push(slot);
                this.markOccupied(occupancy, slot.hangar.name, slot.start, slot.duration, 
                                 slot.fromBay, slot.toBay);
            } else {
                unscheduled.push(autoInd);
            }
        }
        
        return {
            success: unscheduled.length === 0,
            scheduled,
            unscheduled
        };
    }
    
    private calculateRequiredBays(aircraft: AircraftType, hangars: Hangar[]): Map<string, number> {
        const required = new Map<string, number>();
        
        for (const hangar of hangars) {
            const baysNeeded = Math.ceil(aircraft.wingspan / hangar.bayWidth);
            if (baysNeeded <= hangar.bays && aircraft.height <= hangar.height) {
                required.set(hangar.name, baysNeeded);
            }
        }
        
        return required;
    }
    
    private findSlot(
        model: Model,
        occupancy: Map<string, Map<number, Set<number>>>,
        aircraft: AircraftType,
        requiredBays: Map<string, number>,
        duration: number,
        preferredHangar?: Hangar
    ): ScheduledInduction | null {
        // Determine hangars to try (preferred first)
        const hangarsToTry = preferredHangar 
            ? [preferredHangar, ...model.hangars.filter(h => h !== preferredHangar)]
            : model.hangars;
        
        // Try each hangar
        for (const hangar of hangarsToTry) {
            const baysNeeded = requiredBays.get(hangar.name);
            if (!baysNeeded) continue;
            
            // Try each time slot (from 0 to some max, e.g., 100)
            for (let startTime = 0; startTime < 100; startTime++) {
                // Try each bay position
                for (let startBay = 1; startBay <= hangar.bays - baysNeeded + 1; startBay++) {
                    const endBay = startBay + baysNeeded - 1;
                    
                    if (this.isSlotAvailable(occupancy, hangar.name, startTime, duration, 
                                            startBay, endBay)) {
                        return {
                            aircraft,
                            hangar,
                            fromBay: startBay,
                            toBay: endBay,
                            start: startTime,
                            duration
                        };
                    }
                }
            }
        }
        
        return null;
    }
    
    private isSlotAvailable(
        occupancy: Map<string, Map<number, Set<number>>>,
        hangarName: string,
        start: number,
        duration: number,
        fromBay: number,
        toBay: number
    ): boolean {
        const hangarOcc = occupancy.get(hangarName);
        if (!hangarOcc) return true;
        
        for (let t = start; t < start + duration; t++) {
            const timeSlot = hangarOcc.get(t);
            if (!timeSlot) continue;
            
            for (let bay = fromBay; bay <= toBay; bay++) {
                if (timeSlot.has(bay)) return false;
            }
        }
        
        return true;
    }
    
    private markOccupied(
        occupancy: Map<string, Map<number, Set<number>>>,
        hangarName: string,
        start: number,
        duration: number,
        fromBay: number,
        toBay: number
    ): void {
        if (!occupancy.has(hangarName)) {
            occupancy.set(hangarName, new Map());
        }
        
        const hangarOcc = occupancy.get(hangarName)!;
        
        for (let t = start; t < start + duration; t++) {
            if (!hangarOcc.has(t)) {
                hangarOcc.set(t, new Set());
            }
            
            const timeSlot = hangarOcc.get(t)!;
            for (let bay = fromBay; bay <= toBay; bay++) {
                timeSlot.add(bay);
            }
        }
    }
}