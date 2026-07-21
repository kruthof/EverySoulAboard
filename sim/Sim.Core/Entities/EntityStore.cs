using System.Collections.Generic;

namespace Moonbase.Sim
{
    public interface IEntity
    {
        uint Id { get; set; }
    }

    /// <summary>
    /// List for deterministic iteration + dictionary for lookup. Ids are assigned
    /// monotonically by the owning Simulation and never reused within a save.
    /// </summary>
    public sealed class EntityStore<T> where T : class, IEntity
    {
        public readonly List<T> Items = new List<T>();
        private readonly Dictionary<uint, T> _byId = new Dictionary<uint, T>();

        public int Count => Items.Count;

        internal void Add(T entity, uint id)
        {
            entity.Id = id;
            Items.Add(entity);
            _byId.Add(id, entity);
        }

        public bool TryGet(uint id, out T entity) => _byId.TryGetValue(id, out entity);

        public bool Remove(uint id)
        {
            if (!_byId.TryGetValue(id, out var entity)) return false;
            _byId.Remove(id);
            Items.Remove(entity);
            return true;
        }
    }
}
