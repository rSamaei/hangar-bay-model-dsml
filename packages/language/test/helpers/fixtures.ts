/** Minimal valid Cessna aircraft block (fits comfortably in 12 m bays). */
export const CESSNA = `
    aircraft Cessna {
        wingspan 11.0 m
        length   8.3 m
        height   2.7 m
    }`;

/** Hangar with a 15 m-wide door and one generous bay — Cessna fits fine. */
export const ALPHA_HANGAR = `
    hangar Alpha {
        doors { door D1 { width 15.0 m  height 5.0 m } }
        grid baygrid {
            bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m }
        }
    }`;
