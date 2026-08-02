namespace Perilune.Sim
{
    /// <summary>
    /// ⭐⭐ OD-O (M3-16) — <b>IS THIS DEVICE'S CONTROLLER BOARD DEAD?</b> The per-device gate that
    /// decides whether <see cref="SetDeviceStateCommand"/> may move a shutter, and the words the
    /// player is told when it may not.
    ///
    /// <para><b>THE OWNER'S DECISION, quoted (OD-O, <c>docs/ROADMAP.md</c> §5, 2026-07-31):</b>
    /// <i>"Let's make that a 'game' within MOSS, so the user has to do some simple programming to
    /// activate the vent — storyline could be that the easy turn-off switch does not work as the
    /// controller module is malfunctioning so we have to do a workaround."</i></para>
    ///
    /// <para>⛔ <b>THERE IS NO CALLER PRIVILEGE, AND THERE MUST NOT BE.</b>
    /// <c>UtilityDeviceAdapter.TryInvoke</c> (<c>sim/Sim.Dsl/DeviceAdapters.cs</c>) is reached
    /// IDENTICALLY by an installed program (<c>Interpreter</c>) and by the console prompt
    /// (<c>GameSession.Invoke</c>); the host's own header says its authority is <i>"INHERITED, not
    /// re-declared"</i>. A fault that let a program call <c>open()</c> while the console could not
    /// would be a permission invented from nothing, and the owner's sentence does not ask for one:
    /// <i>the switch is dead for everybody.</i> ⇒ <b><c>open</c>/<c>close</c> refuse for EVERY
    /// caller; <c>set(rate, …)</c> is ACCEPTED by every caller but does not HOLD</b> — the bleed,
    /// which lives in <c>AtmosphereSystem</c>'s device walk. The workaround is a different control
    /// driven in a loop, not the same control with better credentials.</para>
    ///
    /// <para>⛔ <b>THE SHIP GATE IS ASKED FIRST, THIS ONE SECOND</b> (M3-15's evaluation-order
    /// contract, restated in <c>GameSession.HandleMoss</c>'s header). <see cref="MossGate"/> is a
    /// property of the SHIP — <i>is any MOSS server live aboard?</i> — and this is a property of
    /// the TARGET. Both can be true at once, and a player on a dead-computer ship must be told
    /// MOSS IS OFFLINE rather than sent across the pressure frontier to look at a vent.</para>
    ///
    /// <para><b>A RULE, NOT A TUNABLE.</b> No instance state, no static mutable state, no def
    /// field, neither checksum — the <see cref="MossGate"/>/<c>ThawGate</c> precedent. The one
    /// piece of state it reads, <see cref="Device.Faulted"/>, is already hashed (bit 12 of the
    /// device state word) and already saved (DEVC v6).</para>
    ///
    /// <para><b>ZERO-ALLOC.</b> <see cref="BlocksActuation"/> is called from
    /// <see cref="SetDeviceStateCommand.Execute"/>, inside <c>Simulation.Tick</c>'s command drain:
    /// one field read, no loop, no string.</para>
    /// </summary>
    public static class DeviceFault
    {
        /// <summary>
        /// ⭐ <b>THE TERM.</b> A faulted device will not move its shutter for anybody.
        ///
        /// <para>⚠️ It deliberately asks NOTHING about power, condition, kind or caller. A faulted
        /// device that is also unpowered, or below its <c>fail</c> floor, is refused here for the
        /// board — and the shipped instance is neither of those things, which is the whole point:
        /// <c>vent_d1</c> is powered, operational and open, and still will not answer.</para>
        ///
        /// <para>Null-tolerant so a caller that failed to resolve a device gets "no fault" rather
        /// than an exception on the sim thread's command drain.</para>
        /// </summary>
        public static bool BlocksActuation(Device device) => device != null && device.Faulted;

        /// <summary>
        /// ⛔ <b>THE REFUSAL, IN WORDS — and it may never be a bare <c>return;</c>.</b> This repo
        /// has paid three owner reports for <i>invisible feedback is functional</i>; a switch that
        /// refuses silently and a switch that is broken are the same picture, and here they are
        /// nearly the same FACT, which is exactly why the sentence has to name the board.
        ///
        /// <para><b>REFUSE BY PREDICATE, REPORT BY PREDICATE.</b> <see cref="SetDeviceStateCommand"/>
        /// is the authority; <c>UtilityDeviceAdapter</c> asks THIS static for the sentence and does
        /// not re-derive the rule. Two surfaces render it and both already exist: the console's
        /// stream-2 error line (<c>GameSession.Invoke</c> upper-cases the adapter's error verbatim)
        /// and, inside a program, a <c>ScriptRuntime</c> runtime error plus an
        /// <c>AlarmRaisedEvent</c>. One rule, asked in two places.</para>
        ///
        /// <para>⚠️ <b>IT MUST NOT READ LIKE <see cref="MossGate.OfflineRefusal"/> OR
        /// <see cref="MossGate.NotCommissionedRefusal"/> OR THE THAW'S NoConsole SENTENCE.</b> Four
        /// predicates about four different facts reach the same console line; a player who cannot
        /// tell them apart repairs the wrong machine, on the wrong deck, which on this ship means
        /// crossing a pressure frontier for nothing. Pairwise distinctness — and distinct FIRST
        /// FOUR WORDS, not merely distinct strings — is pinned by
        /// <c>ThawGateTests.TheConsoleSentences_ArePairwiseDistinct</c>.</para>
        ///
        /// <para>A <c>const string</c> and not a composed one: it carries no number and names no
        /// device, so it needs no formatter and reaches a tick path without allocating. Naming the
        /// device was considered and refused — the console echoes the line the player typed
        /// immediately above the refusal, so the target is already on screen.</para>
        /// </summary>
        public const string Refusal = "CONTROLLER FAULT — BOARD UNRESPONSIVE";
    }
}
