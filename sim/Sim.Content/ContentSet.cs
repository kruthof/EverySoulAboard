using System;
using System.Collections.Generic;
using System.Text;
using Perilune.Sim;

namespace Perilune.Content
{
    /// <summary>One pack's content as handed in by a host: manifest + text channels.
    /// (Hosts own IO; Sim.Content never sees a path.)</summary>
    public sealed class PackSource
    {
        public PackManifest Manifest;
        /// <summary>Tuning files, (fileName, text) — merged in pack order; DefsParser's
        /// sequential overlay makes later packs win per key.</summary>
        public readonly List<(string name, string text)> DefFiles = new List<(string name, string text)>();
        /// <summary>Designer rules, (ruleName, mossSource) — later packs REPLACE a
        /// same-named rule; final set is Ordinal-sorted by name (the RulesLoader
        /// contract, preserved so rule order stays canonical across packs).</summary>
        public readonly List<(string name, string source)> RuleFiles = new List<(string name, string source)>();
    }

    /// <summary>
    /// The load-order/merge core of the content-pack system (ARCHITECTURE; the DLC/mod
    /// substrate). Deterministic: dependencies first, Ordinal pack-id tiebreak, cycles
    /// and missing dependencies degrade fail-soft with problem lines — content never
    /// bricks a boot, exactly like a bad def line.
    /// </summary>
    public static class ContentSet
    {
        /// <summary>Resolve deterministic load order: topological by declared
        /// dependencies, Ordinal id order among ready packs (stable regardless of
        /// discovery order). Missing dependency → problem + pack loads anyway;
        /// cycle → problem + remaining packs appended in Ordinal id order.</summary>
        public static List<PackSource> ResolveOrder(IReadOnlyList<PackSource> packs, List<string> problems)
        {
            var byId = new SortedDictionary<string, PackSource>(StringComparer.Ordinal);
            for (int i = 0; i < packs.Count; i++)
            {
                var p = packs[i];
                if (p?.Manifest == null) continue;
                if (byId.ContainsKey(p.Manifest.Id))
                {
                    problems.Add("pack '" + p.Manifest.Id + "': duplicate id — later copy ignored");
                    continue;
                }
                byId.Add(p.Manifest.Id, p);
            }

            // Warn on absent dependencies ONCE, and topo-sort over present deps only
            // (an absent dep can't order us; the pack still loads, degraded).
            var presentDeps = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
            foreach (var kv in byId)
            {
                var effective = new List<string>();
                var deps = kv.Value.Manifest.Dependencies;
                for (int d = 0; d < deps.Count; d++)
                {
                    if (byId.ContainsKey(deps[d])) effective.Add(deps[d]);
                    else problems.Add("pack '" + kv.Key + "': missing dependency '" + deps[d] +
                                      "' — loading anyway (degraded)");
                }
                presentDeps.Add(kv.Key, effective);
            }

            var ordered = new List<PackSource>(byId.Count);
            var placed = new HashSet<string>(StringComparer.Ordinal);

            bool progressed = true;
            while (placed.Count < byId.Count && progressed)
            {
                progressed = false;
                foreach (var kv in byId) // SortedDictionary: Ordinal id order = deterministic
                {
                    if (placed.Contains(kv.Key)) continue;
                    bool ready = true;
                    var deps = presentDeps[kv.Key];
                    for (int d = 0; d < deps.Count; d++)
                        if (!placed.Contains(deps[d])) { ready = false; break; }
                    if (!ready) continue;
                    ordered.Add(kv.Value);
                    placed.Add(kv.Key);
                    progressed = true;
                }
            }

            if (placed.Count < byId.Count)
            {
                foreach (var kv in byId)
                {
                    if (placed.Contains(kv.Key)) continue;
                    problems.Add("pack '" + kv.Key + "': dependency cycle — appended in id order");
                    ordered.Add(kv.Value);
                }
            }
            return ordered;
        }

        /// <summary>Merge ordered packs into DefsParser-ready inputs. Def files
        /// concatenate in load order (sequential overlay = later pack wins per key);
        /// same-named rules are replaced by later packs, then Ordinal-sorted.</summary>
        public static (List<(string name, string text)> defFiles, List<(string name, string source)> ruleFiles)
            Merge(IReadOnlyList<PackSource> orderedPacks, List<string> problems)
        {
            var defs = new List<(string name, string text)>();
            var rulesByName = new SortedDictionary<string, string>(StringComparer.Ordinal);

            for (int i = 0; i < orderedPacks.Count; i++)
            {
                var p = orderedPacks[i];
                string id = p.Manifest.Id;
                for (int f = 0; f < p.DefFiles.Count; f++)
                    defs.Add((id + "/" + p.DefFiles[f].name, p.DefFiles[f].text));
                for (int r = 0; r < p.RuleFiles.Count; r++)
                {
                    string name = p.RuleFiles[r].name;
                    if (rulesByName.ContainsKey(name))
                        problems.Add("pack '" + id + "': rule '" + name + "' overrides an earlier pack's rule");
                    rulesByName[name] = p.RuleFiles[r].source;
                }
            }

            var rules = new List<(string name, string source)>(rulesByName.Count);
            foreach (var kv in rulesByName) rules.Add((kv.Key, kv.Value));
            return (defs, rules);
        }

        /// <summary>Resolve + merge + parse in one step: the SimDefs a sim built from
        /// these packs runs with. Equivalent to hand-feeding DefsParser the merged
        /// channels — proven by test against the core pack.</summary>
        public static SimDefs BuildDefs(IReadOnlyList<PackSource> packs, List<string> problems)
        {
            var ordered = ResolveOrder(packs, problems);
            var (defFiles, ruleFiles) = Merge(ordered, problems);
            return DefsParser.Parse(defFiles, ruleFiles, problems);
        }

        /// <summary>
        /// Identity fingerprint of the active pack set: ids, versions, and every
        /// channel's bytes, folded in load order. Recorded by saves (advisory, like
        /// the defs checksum) so "which content produced this state" is answerable.
        /// </summary>
        public static ulong Fingerprint(IReadOnlyList<PackSource> orderedPacks)
        {
            ulong h = 0x5041434BUL; // 'PACK'
            for (int i = 0; i < orderedPacks.Count; i++)
            {
                var p = orderedPacks[i];
                h = XxHash64.Hash(Encoding.UTF8.GetBytes(p.Manifest.Id ?? ""), h);
                h = XxHash64.Hash(Encoding.UTF8.GetBytes(p.Manifest.Version ?? ""), h);
                for (int f = 0; f < p.DefFiles.Count; f++)
                {
                    h = XxHash64.Hash(Encoding.UTF8.GetBytes(p.DefFiles[f].name ?? ""), h);
                    h = XxHash64.Hash(Encoding.UTF8.GetBytes(p.DefFiles[f].text ?? ""), h);
                }
                for (int r = 0; r < p.RuleFiles.Count; r++)
                {
                    h = XxHash64.Hash(Encoding.UTF8.GetBytes(p.RuleFiles[r].name ?? ""), h);
                    h = XxHash64.Hash(Encoding.UTF8.GetBytes(p.RuleFiles[r].source ?? ""), h);
                }
            }
            return h;
        }
    }
}
