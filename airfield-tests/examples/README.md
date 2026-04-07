# Airfield DSL Example Files

These `.air` files demonstrate the capabilities of the Airfield DSML. Each file is self-contained and can be loaded in the web editor, processed by the CLI, or opened in VS Code with the extension installed.

All showcase files use `// <- WRONG` / `// <- CORRECT` comment annotations to mark intentionally incorrect and correct inductions. They are automatically synced to the web frontend's example picker during build.

## Files

### 01-raf-valley-base.air

Full RAF Valley scenario with two hangars, two clearance envelopes, and two aircraft types (Typhoon, C-130). Demonstrates:

- 2x3 grid with `adjacency 8` (diagonal neighbours)
- Traversable bay annotation
- Span direction (`lateral` / `longitudinal`) affecting bay-fit calculations
- `requires N bays` clause and `SFR_BAY_COUNT_OVERRIDE` warning
- Non-contiguous bay assignment (SFR13)
- Reversed time windows (SFR21)
- Auto-induction scheduling with `notBefore`/`notAfter`

### 02-access-paths-and-reachability.air

NarrowHangar with a 3-bay chain behind a 6 m corridor bottleneck. Demonstrates:

- Access path modelling (nodes + bidirectional links)
- Corridor fit check (SFR_CORRIDOR_FIT) — aircraft wingspan vs corridor width
- Dynamic reachability (SFR_DYNAMIC_REACHABILITY)
- Door fit failures (SFR11)
- Auto-induction scheduling constraints

### 03-large-aircraft-multi-bay.air

AtlasHangar (2x4 grid, `adjacency 8`) with large military transport aircraft (A400M, C-17). Demonstrates:

- Multi-bay inductions (4+ bays for wide aircraft)
- Combined bay-set fit (SFR12_COMBINED) — sum of bay widths vs effective wingspan
- Diagonal adjacency in contiguity checks
- `requires N bays` override warnings
- Span direction effects on bay-fit axis selection

### 04-quick-fixes-showcase.air

Minimal scenario designed to trigger all three code-action quick fixes:

- **Fix A** (SFR12_BAY_FIT): appends adjacent bays until combined width covers the aircraft
- **Fix B** (SFR13_CONTIGUITY): BFS finds minimum bridging bay(s) for disconnected sets
- **Fix C** (SFR25_BAY_COUNT): BFS outward from current set to add enough adjacent bays

### 05-simulation-showcase.air

Discrete-event simulation showcase with MainHangar (2x3 grid, star-topology access path, traversable Bay2) and OverflowHangar (single bay, no access path). Demonstrates:

- **Bay contention**: 7 manual inductions fill all bays at 08:00; 6 auto-inductions queue
- **Waiting**: AUTO_Trainer_Quick waits ~90 min, AUTO_Trainer_LongWait waits ~2 hours
- **Deadline expiry**: AUTO_Trainer_Deadline has `notAfter 09:00` but no bay frees before then
- **Preferred-hangar fallback**: AUTO_Trainer_Fallback prefers MainHangar but falls back to OverflowHangar
- **After-dependency chains**: Trainer_Bay1_Anchor (manual) -> AUTO_Trainer_ChainA -> AUTO_Trainer_ChainB
- **Traversable bay**: Bay2 remains passable even when occupied

Expected timeline spans 08:00-12:00 with staggered placements as bays free up.
