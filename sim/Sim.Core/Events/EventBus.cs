using System;
using System.Collections.Generic;

namespace Moonbase.Sim
{
    public interface ISimEvent { }

    /// <summary>
    /// Typed, double-buffered, deterministic event bus. Systems publish into the
    /// current-tick buffer and read the *previous* tick's buffer — no callbacks,
    /// no subscription order hazards. Buffers swap at tick end.
    /// </summary>
    public sealed class EventBus
    {
        private interface IChannel { void Swap(); }

        private sealed class Channel<T> : IChannel where T : struct, ISimEvent
        {
            private T[] _current = new T[16];
            private T[] _previous = new T[16];
            private int _currentCount;
            private int _previousCount;

            public void Publish(in T e)
            {
                if (_currentCount == _current.Length) Array.Resize(ref _current, _current.Length * 2);
                _current[_currentCount++] = e;
            }

            public ReadOnlySpan<T> Read() => new ReadOnlySpan<T>(_previous, 0, _previousCount);

            public void Swap()
            {
                (_current, _previous) = (_previous, _current);
                _previousCount = _currentCount;
                _currentCount = 0;
            }
        }

        private readonly Dictionary<Type, IChannel> _byType = new Dictionary<Type, IChannel>();
        private readonly List<IChannel> _channels = new List<IChannel>(); // deterministic swap order

        public void Publish<T>(in T e) where T : struct, ISimEvent => GetChannel<T>().Publish(in e);

        /// <summary>Events published during the previous tick.</summary>
        public ReadOnlySpan<T> Read<T>() where T : struct, ISimEvent => GetChannel<T>().Read();

        internal void SwapBuffers()
        {
            for (int i = 0; i < _channels.Count; i++) _channels[i].Swap();
        }

        private Channel<T> GetChannel<T>() where T : struct, ISimEvent
        {
            if (_byType.TryGetValue(typeof(T), out var channel)) return (Channel<T>)channel;
            var created = new Channel<T>();
            _byType.Add(typeof(T), created);
            _channels.Add(created);
            return created;
        }
    }
}
