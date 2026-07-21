using System;
using System.Collections.Generic;
using System.IO;
using Moonbase.Sim;

namespace Moonbase.Dsl
{
    /// <summary>
    /// Host-side loader for designer rules (SimDefs/rules/*.moss). Lives here so Unity's
    /// Bootstrap, ScenarioRunner and the TUI share ONE copy (Sim.Core stays file-IO-free;
    /// hosts own the IO and this is their shared helper). Fail-soft throughout: an
    /// unreadable file warns and is skipped, never aborts a boot.
    /// </summary>
    public static class RulesLoader
    {
        /// <summary>Ordinal-sorted rules/*.moss under <paramref name="defsDir"/>; rule
        /// name = filename without extension. Missing/null dir ⇒ empty list.</summary>
        public static List<(string name, string source)> Load(string defsDir, List<string> problems)
        {
            var rules = new List<(string name, string source)>();
            if (defsDir == null) return rules;
            string rulesDir = Path.Combine(defsDir, "rules");
            if (!Directory.Exists(rulesDir)) return rules;

            string[] paths = Directory.GetFiles(rulesDir, "*.moss");
            Array.Sort(paths, StringComparer.Ordinal);
            foreach (var path in paths)
            {
                try { rules.Add((Path.GetFileNameWithoutExtension(path), File.ReadAllText(path))); }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                {
                    problems.Add($"rules/{Path.GetFileName(path)}: unreadable ({e.GetType().Name}), rule skipped");
                }
            }
            return rules;
        }

        /// <summary>The rule system for a defs graph, or null when it carries no rules —
        /// a rules-absent stack must stay byte-identical to a pre-rules build.</summary>
        public static ISimSystem CreateSystem(SimDefs defs, DeviceRegistry registry) =>
            defs.Rules != null && defs.Rules.Length > 0 ? new DesignerRuleSystem(registry) : null;
    }
}
