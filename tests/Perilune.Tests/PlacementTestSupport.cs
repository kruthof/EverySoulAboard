using System.Linq;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>SETUP FOR TESTS WHOSE SUBJECT IS A DEVICE, NOT THE ACT OF PLACING ONE.</b>
    ///
    /// <para><b>WHY THIS FILE EXISTS.</b> The blueprint package (2026-08-05, the owner's *"after
    /// placing a new item, it should stay as a ghost until the pawn assembles it"*) made
    /// <see cref="PlaceDeviceCommand"/> ASYNCHRONOUS: it lays a <c>BuildKind.Device</c> site and the
    /// piece appears only when a builder runs <c>BuildSystem.Complete</c>. Twenty-nine call sites
    /// across eight test files used that command as a convenient way to GET A DEVICE ONTO A TILE —
    /// a commissioning test wants something to commission, a strip test wants something to strip —
    /// and every one of them would now be asserting against an empty tile.</para>
    ///
    /// <para>⛔ <b>THE HONEST FIX IS NOT "TICK UNTIL A PAWN TURNS UP".</b> That would make eight
    /// unrelated files depend on pathing, work priorities, air and the job dispatcher — a flake
    /// surface for tests that are about none of those, and the 9th trap shape (an instrument
    /// narrowed until it can no longer see its own subject) in reverse. It drives
    /// <see cref="BuildSystem.Complete"/> directly instead: the SAME entry point <c>BuildJobSource</c>
    /// calls when the Build job's work ticks reach zero, so the device is created by the shipping
    /// completion path rather than by a test-only spawn door.</para>
    ///
    /// <para>⚠️ <b>AND IT IS DELIBERATELY NOT <c>sim.AddDevice</c>.</b> That is the AUTHORING door,
    /// and a device authored onto a tile is a different object from one a player paid for and built:
    /// it keeps <c>Scriptable = true</c>, so a commissioning test set up with <c>AddDevice</c> would
    /// pass while measuring a device MOSS can already see — exactly the E0-6 distinction those tests
    /// exist to pin. Going through the command keeps the price, the whitelist, the tile rules,
    /// <c>Scriptable = false</c> and the facing.</para>
    ///
    /// <para>⛔ <b>WHAT IT MUST NOT BE USED FOR:</b> any test whose claim is about placement itself.
    /// <c>BlueprintTests</c> and <c>FurniturePlacementTests</c> drive the command directly and assert
    /// the intermediate state, because for them the blueprint IS the subject.</para>
    /// </summary>
    internal static class PlacementTestSupport
    {
        /// <summary>
        /// Lay the blueprint a player's press lays, then finish it as a builder would. Returns the
        /// device that now stands on the tile.
        ///
        /// <para>LOUD ON FAILURE, at both steps, because a silent no-op here would make the CALLER's
        /// assertions vacuous rather than red — the failure mode this whole package is about. The
        /// two messages name the two different causes (nothing was designated / nothing was built)
        /// so a caller never has to guess which half went wrong.</para>
        /// </summary>
        internal static Device PlaceAndBuild(this Simulation sim, DeviceKind kind, Int3 pos, byte facing = 0)
        {
            sim.EnqueueCommand(new PlaceDeviceCommand(kind, pos, facing));
            sim.Tick();

            var build = sim.Build;
            Assert.IsNotNull(build,
                "PlaceAndBuild: this sim has no BuildSystem, so a placement can never complete and "
                + "every assertion the caller makes about the device would be vacuous");
            Assert.IsTrue(build.TryGet(pos, out _),
                $"PlaceAndBuild: no blueprint was laid at {pos.X},{pos.Y},{pos.Z} for {kind}. "
                + "PlaceDeviceCommand refuses for six reasons — unplaceable kind, out of bounds, "
                + "unwalkable, walled, occupied, or the ship could not pay the Parts price. Fund the "
                + "ship and pick a clear floor tile.");

            Assert.IsTrue(build.Complete(sim, pos, builderId: 0),
                $"PlaceAndBuild: the blueprint at {pos.X},{pos.Y},{pos.Z} would not complete.");
            Assert.IsTrue(sim.TryGetDeviceAt(pos, out var made),
                $"PlaceAndBuild: the completed build spawned no device at {pos.X},{pos.Y},{pos.Z}.");
            return made;
        }

        /// <summary>
        /// ⭐ THE SAME TWO STEPS **WITHOUT THE ASSERTIONS** — for a test whose subject is a REFUSAL,
        /// or a loop that runs until the ship can no longer pay. Returns true iff a device now
        /// stands on the tile.
        ///
        /// <para>⛔ IT EXISTS BECAUSE THE ASSERTING VERSION WAS APPLIED TO A NEGATIVE CASE AND
        /// BROKE IT — measured, not foreseen. The blueprint migration pass substituted
        /// <see cref="PlaceAndBuild"/> mechanically across eight files, and three of the tests it
        /// touched EXPECT the placement to fail (a claimed stack is not the ship's to spend; one
        /// Part short buys nothing; the place→strip drain terminates in a refusal). A helper that
        /// asserts success is exactly the wrong instrument there, and it reported the refusal those
        /// tests exist to prove as an error. Two helpers, two intents, named apart.</para>
        /// </summary>
        internal static bool TryPlaceAndBuild(this Simulation sim, DeviceKind kind, Int3 pos, byte facing = 0)
        {
            sim.EnqueueCommand(new PlaceDeviceCommand(kind, pos, facing));
            sim.Tick();
            var build = sim.Build;
            if (build == null || !build.TryGet(pos, out _)) return false;   // the press was refused
            build.Complete(sim, pos, builderId: 0);
            return sim.TryGetDeviceAt(pos, out _);
        }

        /// <summary>
        /// ⭐ FINISH THE BLUEPRINT STANDING AT <paramref name="pos"/>, as a builder would — for tests
        /// that placed through the HOST WIRE (<c>WebCommand(CmdKind.Place, …)</c>) rather than
        /// through the command, and whose subject is what happens to the DEVICE afterwards
        /// (commissioning, the `devices` channel, MOSS rebinding).
        ///
        /// <para>⚠️ IT TICKS NOTHING. The caller has already ticked to drain the host's inbox, and a
        /// helper that ticked again would break any twin-hash test by giving one side an extra
        /// tick — measured, on `PlacementOnePartShort`, whose twins diverged for exactly that
        /// reason when the asserting helper was applied to it.</para>
        /// </summary>
        internal static Device BuildTheBlueprintAt(this Simulation sim, Int3 pos)
        {
            var build = sim.Build;
            Assert.IsNotNull(build, "BuildTheBlueprintAt: this sim has no BuildSystem");
            Assert.IsTrue(build.TryGet(pos, out _),
                $"BuildTheBlueprintAt: no blueprint at {pos.X},{pos.Y},{pos.Z}. A host `place` message "
                + "lays a site; if none is here the message was refused (kind, tile, or the price).");
            Assert.IsTrue(build.Complete(sim, pos, builderId: 0), "the site would not complete");
            Assert.IsTrue(sim.TryGetDeviceAt(pos, out var made), "the completed build spawned nothing");
            return made;
        }

        /// <summary>Fund the ship with enough loose Parts for <paramref name="placements"/> pieces,
        /// dropped on <paramref name="at"/>. `PlaceDeviceCommand.Currency` rather than a literal, so
        /// a currency change moves this with it.</summary>
        internal static void FundPlacements(this Simulation sim, Int3 at, int placements = 1)
            => sim.AddItem(PlaceDeviceCommand.Currency, sim.Defs.Build.DevicePlaceCost * placements, at);
    }
}
