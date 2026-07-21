using System;
using System.Collections.Generic;

namespace Moonbase.Dsl
{
    /// <summary>
    /// Anything MOSS can read from or command: rooms, valves, doors, pumps, ...
    /// Implementations must not throw; failures are reported via the return value.
    /// </summary>
    public interface IScriptable
    {
        /// <summary>Read a property ("o2", "pressure", "open", ...). Names arrive lowercased.</summary>
        bool TryGetProperty(string name, out DslValue value);

        /// <summary>
        /// Invoke a verb ("open", "close", "set", "lock", ...). Only args[0..argCount)
        /// are valid; the array is a reused buffer — copy values, never keep the array.
        /// On failure return false and set <paramref name="error"/>.
        /// </summary>
        bool TryInvoke(string verb, DslValue[] args, int argCount, out string error);
    }

    /// <summary>
    /// Name -&gt; device lookup for MOSS programs. Names are lowercased internally
    /// (MOSS identifiers are case-insensitive). Registering an existing name replaces it.
    /// </summary>
    public sealed class DeviceRegistry
    {
        private readonly Dictionary<string, IScriptable> _devices = new Dictionary<string, IScriptable>();

        public void Register(string name, IScriptable target)
        {
            if (name == null) throw new ArgumentNullException(nameof(name));
            if (target == null) throw new ArgumentNullException(nameof(target));
            _devices[Normalize(name)] = target;
        }

        public void Unregister(string name)
        {
            if (name != null) _devices.Remove(Normalize(name));
        }

        public bool TryResolve(string name, out IScriptable target)
        {
            if (name == null) { target = null; return false; }
            return _devices.TryGetValue(Normalize(name), out target);
        }

        /// <summary>Allocation-free for already-lowercase names (the compiler lowercases identifiers).</summary>
        private static string Normalize(string name)
        {
            for (int i = 0; i < name.Length; i++)
            {
                char c = name[i];
                if (c >= 'A' && c <= 'Z') return name.ToLowerInvariant();
            }
            return name;
        }
    }
}
