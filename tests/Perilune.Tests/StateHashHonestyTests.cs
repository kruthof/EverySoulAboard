using System;
using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// HASH HONESTY (ECONOMY-PLAN §5.1). The determinism canary is only a canary if every
    /// canonical field it claims to cover actually moves it. These tests drive the REAL
    /// <see cref="Simulation.StateHash"/> over the citizen, item and device folds: for each
    /// field,
    /// two identically-built sims are proven hash-equal FIRST (the precondition — otherwise
    /// a "hash changed" assertion proves nothing), then exactly one field is mutated on one
    /// twin, the mutation is confirmed to have landed by reading the field back, and the
    /// hashes must then differ.
    ///
    /// The three <c>Aliased_</c> tests are the reason this file exists. Until 2026-07-22
    /// (W0-1) both folds packed several fields into one 64-bit word with overlapping bit
    /// ranges, so genuinely DIFFERENT ship states hashed IDENTICALLY:
    ///   * ItemKind bit 7 (kind ≥ 128) landed on ReservedForJob's bit 39;
    ///   * ItemStack.Count was clipped to its low 24 bits;
    ///   * Citizen.JobWorkTicks (bits 16–47) overlapped CarryingItemId (bits 32–63).
    /// Those three tests assert two distinct states hash DIFFERENTLY — they cannot pass
    /// against the old fold, and they are constructed as exact collision pairs under it.
    ///
    /// NAMED MUTATIONS that must make these tests fail (apply, observe, revert):
    ///   * Delete any one <c>XxHash64.Combine</c> line from the citizen or item loop in
    ///     <c>Simulation.StateHash</c> ⇒ the matching row of the table test fails
    ///     ("… is not folded into StateHash").
    ///   * Restore the pre-W0-1 item pack
    ///     (<c>it.Id | ((ulong)it.Kind &lt;&lt; 32) | (it.ReservedForJob ? 1UL &lt;&lt; 39 : 0) | ((ulong)(uint)it.Count &lt;&lt; 40)</c>)
    ///     ⇒ <c>Aliased_ItemKindHighBit_IsNotTheSameBitAsReservedForJob</c> and
    ///     <c>Aliased_ItemCountAbove2Pow24_IsNotClippedToItsLow24Bits</c> fail.
    ///   * Restore the pre-W0-1 citizen pack
    ///     (<c>… | ((ulong)(uint)c.JobWorkTicks &lt;&lt; 16) | ((ulong)c.CarryingItemId &lt;&lt; 32)</c>)
    ///     ⇒ <c>Aliased_JobWorkTicksAbove65535_DoesNotOverlapCarryingItemId</c> fails.
    ///   * Replace the item loop's six chained calls with an order-independent accumulation
    ///     (<c>h ^= XxHash64.Combine(0, …)</c>) ⇒ <c>Fold_IsIdempotent_AndReadsEntityStoreOrder</c> fails.
    ///   * Drop one axis from <c>Simulation.Pack(Int3)</c> ⇒ the three rows for that axis fail
    ///     (measured: dropping <c>Y &lt;&lt; 20</c> reddens exactly <c>Citizen.Pos.Y</c>,
    ///     <c>Citizen.JobTarget.Y</c>, <c>ItemStack.Pos.Y</c>; dropping <c>Z &lt;&lt; 40</c> reddens
    ///     exactly the three <c>.Z</c> rows — 3 of 37 each time, nothing else).
    ///
    /// W0-1 EVIDENCE (measured 2026-07-22, all four mutations applied and reverted): reverting
    /// the whole W0-1 fold restructure fails **exactly 4** of the cases that existed then (37) —
    /// the three <c>Aliased_</c> tests plus the <c>ItemStack.Count (above 2^24)</c> row. Deleting
    /// the <c>CarryingItemId</c> Combine fails exactly 1 (its table row). The XOR mutation fails
    /// exactly 1 (the order test). Note what the old fold did NOT fail: the plain
    /// <c>ItemStack.Kind (high bit, ≥128)</c> table row still passed, because 4 → 128 shifts
    /// to a *different* bit and is visible one-field-at-a-time. **Single-field mutation cannot
    /// find a bit alias — only a collision PAIR can**, which is why the <c>Aliased_</c> tests
    /// are constructed as exact collision pairs and not as extra table rows.
    ///
    /// W0-1b MUTATIONS, all applied to the real fold, observed, reverted. **Counts are
    /// THIS FILE'S scope (61 cases) unless a full-suite figure is given, and the two are very
    /// different numbers** — any change to the fold moves both tick-3000 goldens as well, so a
    /// full-suite count is never smaller than the file-scope count plus 2:
    ///   * Delete any one of the thirteen new <c>Combine</c> calls ⇒ only its own rows.
    ///     Measured: <c>Citizen.Name</c> → 2 (both name rows); <c>PrevPos</c> → 3 (its three axis
    ///     rows); the <c>AutoWander</c> bit → 1; <c>Path</c> entries → 2 (contents + entry order);
    ///     <c>PathIndex</c> / <c>MoveCooldown</c> / <c>IdleCooldown</c> / <c>ItemStack.Label</c> /
    ///     <c>Device.Name</c> / <c>NextEntityId</c> / <c>RoomAnchor.Name</c> /
    ///     <c>ScriptEntry.TerminalId</c> / <c>ScriptEntry.Source</c> → 1 each.
    ///   * Delete <c>h = XxHash64.Combine(h, (ulong)path.Count);</c> ⇒ 1 here (the path
    ///     collision pair), **3 full-suite** (it + both tick-3000 goldens). NOT the
    ///     <c>Citizen.Path (length)</c> row — appending a tile also appends a <c>Combine</c>, so
    ///     that row survives; it only reddens when the count AND the entry loop are both gone
    ///     (4 here). Single-field mutation cannot see a boundary; only a pair can.
    ///   * Fold a string as its length alone (delete the code-unit loop) ⇒ **2** here,
    ///     <c>Citizen.Name (same length)</c> and <c>RoomAnchor.Name</c>. Fold it as chars alone
    ///     (delete the length) ⇒ 2 here (the device-name collision pair and the prefix-free
    ///     test), **4 of 670 full-suite** with the two goldens. Fold it as
    ///     <c>value.GetHashCode()</c> ⇒ every case here still passes, because .NET randomizes
    ///     that seed PER PROCESS and this file runs in one; that mutation is caught by
    ///     cross-process determinism, which is why the helper's doc forbids it outright rather
    ///     than pretending this file could find it.
    ///   * Move the string length to AFTER its code units ⇒ **0 here, 2 of 670 full-suite** —
    ///     and the 2 are only the tick-3000 goldens, i.e. "the fold value changed", not "an
    ///     ambiguity appeared". Move <c>Path.Count</c> to after its entries ⇒ **0 here, 1 of
    ///     670** — only the SLICE golden. The 2-crew reference ship does not move at all,
    ///     because its <c>HoldPosition</c> crew never carry a path: direct evidence that the
    ///     populated slice golden is load-bearing and the reference one is not, for this fold.
    ///     Either way, no TEST detects the reordering. See the LIMITS block: this file pins
    ///     that the length is folded and that the fold is prefix-free, NOT its position.
    ///   * Delete <c>h = XxHash64.Combine(h, (ulong)Scripts.Count);</c> ⇒ **0** here. Each
    ///     script string already carries its own length, so the list count is defence-in-depth
    ///     against whatever is appended after DSLS. No collision pair for it was constructed —
    ///     which, after the device-name case below, is stated as "none was found", not "none
    ///     exists".
    ///
    /// W0-1b (2026-07-22) closed the hole the previous version of this comment described:
    /// THIRTEEN fields were SAVED but not folded — <c>Citizen.Name/PrevPos/AutoWander/Path/
    /// PathIndex/MoveCooldown/IdleCooldown</c> (<c>Save/SaveWriter.cs:241-249</c>),
    /// <c>ItemStack.Label</c> (<c>:319</c>), <c>Device.Name</c> (<c>:287</c>), the save header's
    /// <c>NextEntityId</c> (<c>:147</c>), <c>RoomAnchor.Name</c> (<c>:218</c>) and
    /// <c>ScriptEntry.TerminalId</c>/<c>.Source</c> (<c>:333-334</c>). Three of the citizen
    /// fields are live tick state, so two sims at different path progress hashed EQUAL, and one
    /// is a behaviour gate (<c>AutoWander</c>, <c>CitizenSystem.cs:61</c>), so two sims that were
    /// about to behave differently hashed EQUAL. To see any of that for yourself, run the
    /// <c>Citizen.PathIndex</c>, <c>Citizen.AutoWander</c> or <c>Citizen.Name</c> row below
    /// against the parent commit (<c>59049f1</c>): each fails with the twins hash-EQUAL, and the
    /// last four rows fail on this commit's own first pass. Every one now has a row, the fixture
    /// seeds all thirteen non-default, and <c>SaveRestoreRunOnTests</c> proves the matching
    /// RESTORE is complete on the slice.
    ///
    /// The last four are also a lesson about this file's blind spot: they were saved, unfolded,
    /// and *not noticed* by the pass that wrote the sentence "the list is now complete". A table
    /// built FROM the fold cannot see a field the fold omits — see the closing note.
    ///
    /// LIMITS, stated honestly. This covers the citizen, item, device, anchor and script folds at
    /// tick 0, with one citizen (two in the path-boundary pair), one item, one device (two in the
    /// name-boundary pair), one anchor and one script, and it says nothing about ordering
    /// stability across entity removal. It pins that variable-length members fold a length and
    /// that the string fold is prefix-free; it does NOT pin the length's POSITION — moving the
    /// string length after its code units, or <c>Path.Count</c> after its entries, leaves the
    /// file green (measured; the tick-3000 GOLDENS do move, but a golden move only says the
    /// fold value changed, not that anything became ambiguous). Nor does it pin
    /// <c>Scripts.Count</c> at all. Further, the citizen fold's path-related ordering is pinned
    /// only by the SLICE tick-3000 golden: moving <c>Path.Count</c> after its entries reddens
    /// exactly 1 of 670 — the slice golden — and leaves the 2-crew reference golden untouched,
    /// because its <c>HoldPosition</c> crew never carry a path. Four things are KNOWN
    /// still-aliased and deliberately NOT asserted here, all out of scope for W0-1 and W0-1b
    /// alike (written up in <c>MECHANICS.md</c> "What is hashed"):
    ///   * <c>Pack(Int3)</c> masks none of its three fields — X sits at bits 0–31, Y at
    ///     20–51, Z at 40–63 — so it aliases on any negative coordinate and on any
    ///     coordinate ≥ 2^20 (ECONOMY-PLAN §4.4). The Pos/JobTarget rows below perturb X, Y
    ///     and Z separately so a dropped axis is caught, but they stay inside the legal
    ///     range and therefore do NOT probe the overlap.
    ///   * The room-anchor word is <c>Pack(Probe) | (Type &lt;&lt; 60)</c>, and since Z reaches
    ///     bit 63, <c>Type</c>'s bits 60–63 sit on Z's bits 20–23: <c>anchor(z = 2^20,
    ///     Type = None)</c> and <c>anchor(z = 0, Type = Corridor)</c> are the same word. Safe
    ///     today only because <c>Probe.Z</c> is a deck index. <c>Type</c> also has exactly 4
    ///     usable bits, which <c>RoomType</c>'s 16 members fill exactly — a 17th would fold
    ///     onto <c>None</c>.
    ///   * The device word is audited alias-free (<c>NetworkId</c> is a <c>ushort</c>), and
    ///     only <c>Device.Name</c> has a row below — the packed word itself is still undriven.
    ///   * <c>Path</c> entries and <c>PrevPos</c> go through the same lossy <c>Pack(Int3)</c>,
    ///     so they inherit its negative/≥2^20 aliasing. The rows below stay in the legal range.
    ///
    /// AND THE BIGGER LIMIT, unchanged by W0-1b and the one this file structurally cannot see:
    /// **a table built FROM the fold can only test fields the fold already contains.** No row
    /// here would have found the thirteen missing fields; a human reading <c>SaveWriter</c>
    /// beside <c>StateHash</c> found nine of them, and a second human reading the same two files
    /// found the other four *after* the first declared the audit complete. The audit for any new
    /// canonical state is a review step, not a test in this file — and it is worth doing twice.
    /// </summary>
    public class StateHashHonestyTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        /// <summary>A minimal two-entity sim, never ticked, so the ONLY thing that can move
        /// the hash between twins is the mutation under test.</summary>
        private static Simulation Fixture()
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            var c = sim.AddCitizen("Vale", new Int3(1, 1, 0));
            c.JobKind = JobKind.Dig;
            c.JobTarget = new Int3(2, 1, 0);
            c.JobWorkTicks = 40;
            c.CarryingItemId = 0;
            c.ReservedItemId = 0;
            c.Suffocation = 0.1f;
            c.Hunger = 0.2f;
            c.Thirst = 0.3f;
            c.Fatigue = 0.4f;
            c.Mood = 5f;
            c.Health = 0.9f;
            c.Morale = 0.8f;
            // W0-1b — the seven citizen fields that were saved but not folded until 2026-07-22.
            // Seeded non-default so a dropped Combine changes the twin, not just the mutation.
            c.PrevPos = new Int3(1, 1, 0);
            c.AutoWander = false;
            c.Path.Add(new Int3(2, 1, 0));
            c.Path.Add(new Int3(3, 1, 0));
            c.PathIndex = 1;
            c.MoveCooldown = 3;
            c.IdleCooldown = 7;
            var it = sim.AddItem(ItemKind.Scrap, 5, new Int3(2, 1, 0));
            it.ReservedBy = 0;
            it.CarriedBy = 0;
            it.Label = "Okafor"; // W0-1b — corpse identity
            sim.AddDevice(DeviceKind.Door, new Int3(3, 1, 0), "door_aft"); // W0-1b — MOSS binds by name
            // W0-1b, second pass (found by review, not by the package): the anchor name is the
            // MOSS room namespace and the script list IS the player's program — both saved,
            // both previously unfolded. NextEntityId comes free with AddCitizen/AddItem/AddDevice.
            sim.Rooms.SetAnchor("hydro", new Int3(1, 1, 0), RoomType.Hydro);
            sim.SetScript("term_main", "every 5s:\n  open(door_aft)\n");
            return sim;
        }

        private static Citizen Cit(Simulation s) => s.Citizens.Items[0];
        private static ItemStack Item(Simulation s) => s.Items.Items[0];
        private static Device Dev(Simulation s) => s.Devices.Items[0];

        // ------------------------------------------------------------------ the table

        private static IEnumerable<TestCaseData> Fields()
        {
            // --- Citizen fold ---
            yield return Case("Citizen.Id", s => Cit(s).Id = 4242, s => Cit(s).Id);
            // Pack(Int3) folds three axes into one word, so perturb each axis ALONE — an X-only
            // row would pass even if Y and Z were dropped from the packing entirely. The Z rows
            // put the entity on a deck the fixture world does not have; that is a deliberate
            // fold probe, not a reachable sim state (StateHash never consults World.InBounds).
            yield return Case("Citizen.Pos.X", s => Cit(s).Pos = new Int3(3, 1, 0), s => (ulong)Cit(s).Pos.X);
            yield return Case("Citizen.Pos.Y", s => Cit(s).Pos = new Int3(1, 2, 0), s => (ulong)Cit(s).Pos.Y);
            yield return Case("Citizen.Pos.Z", s => Cit(s).Pos = new Int3(1, 1, 1), s => (ulong)Cit(s).Pos.Z);
            yield return Case("Citizen.Suffocation", s => Cit(s).Suffocation = 0.55f, s => Bits(Cit(s).Suffocation));
            yield return Case("Citizen.Hunger", s => Cit(s).Hunger = 0.55f, s => Bits(Cit(s).Hunger));
            yield return Case("Citizen.Thirst", s => Cit(s).Thirst = 0.55f, s => Bits(Cit(s).Thirst));
            yield return Case("Citizen.Fatigue", s => Cit(s).Fatigue = 0.55f, s => Bits(Cit(s).Fatigue));
            yield return Case("Citizen.Mood", s => Cit(s).Mood = -12f, s => Bits(Cit(s).Mood));
            yield return Case("Citizen.JobKind", s => Cit(s).JobKind = JobKind.Craft, s => (ulong)Cit(s).JobKind);
            yield return Case("Citizen.Dead", s => Cit(s).Dead = true, s => Cit(s).Dead ? 1UL : 0UL);
            yield return Case("Citizen.RevealsFog", s => Cit(s).RevealsFog = false, s => Cit(s).RevealsFog ? 1UL : 0UL);
            yield return Case("Citizen.HoldPosition", s => Cit(s).HoldPosition = true, s => Cit(s).HoldPosition ? 1UL : 0UL);
            yield return Case("Citizen.JobWorkTicks", s => Cit(s).JobWorkTicks = 41, s => (ulong)(uint)Cit(s).JobWorkTicks);
            yield return Case("Citizen.CarryingItemId", s => Cit(s).CarryingItemId = 9, s => Cit(s).CarryingItemId);
            yield return Case("Citizen.JobTarget.X", s => Cit(s).JobTarget = new Int3(3, 1, 0), s => (ulong)Cit(s).JobTarget.X);
            yield return Case("Citizen.JobTarget.Y", s => Cit(s).JobTarget = new Int3(2, 2, 0), s => (ulong)Cit(s).JobTarget.Y);
            yield return Case("Citizen.JobTarget.Z", s => Cit(s).JobTarget = new Int3(2, 1, 1), s => (ulong)Cit(s).JobTarget.Z);
            yield return Case("Citizen.ReservedItemId", s => Cit(s).ReservedItemId = 9, s => Cit(s).ReservedItemId);
            yield return Case("Citizen.Faction", s => Cit(s).Faction = 1, s => Cit(s).Faction);
            yield return Case("Citizen.Archetype", s => Cit(s).Archetype = 3, s => Cit(s).Archetype);
            yield return Case("Citizen.Health", s => Cit(s).Health = 0.5f, s => Bits(Cit(s).Health));
            yield return Case("Citizen.Morale", s => Cit(s).Morale = 0.5f, s => Bits(Cit(s).Morale));

            // --- W0-1b: the seven citizen fields that were saved (SaveWriter.cs:241-249) but
            // not folded. Path/PathIndex/MoveCooldown are LIVE tick state (CitizenSystem.cs:
            // 40-64), so before this row existed two sims at different path progress hashed
            // EQUAL — the canary was blind to a job-dispatcher regression that reassigns work
            // and yields a different path of the same length (ECONOMY-PLAN W0-4, E0-1). ---
            yield return Case("Citizen.Name", s => Cit(s).Name = "Okafor", s => (ulong)Cit(s).Name.Length);
            // Same LENGTH, different characters: proves the string fold reads code units and
            // not just Length. Without it a fold of `Length` alone would pass the row above.
            yield return Case("Citizen.Name (same length)", s => Cit(s).Name = "Vane", s => Cit(s).Name[2]);
            yield return Case("Citizen.PrevPos.X", s => Cit(s).PrevPos = new Int3(0, 1, 0), s => (ulong)Cit(s).PrevPos.X);
            yield return Case("Citizen.PrevPos.Y", s => Cit(s).PrevPos = new Int3(1, 2, 0), s => (ulong)Cit(s).PrevPos.Y);
            yield return Case("Citizen.PrevPos.Z", s => Cit(s).PrevPos = new Int3(1, 1, 1), s => (ulong)Cit(s).PrevPos.Z);
            yield return Case("Citizen.AutoWander", s => Cit(s).AutoWander = true, s => Cit(s).AutoWander ? 1UL : 0UL);
            yield return Case("Citizen.Path (length)", s => Cit(s).Path.Add(new Int3(4, 1, 0)), s => (ulong)Cit(s).Path.Count);
            yield return Case("Citizen.Path (contents)", s => Cit(s).Path[1] = new Int3(3, 2, 0), s => (ulong)Cit(s).Path[1].Y);
            yield return Case("Citizen.Path (entry order)", s => { var p = Cit(s).Path; (p[0], p[1]) = (p[1], p[0]); }, s => (ulong)Cit(s).Path[0].X);
            yield return Case("Citizen.PathIndex", s => Cit(s).PathIndex = 2, s => (ulong)(uint)Cit(s).PathIndex);
            yield return Case("Citizen.MoveCooldown", s => Cit(s).MoveCooldown = 4, s => (ulong)(uint)Cit(s).MoveCooldown);
            yield return Case("Citizen.IdleCooldown", s => Cit(s).IdleCooldown = 8, s => (ulong)(uint)Cit(s).IdleCooldown);

            // --- Item fold ---
            yield return Case("ItemStack.Id", s => Item(s).Id = 4242, s => Item(s).Id);
            yield return Case("ItemStack.Kind", s => Item(s).Kind = ItemKind.Parts, s => (ulong)Item(s).Kind);
            // The two fields the old pack clipped or aliased, exercised at the widths the
            // economy will actually reach (a 128th kind; a stockpile above 16.7M units).
            yield return Case("ItemStack.Kind (high bit, ≥128)", s => Item(s).Kind = (ItemKind)128, s => (ulong)Item(s).Kind);
            yield return Case("ItemStack.ReservedBy", s => Item(s).ReservedBy = 4242, s => (ulong)Item(s).ReservedBy);
            yield return Case("ItemStack.Count", s => Item(s).Count = 6, s => (ulong)(uint)Item(s).Count);
            yield return Case("ItemStack.Count (above 2^24)", s => Item(s).Count = 5 + (1 << 24), s => (ulong)(uint)Item(s).Count);
            yield return Case("ItemStack.Pos.X", s => Item(s).Pos = new Int3(3, 1, 0), s => (ulong)Item(s).Pos.X);
            yield return Case("ItemStack.Pos.Y", s => Item(s).Pos = new Int3(2, 2, 0), s => (ulong)Item(s).Pos.Y);
            yield return Case("ItemStack.Pos.Z", s => Item(s).Pos = new Int3(2, 1, 1), s => (ulong)Item(s).Pos.Z);
            yield return Case("ItemStack.CarriedBy", s => Item(s).CarriedBy = 7, s => Item(s).CarriedBy);
            // W0-1b — saved at SaveWriter.cs:319, unfolded until now. It is corpse identity
            // (NeedsSystem.cs:200), read by the eulogy, the Chronicle and hosts/web.
            yield return Case("ItemStack.Label", s => Item(s).Label = "Vale", s => (ulong)Item(s).Label.Length);

            // --- Device fold (W0-1b adds the only field of it that was saved-but-unfolded) ---
            // MossBindings.cs:20-32 registers every adapter BY NAME, so a restore that renamed
            // one device would silently unbind every player MOSS program with no error at all.
            yield return Case("Device.Name", s => Dev(s).Name = "door_fore", s => (ulong)Dev(s).Name.Length);

            // --- W0-1b second pass: the four fields the package's own completeness claim
            // missed and its independent review found. All four are written by SaveWriter
            // (header :147, ROOM :218, DSLS :333-334) and were folded by nothing. ---
            // NextEntityId is live state, not derived: two sims identical in every entity
            // still hand out different ids at the next spawn, and every tie-break on the ship
            // resolves to entity store order.
            yield return Case("Simulation.NextEntityId",
                s => s.RestoreClock(s.TickCount, s.NextEntityId + 1), s => s.NextEntityId);
            // The anchor name is the MOSS ROOM NAMESPACE (`room.<name>`), so this is the
            // Device.Name argument applied to a different binding key. Note the mutation is a
            // RENAME IN PLACE, not SetAnchor("galley", …): SetAnchor matches on the name, so a
            // new name appends a second anchor and the row would then be passed by the anchor
            // COUNT alone — a tautology that survived this file's first draft (measured:
            // deleting the RoomAnchor.Name Combine left that version green).
            yield return Case("RoomAnchor.Name",
                s => s.Rooms.Anchors[0] = new RoomAnchor("hydra", s.Rooms.Anchors[0].Probe, s.Rooms.Anchors[0].Type),
                s => s.Rooms.Anchors[0].Name[4]);
            yield return Case("RoomAnchor list length",
                s => s.Rooms.SetAnchor("galley", new Int3(2, 1, 0), RoomType.Mess),
                s => (ulong)s.Rooms.Anchors.Count);
            // MOSS program sources are canonical sim state (Simulation.cs:171, TDD §4.5) —
            // the source text IS the program, not a label for it. Same tautology trap: SetScript
            // keys on TerminalId, so renaming a terminal has to go through the list directly or
            // the row is passed by Scripts.Count (measured: it was, in the first draft).
            yield return Case("ScriptEntry.TerminalId",
                s => s.Scripts[0] = new ScriptEntry("term_aft", s.Scripts[0].Source),
                s => s.Scripts[0].TerminalId[5]);
            yield return Case("ScriptEntry.Source",
                s => s.SetScript("term_main", "every 9s:\n  close(door_aft)\n"),
                s => (ulong)s.Scripts[0].Source.Length);
            yield return Case("Script list length",
                s => s.SetScript("term_aft", "every 5s:\n  open(door_aft)\n"), s => (ulong)s.Scripts.Count);
        }

        private static TestCaseData Case(string name, Action<Simulation> mutate, Func<Simulation, ulong> read) =>
            new TestCaseData(name, mutate, read).SetName("Field_MovesTheStateHash_" + Sanitize(name));

        private static string Sanitize(string s)
        {
            var chars = new char[s.Length];
            for (int i = 0; i < s.Length; i++)
                chars[i] = (s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9')
                    ? s[i] : '_';
            return new string(chars);
        }

        /// <summary>
        /// Every canonical field of the citizen and item folds moves StateHash when it —
        /// and only it — changes. Fails if a Combine call is dropped, or if two fields
        /// share bits (the mutated field's contribution vanishes into a neighbour's).
        /// </summary>
        [TestCaseSource(nameof(Fields))]
        public void Field_MovesTheStateHash(string field, Action<Simulation> mutate, Func<Simulation, ulong> read)
        {
            var a = Fixture();
            var b = Fixture();

            // Precondition 1: the harness really does build identical states.
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()),
                "precondition: twin fixtures must hash equal before any mutation");
            ulong before = read(b);

            mutate(b);

            // Precondition 2: the stimulus landed — this is not a no-op mutation.
            Assert.That(read(b), Is.Not.EqualTo(before), field + ": precondition — the mutation did not change the field");

            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                field + " is not folded into StateHash, or it aliases another field's bits");
        }

        // ------------------------------------------------------------------ the three aliases
        // Each builds an exact COLLISION PAIR under the pre-W0-1 packing: two distinct ship
        // states whose packed words were bit-for-bit equal.

        /// <summary>
        /// Pre-W0-1 the item word was <c>Id | Kind&lt;&lt;32 | Reserved&lt;&lt;39 | Count&lt;&lt;40</c>, so a kind of
        /// 128 set bit 39 — the same bit as ReservedForJob. "128 unreserved" and "kind 0
        /// reserved" were therefore the same hash. Named mutation: restore that expression.
        /// </summary>
        [Test]
        public void Aliased_ItemKindHighBit_IsNotTheSameBitAsReservedForJob()
        {
            var a = Fixture();
            var b = Fixture();
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins hash equal");

            Item(a).Kind = (ItemKind)128;   // old fold: sets bit 39
            Item(a).ReservedBy = 0;
            Item(b).Kind = (ItemKind)0;
            Item(b).ReservedBy = 1;         // old fold: a reserved stack set bit 39 too

            Assert.That(Item(a).Kind, Is.Not.EqualTo(Item(b).Kind), "precondition: the two states really differ");
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "ItemKind's high bit collides with the reservation bit in the item fold");
        }

        /// <summary>
        /// B-1 widened the item reservation from a bool to <c>ReservedBy</c> (a uint owner id). The
        /// old fold folded <c>ReservedForJob ? 1 : 0</c>, collapsing EVERY nonzero owner to the same
        /// 1UL — so "reserved by citizen 1" and "reserved by citizen 2" hashed EQUAL. That is an
        /// exact collision pair under the old pack: the canary was blind to WHO holds a claim on a
        /// shared tile, the precise question the owner id exists to answer. This pins that the full
        /// 32 bits fold, not merely the truthiness.
        /// </summary>
        [Test]
        public void Aliased_ReservedByOwnerId_IsNotCollapsedToASingleReservedBit()
        {
            var a = Fixture();
            var b = Fixture();
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins hash equal");

            Item(a).ReservedBy = 1;   // old bool fold: 1UL ("reserved")
            Item(b).ReservedBy = 2;   // old bool fold: 1UL too — the collision the uint fold breaks

            Assert.That(Item(a).ReservedBy, Is.Not.EqualTo(Item(b).ReservedBy), "precondition: distinct owners");
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "ReservedBy folds only its truthiness, collapsing distinct owner ids to one hash");
        }

        /// <summary>
        /// Pre-W0-1 <c>Count</c> was shifted left 40, keeping only its low 24 bits, so
        /// 5 and 5 + 2^24 units hashed identically. Named mutation: restore the item pack.
        /// </summary>
        [Test]
        public void Aliased_ItemCountAbove2Pow24_IsNotClippedToItsLow24Bits()
        {
            var a = Fixture();
            var b = Fixture();
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins hash equal");

            Item(a).Count = 5;
            Item(b).Count = 5 + (1 << 24);

            Assert.That(Item(a).Count, Is.Not.EqualTo(Item(b).Count), "precondition: the two states really differ");
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "ItemStack.Count is clipped to 24 bits in the item fold");
        }

        /// <summary>
        /// Pre-W0-1 the citizen word put JobWorkTicks at bits 16–47 and CarryingItemId at
        /// bits 32–63 — a 16-bit overlap. With CarryingItemId = 5 (bits 32 and 34 after the
        /// shift), a JobWorkTicks of 65,536 contributed only bit 32, which CarryingItemId
        /// already owned: "109 sim-minutes of work left, carrying stack 5" hashed the same
        /// as "no work left, carrying stack 5". Named mutation: restore the citizen pack.
        /// </summary>
        [Test]
        public void Aliased_JobWorkTicksAbove65535_DoesNotOverlapCarryingItemId()
        {
            var a = Fixture();
            var b = Fixture();
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins hash equal");

            Cit(a).CarryingItemId = 5;
            Cit(a).JobWorkTicks = 65536;   // old fold: 65536 << 16 == bit 32, already set by 5 << 32
            Cit(b).CarryingItemId = 5;
            Cit(b).JobWorkTicks = 0;

            Assert.That(Cit(a).JobWorkTicks, Is.Not.EqualTo(Cit(b).JobWorkTicks), "precondition: the two states really differ");
            Assert.That(Cit(a).CarryingItemId, Is.EqualTo(Cit(b).CarryingItemId), "precondition: only JobWorkTicks differs");
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "JobWorkTicks above 65,535 is swallowed by CarryingItemId in the citizen fold");
        }

        /// <summary>
        /// The STRING analogue of the path-boundary pair below, and the reason this file no
        /// longer claims such a pair is impossible. <c>Device.Name</c> is the LAST value in each
        /// device's block, so two adjacent device names sit back to back in the fold with only
        /// the second device's ten leading values between them — and every one of those ten is
        /// freely settable to a small integer. Set them all to 1 and let a single code unit
        /// U+0001 move from device 0's name to device 1's: without the length prefix both states
        /// fold the identical run of ten 1s and hash EQUAL.
        ///
        /// (The package that added the string fold argued no such pair was constructible. That
        /// reasoning was drawn from the CITIZEN fold, where the flag word sits between adjacent
        /// names and cannot take an arbitrary value, and it was wrongly generalised to all three
        /// name sites. The device fold has no such barrier. Recorded because the mistake is the
        /// interesting part: "I could not construct it" is not "it cannot be constructed", and
        /// W0-1's own lesson is that only a collision pair finds an alias.)
        ///
        /// NAMED MUTATION: delete <c>ulong h = Combine(accumulator, (ulong)value.Length);</c>
        /// from <c>XxHash64.Combine(ulong, string)</c> and start from <c>accumulator</c> ⇒ this
        /// test fails. Measured on the shipped fold the two states hash differently; under the
        /// chars-only mutant they are bit-for-bit equal.
        /// </summary>
        [Test]
        public void Aliased_NameCharactersCannotShuffleAcrossTwoDevices_WhichIsWhyLengthIsFolded()
        {
            var a = DeviceNameBoundaryFixture(codeUnitOnTheFirstName: true);
            var b = DeviceNameBoundaryFixture(codeUnitOnTheFirstName: false);

            // Preconditions: same devices, same everything, one code unit on the other name.
            Assert.That(a.Devices.Count, Is.EqualTo(b.Devices.Count), "precondition: same device count");
            Assert.That(a.Devices.Items[0].Name, Is.Not.EqualTo(b.Devices.Items[0].Name),
                "precondition: the two states really differ");
            Assert.That(a.Devices.Items[0].Name + a.Devices.Items[1].Name,
                Is.EqualTo(b.Devices.Items[0].Name + b.Devices.Items[1].Name),
                "precondition: the CONCATENATION is identical — only the boundary moved");

            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "a code unit moved between two device names without moving the hash — the string " +
                "fold is not prefix-free, so adjacent names alias across their boundary");
        }

        /// <summary>Two adjacent devices whose chars-only folds are identical; see the test above
        /// for why device 1's ten leading values all have to be 1.</summary>
        private static Simulation DeviceNameBoundaryFixture(bool codeUnitOnTheFirstName)
        {
            const string One = "\u0001"; // one code unit whose fold value is 1
            var sim = Fixture();
            Dev(sim).Name = codeUnitOnTheFirstName ? One : "";

            var second = sim.AddDevice(DeviceKind.AirVent, new Int3(1, 1, 0), codeUnitOnTheFirstName ? "" : One);
            second.Id = 1;                                        // fold value 1
            second.Pos = new Int3(1, 0, 0);                       // Pack -> 1
            second.Kind = (DeviceKind)1;                          // state word -> 1 (flags false, ids 0, Rate 0f)
            second.IsOpen = false;
            second.IsLocked = false;
            second.Powered = false;
            second.NetworkId = 0;
            second.Rate = 0f;
            second.LockOwner = 1;
            second.StoredKWh = BitConverter.Int32BitsToSingle(1);   // float bits -> 1
            second.StoredLiters = BitConverter.Int32BitsToSingle(1);
            second.Progress = BitConverter.Int32BitsToSingle(1);
            second.FluidNetworkId = 1;
            second.Condition = BitConverter.Int32BitsToSingle(1);
            return sim;
        }

        /// <summary>
        /// <c>Path</c> is the fold's only variable-length member, and its COUNT is folded before
        /// its entries. This is the exact collision pair that rule defends: two ship states that
        /// differ in WHICH citizen owns a path tile, but whose count-free fold call sequences are
        /// element-for-element identical, so a fold without the length prefix hashes them EQUAL.
        ///
        /// Construction (see <c>Simulation.StateHash</c>'s per-citizen order). Crew member 0
        /// carries [P, Q] in state A and [P] in state B; crew member 1 carries [] in A and [Q] in
        /// B. Dropping the count, A folds <c>… P, Q, i0, m0, k0, F1…, i1, m1, k1</c> and B folds
        /// <c>… P, i0, m0, k0, F1…, Q, i1, m1, k1</c> — the same length, shifted by one. They
        /// coincide exactly when Q, crew 0's three trailing scalars and every value of crew 1's
        /// prefix F1 are the same number, so the pair is built with all of them = 0: Q is the
        /// origin tile, crew 0's PathIndex/MoveCooldown/IdleCooldown are 0, and crew 1 is zeroed
        /// field for field (Id, position, needs, flags, job, <c>Health</c>/<c>Morale</c> = 0f,
        /// empty name — an empty string folds exactly one value, its length 0).
        ///
        /// NAMED MUTATION: delete <c>h = XxHash64.Combine(h, (ulong)path.Count);</c> from the
        /// citizen loop ⇒ this test fails. Scope matters and both numbers are measured: it is
        /// the ONLY case in this file that reddens (1 of 61), and **3 of 662 full-suite** — it
        /// plus both tick-3000 goldens, because deleting a <c>Combine</c> changes the
        /// accumulator chain whether or not it changes what the fold can distinguish. The
        /// <c>Citizen.Path (length)</c> table row does not catch it — appending a tile also
        /// appends a Combine, so single-field mutation cannot see a boundary alias, only a
        /// collision pair can. Same lesson as the three W0-1 <c>Aliased_</c> tests.
        /// </summary>
        [Test]
        public void Aliased_PathTilesCannotShuffleAcrossTwoCitizens_WhichIsWhyTheCountIsFoldedFirst()
        {
            var a = TwoCrewPathFixture(firstCrewCarriesBothTiles: true);
            var b = TwoCrewPathFixture(firstCrewCarriesBothTiles: false);

            // Preconditions: the two states really are different, and differ ONLY in who owns
            // the tile — same multiset of path tiles, same crew, same everything else.
            Assert.That(a.Citizens.Items[0].Path.Count, Is.EqualTo(2), "precondition: crew 0 carries both tiles in A");
            Assert.That(b.Citizens.Items[0].Path.Count, Is.EqualTo(1), "precondition: crew 0 carries one tile in B");
            Assert.That(a.Citizens.Items[1].Path.Count, Is.EqualTo(0), "precondition: crew 1 carries none in A");
            Assert.That(b.Citizens.Items[1].Path.Count, Is.EqualTo(1), "precondition: crew 1 carries the other tile in B");
            Assert.That(a.Citizens.Items[0].Path[0], Is.EqualTo(b.Citizens.Items[0].Path[0]),
                "precondition: the shared leading tile is identical");
            Assert.That(a.Citizens.Items[0].Path[1], Is.EqualTo(b.Citizens.Items[1].Path[0]),
                "precondition: the moved tile is the same tile, just on the other crew member");

            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "a path tile moved between two crew members without moving the hash — Path.Count " +
                "is not folded before Path's entries, so adjacent paths alias across their boundary");
        }

        /// <summary>Two crew whose count-free folds are shift-identical; see the test above for
        /// why every field of crew 1 has to be zero.</summary>
        private static Simulation TwoCrewPathFixture(bool firstCrewCarriesBothTiles)
        {
            var sim = Fixture();
            var lead = Cit(sim);
            lead.Path.Clear();
            lead.Path.Add(new Int3(2, 1, 0));                                  // P — the shared tile
            if (firstCrewCarriesBothTiles) lead.Path.Add(new Int3(0, 0, 0));   // Q — folds to 0
            lead.PathIndex = 0;
            lead.MoveCooldown = 0;
            lead.IdleCooldown = 0;

            var second = sim.AddCitizen("", new Int3(0, 0, 0));
            second.Id = 0;
            second.PrevPos = new Int3(0, 0, 0);
            second.JobTarget = new Int3(0, 0, 0);
            second.JobKind = JobKind.None;
            second.RevealsFog = false;
            second.HoldPosition = false;
            second.AutoWander = false;
            second.Dead = false;
            second.Health = 0f;
            second.Morale = 0f;
            second.Suffocation = 0f;
            second.Hunger = 0f;
            second.Thirst = 0f;
            second.Fatigue = 0f;
            second.Mood = 0f;
            second.Faction = 0;
            second.Archetype = 0;
            second.JobWorkTicks = 0;
            second.CarryingItemId = 0;
            second.ReservedItemId = 0;
            if (!firstCrewCarriesBothTiles) second.Path.Add(new Int3(0, 0, 0)); // Q lands here instead
            second.PathIndex = 0;
            second.MoveCooldown = 0;
            second.IdleCooldown = 0;
            return sim;
        }

        /// <summary>
        /// The string fold is PREFIX-FREE: folding "ab" is not the same as folding "a" then "b",
        /// because the length goes in first. Six saved strings sit in the fold
        /// (<c>Citizen.Name</c>, <c>ItemStack.Label</c>, <c>Device.Name</c>,
        /// <c>RoomAnchor.Name</c>, <c>ScriptEntry.TerminalId</c>/<c>.Source</c>), several of them
        /// adjacent, so without the length a character could migrate across the boundary between
        /// two of them unseen. This test pins the property at the HELPER — cheap, direct, and it
        /// is the level at which the property is actually true for every caller.
        ///
        /// The end-to-end pair is
        /// <see cref="Aliased_NameCharactersCannotShuffleAcrossTwoDevices_WhichIsWhyLengthIsFolded"/>.
        /// An earlier version of this comment claimed no such pair was constructible; that was
        /// wrong — the reasoning came from the CITIZEN fold, where the flag word sits between
        /// adjacent names, and was over-generalised. The device fold has no such barrier.
        ///
        /// Also pins <c>null</c> ≠ <c>""</c> — the save format writes both as <c>""</c>, but a
        /// <c>null</c> reaching the fold must not silently equal an empty name.
        ///
        /// NAMED MUTATION: delete <c>ulong h = Combine(accumulator, (ulong)value.Length);</c>
        /// from <c>XxHash64.Combine(ulong, string)</c> (start from <c>accumulator</c>) ⇒ the
        /// prefix-free assertion fails. Measured scope: 2 of 61 here (this test and the device
        /// collision pair), **4 of 662 full-suite** — those two plus both tick-3000 goldens. An
        /// earlier version of this comment claimed the shipped hashes would be untouched; that
        /// confused collision-freedom with fold-value stability. Deleting a <c>Combine</c> moves
        /// every hash it feeds, whether or not any state was ambiguous.
        /// </summary>
        [Test]
        public void StringFold_IsPrefixFree_AndSeparatesNullFromEmpty()
        {
            ulong ab = XxHash64.Combine(0, "ab");
            ulong aThenB = XxHash64.Combine(XxHash64.Combine(0, "a"), "b");
            Assert.That(ab, Is.Not.EqualTo(aThenB),
                "the string fold is not prefix-free — a character can migrate between two " +
                "adjacent names (Citizen.Name / ItemStack.Label / Device.Name) unseen");

            Assert.That(XxHash64.Combine(0, (string)null), Is.Not.EqualTo(XxHash64.Combine(0, "")),
                "null and the empty string fold to the same value");

            // And the fold really is ordinal + order-sensitive, not a set of characters.
            Assert.That(XxHash64.Combine(0, "ab"), Is.Not.EqualTo(XxHash64.Combine(0, "ba")),
                "the string fold ignores character order");
        }

        // ------------------------------------------------------------------ allocation

        /// <summary>
        /// The fold itself allocates NOTHING — every <c>Combine</c> is a <c>stackalloc</c>, and
        /// the W0-1b string and path folds keep that (string indexing copies nothing; the path
        /// loop indexes a <c>List&lt;Int3&gt;</c> by position, never enumerates it).
        ///
        /// The name says what this does NOT cover, and it is the whole reason the test exists.
        /// <c>StateHash()</c> as a whole is NOT allocation-free on a populated ship: with a
        /// <c>MemorySystem</c> holding minds, <c>MemorySystem.StateChecksum()</c> allocates
        /// <b>512 B per call</b> (measured on the slice: 102,400 B over 200 calls, bisected to
        /// the "Memory" system by name, identical before and after W0-1b — pre-existing, and not
        /// this package's to fix). It is content-dependent: the same slice with empty minds
        /// allocates 0, which is why a fixture-level test cannot see it and why this one is
        /// scoped to the fold rather than to <c>StateHash</c>. A comment in
        /// <c>Simulation.StateHash</c> claimed a flat "zero bytes"; it was wrong, and it
        /// survived into a commit precisely because no test measured it. Now one does.
        ///
        /// Preconditions assert the measured path was actually walked (§5.2.3): a zero-alloc
        /// result over a fold that visited no citizen, no string and no path proves nothing.
        ///
        /// NAMED MUTATION: in <c>XxHash64.Combine(ulong, string)</c> fold
        /// <c>Encoding.UTF8.GetBytes(value)</c> instead of indexing the code units — the
        /// obvious-looking implementation this file's helper deliberately avoids ⇒ this test
        /// fails with roughly 32 B per string per call. Equivalently, <c>foreach (var t in
        /// path)</c> instead of the indexed loop boxes the list enumerator.
        /// </summary>
        [Test]
        public void Fold_AllocatesNothing_OnASimWithoutTheMemorySystem()
        {
            var sim = Fixture();

            // Precondition: the fold really does walk everything W0-1b added.
            Assert.That(sim.Citizens.Count, Is.GreaterThan(0), "precondition: a citizen to fold");
            Assert.That(Cit(sim).Path.Count, Is.GreaterThan(0), "precondition: a non-empty path to fold");
            Assert.That(Cit(sim).Name.Length, Is.GreaterThan(0), "precondition: a non-empty name to fold");
            Assert.That(Item(sim).Label.Length, Is.GreaterThan(0), "precondition: a non-empty item label");
            Assert.That(Dev(sim).Name.Length, Is.GreaterThan(0), "precondition: a non-empty device name");
            Assert.That(sim.Rooms.Anchors.Count, Is.GreaterThan(0), "precondition: an anchor name to fold");
            Assert.That(sim.Scripts.Count, Is.GreaterThan(0), "precondition: a MOSS source to fold");
            foreach (var s in sim.Systems)
                Assert.That(s, Is.Not.InstanceOf<IStatefulSystem>(),
                    "precondition: no stateful system — this test measures the FOLD, not MEMS");

            ulong sink = 0;
            for (int i = 0; i < 200; i++) sink ^= sim.StateHash(); // warm-up: JIT, first-call paths

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 1000; i++) sink ^= sim.StateHash();
            long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(allocated, Is.EqualTo(0),
                $"StateHash allocated {allocated} bytes over 1000 calls (sink {sink}) — the fold " +
                "must stay allocation-free; check the string and path folds first");
        }

        // ------------------------------------------------------------------ order stability

        /// <summary>
        /// The restructured fold is still a chained, STORE-ORDERED fold: hashing twice in a
        /// row is idempotent, an identically-built twin agrees, and two sims holding the same
        /// two stacks in the opposite insertion order hash DIFFERENTLY. That last clause is
        /// the guard for ECONOMY-PLAN §4.1/§4.3 — entity-store order is the hash order, and
        /// any future "canonicalise the fold order" or set-like accumulation would silently
        /// hide a real state difference.
        /// Named mutation: in the item loop of <c>Simulation.StateHash</c>, replace all six
        /// chained calls with an order-independent accumulation
        /// (<c>h ^= XxHash64.Combine(0, …)</c>) ⇒ the insertion-order clause fails.
        /// LIMIT: it proves the fold is order-SENSITIVE, not that any particular order is the
        /// right one; the pinned scenario/golden hashes are what pin the specific order.
        /// </summary>
        [Test]
        public void Fold_IsIdempotent_AndReadsEntityStoreOrder()
        {
            var a = Fixture();
            ulong first = a.StateHash();
            Assert.That(a.StateHash(), Is.EqualTo(first), "StateHash is not idempotent — the fold mutates state");
            Assert.That(Fixture().StateHash(), Is.EqualTo(first), "same build order must hash equal");

            var forward = Fixture();
            var fParts = forward.AddItem(ItemKind.Parts, 2, new Int3(1, 1, 0));
            var fPotato = forward.AddItem(ItemKind.Potato, 9, new Int3(3, 1, 0));

            var reversed = Fixture();
            var rPotato = reversed.AddItem(ItemKind.Potato, 9, new Int3(3, 1, 0));
            var rParts = reversed.AddItem(ItemKind.Parts, 2, new Int3(1, 1, 0));
            // Ids follow insertion order, so re-pin them: the two sims must now hold the
            // IDENTICAL set of item states and differ ONLY in store position.
            rParts.Id = fParts.Id;
            rPotato.Id = fPotato.Id;

            Assert.That(forward.Items.Count, Is.EqualTo(reversed.Items.Count), "precondition: same multiset of stacks");
            Assert.That(forward.Items.Items[1].Kind, Is.Not.EqualTo(reversed.Items.Items[1].Kind),
                "precondition: the two stores really are in opposite order");
            Assert.That(rParts.Id, Is.EqualTo(fParts.Id), "precondition: the item states themselves are identical");
            Assert.That(reversed.StateHash(), Is.Not.EqualTo(forward.StateHash()),
                "the fold has stopped reading entity-store order");
        }

        private static ulong Bits(float v) => (ulong)(uint)BitConverter.SingleToInt32Bits(v);
    }
}
