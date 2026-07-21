using System.Collections.Generic;

namespace Perilune.Llm
{
    /// <summary>
    /// The three service classes of backend work (LLM_CITIZENS.md §10). Strict order:
    /// a live dialogue turn always drains before a summary, which drains before any
    /// background job.
    /// </summary>
    public enum LlmPriority
    {
        /// <summary>P0 — the active conversation turn. At most one in flight at a time.</summary>
        Dialogue = 0,
        /// <summary>P1 — conversation-end summaries.</summary>
        Summary = 1,
        /// <summary>P2 — compaction / enrichment / social flavor; dispatched only when idle.</summary>
        Background = 2,
    }

    /// <summary>One unit of queued backend work: a citizen turn to run when dequeued.</summary>
    public sealed class LlmRequest
    {
        public uint CitizenId { get; }
        public string PlayerText { get; }
        public LlmPriority Priority { get; }

        public LlmRequest(uint citizenId, string playerText, LlmPriority priority)
        {
            CitizenId = citizenId;
            PlayerText = playerText ?? string.Empty;
            Priority = priority;
        }
    }

    /// <summary>
    /// Priority scaffolding for async backend work (§10). The live async dispatcher
    /// arrives at P2; the contract it must preserve is fixed here now: three priority
    /// classes, strict ordering across them, FIFO within one, and "background only when
    /// no foreground work is queued". The implementation is deliberately a simple
    /// three-lane FIFO — the interface, not the internals, is the deliverable. Fully
    /// deterministic: no wall clock, no Random; dequeue order is a pure function of the
    /// enqueue sequence.
    /// </summary>
    public sealed class LlmRequestQueue
    {
        private readonly Queue<LlmRequest>[] _lanes =
        {
            new Queue<LlmRequest>(), // Dialogue
            new Queue<LlmRequest>(), // Summary
            new Queue<LlmRequest>(), // Background
        };

        public int Count { get; private set; }

        /// <summary>Doc §10: background (P2) work only dispatches when no dialogue/summary is queued.</summary>
        public bool HasForegroundWork => _lanes[0].Count > 0 || _lanes[1].Count > 0;

        public void Enqueue(LlmRequest request)
        {
            if (request == null) return;
            _lanes[(int)request.Priority].Enqueue(request);
            Count++;
        }

        /// <summary>Highest-priority request first; within a priority, arrival order.</summary>
        public bool TryDequeue(out LlmRequest request)
        {
            for (int lane = 0; lane < _lanes.Length; lane++)
            {
                if (_lanes[lane].Count > 0)
                {
                    request = _lanes[lane].Dequeue();
                    Count--;
                    return true;
                }
            }
            request = null;
            return false;
        }
    }
}
