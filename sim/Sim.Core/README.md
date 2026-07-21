# Moonbase.Sim.Core

Deterministic simulation core. **No UnityEngine references** (enforced by asmdef `noEngineReferences`).
The sim is a pure function of (seed, command log). See `docs/TDD.md` at repo root.

## Banned in tick paths (determinism + GC rules)

- `Dictionary`/`HashSet` **iteration** (lookup is fine) — iterate `List<T>`/arrays only
- `DateTime`, `Environment`, `System.Random`, `Guid.NewGuid` — all randomness via `SimRng` streams
- LINQ, closures, `string` concat/format, any `new` per tick in hot paths (pool and `Clear()`)
- Floating-point reassociation refactors without re-running the determinism twin test
- Callbacks/subscriptions for sim events — systems *pull* from `EventBus` (previous tick's buffer)

Enforced by tests: `DeterminismTests` (twin-run hash), `AllocationTests` (zero alloc after warmup).
