using Perilune.Sim;

namespace Perilune.Dsl
{
    /// <summary>
    /// IScriptable adapters bridging MOSS to sim entities. Reads are immediate
    /// (current sim state); writes go through the command inbox and apply at the
    /// next tick boundary — scripts never mutate the sim directly.
    /// </summary>
    public sealed class DoorAdapter : IScriptable
    {
        private readonly Simulation _sim;
        private readonly uint _deviceId;

        public DoorAdapter(Simulation sim, Device device)
        {
            _sim = sim; _deviceId = device.Id;
        }

        public bool TryGetProperty(string name, out DslValue value)
        {
            value = default;
            if (!_sim.Devices.TryGet(_deviceId, out var d)) return false;
            switch (name)
            {
                case "open": value = DslValue.Boolean(d.IsOpen); return true;
                case "locked": value = DslValue.Boolean(d.IsLocked); return true;
                case "powered": value = DslValue.Boolean(d.Powered); return true;
                default: return false;
            }
        }

        public bool TryInvoke(string verb, DslValue[] args, int argCount, out string error)
        {
            error = null;
            switch (verb)
            {
                case "open": _sim.EnqueueCommand(new SetDoorStateCommand(_deviceId, open: true)); return true;
                case "close": _sim.EnqueueCommand(new SetDoorStateCommand(_deviceId, open: false)); return true;
                case "lock": _sim.EnqueueCommand(new SetDoorStateCommand(_deviceId, locked: true)); return true;
                case "unlock": _sim.EnqueueCommand(new SetDoorStateCommand(_deviceId, locked: false)); return true;
                default: error = $"door has no command '{verb}'"; return false;
            }
        }
    }

    /// <summary>Vents and scrubbers: open/close/set(rate, x).</summary>
    public sealed class UtilityDeviceAdapter : IScriptable
    {
        private readonly Simulation _sim;
        private readonly uint _deviceId;

        public UtilityDeviceAdapter(Simulation sim, Device device)
        {
            _sim = sim; _deviceId = device.Id;
        }

        public bool TryGetProperty(string name, out DslValue value)
        {
            value = default;
            if (!_sim.Devices.TryGet(_deviceId, out var d)) return false;
            switch (name)
            {
                case "open": value = DslValue.Boolean(d.IsOpen); return true;
                case "rate": value = DslValue.Number(d.Rate); return true;
                case "powered": value = DslValue.Boolean(d.Powered); return true;
                case "liters": value = DslValue.Number(d.StoredLiters); return true;
                case "charge": value = DslValue.Number(d.StoredKWh); return true;
                case "progress": value = DslValue.Number(d.Progress * 100.0); return true;
                default: return false;
            }
        }

        public bool TryInvoke(string verb, DslValue[] args, int argCount, out string error)
        {
            error = null;
            switch (verb)
            {
                case "open": _sim.EnqueueCommand(new SetDeviceStateCommand(_deviceId, open: true)); return true;
                case "close": _sim.EnqueueCommand(new SetDeviceStateCommand(_deviceId, open: false)); return true;
                case "set":
                {
                    // set(device.rate, value) arrives as verb "set", args ["rate", value|max|min]
                    if (argCount < 2 || args[0].Kind != DslKind.Str) { error = "set expects (property, value)"; return false; }
                    if (args[0].Str != "rate") { error = $"cannot set '{args[0].Str}'"; return false; }
                    float rate = args[1].Kind switch
                    {
                        DslKind.Number => (float)args[1].Num,
                        DslKind.Str when args[1].Str == "max" => 1f,
                        DslKind.Str when args[1].Str == "min" => 0f,
                        _ => -1f,
                    };
                    if (rate < 0f) { error = "set(rate, ...) expects a number, max or min"; return false; }
                    _sim.EnqueueCommand(new SetDeviceStateCommand(_deviceId, rate: rate));
                    return true;
                }
                default: error = $"device has no command '{verb}'"; return false;
            }
        }
    }

    /// <summary>
    /// Room sensor surface (hab1.o2 etc.). Probes by position so references stay
    /// valid across room recomputes. o2 in %, co2 in ppm, pressure in kPa, temp in C.
    /// </summary>
    public sealed class RoomAdapter : IScriptable
    {
        private readonly Simulation _sim;
        private readonly Int3 _probe;

        public RoomAdapter(Simulation sim, Int3 probeTile)
        {
            _sim = sim; _probe = probeTile;
        }

        public bool TryGetProperty(string name, out DslValue value)
        {
            value = default;
            var room = _sim.Rooms.RoomAt(_sim.World, _probe);
            switch (name)
            {
                case "o2": value = DslValue.Number(room.O2Fraction * 100.0); return true;
                case "co2": value = DslValue.Number(room.CO2Ppm); return true;
                case "pressure": value = DslValue.Number(room.PressureKPa); return true;
                case "temp": value = DslValue.Number(room.TemperatureK - 273.15); return true;
                default: return false;
            }
        }

        public bool TryInvoke(string verb, DslValue[] args, int argCount, out string error)
        {
            error = $"rooms have no commands ('{verb}')";
            return false;
        }
    }
}
