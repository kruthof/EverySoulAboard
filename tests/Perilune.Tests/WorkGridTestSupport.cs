using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ <b>M2-2 — WHY DOZENS OF TESTS IN THIS PROJECT NOW SAY <c>GiveAllWork()</c> OUT LOUD.</b>
    ///
    /// <para>OD-H made every work type boot <b>off</b> and M2-2 made the sim READ that grid, so a
    /// crew member who has never been given an order takes no job of any kind — which is the whole
    /// point (OD-G: the pawn boots idle and waiting, and the player's first act is an order). Every
    /// test whose subject is what a crew member DOES with work she has been given must therefore
    /// say so, in its own fixture.</para>
    ///
    /// <para>⛔ <b>THIS IS DELIBERATELY NOT A DEFAULT ANYWHERE.</b> It would have been one line to
    /// make <c>Simulation.AddCitizen</c> enable everything for tests, or to author the fixture
    /// ships all-on — and OD-I settled that: <i>one rule, OFF everywhere, no authored exception</i>.
    /// A test helper that quietly re-enabled work would put the shipped default and the tested
    /// default out of step, which is the configuration under which a whole suite goes green against
    /// behaviour no player ever sees.</para>
    ///
    /// <para>⚠️ <b>DO NOT USE THIS IN A TEST WHOSE SUBJECT IS THE BOOT STATE.</b>
    /// <c>WorkTypeVetoTests</c> deliberately does not call it: its legs set the ONE bit under test
    /// and leave the rest at their shipped value, because a leg that starts from an all-on grid is
    /// measuring a state no new game is ever in.</para>
    /// </summary>
    public static class WorkGridTestSupport
    {
        /// <summary>Switch every work type on for this crew member at the highest manual priority —
        /// the state a player reaches by filling in the WORK tab. A loop over
        /// <see cref="WorkPriority.WorkTypeCount"/>, so a seventh work type is covered the day it
        /// exists rather than silently left off in every fixture at once.</summary>
        public static Citizen GiveAllWork(this Citizen c)
        {
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                c.SetWorkPriority((WorkType)t, WorkPriority.Highest);
            return c;
        }

        /// <summary>As <see cref="GiveAllWork(Citizen)"/>, for every crew member currently aboard.
        /// ⚠️ It applies to the crew that exist WHEN IT IS CALLED — a fixture that adds crew
        /// afterwards must call it again (or use the per-citizen form), and several do.</summary>
        public static Simulation GiveAllCrewAllWork(this Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++) citizens[i].GiveAllWork();
            return sim;
        }
    }
}
