import { Model, Induction } from '../language/out/generated/ast.js';
export interface Conflict {
    time: number;
    hangarName: string;
    fromBay: number;
    toBay: number;
    induction: Induction;
}
export interface SimulationResult {
    conflicts: Conflict[];
    maxOccupancyPerHangar: Map<string, number>;
    timeline: {
        time: number;
        occupied: Record<string, boolean[]>;
    }[];
}
export declare function simulate(model: Model): SimulationResult;
