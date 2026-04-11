using System;

namespace SETUE
{
    public static class RenderPhasesRunner
    {
        public static void Run()
        {
            Console.WriteLine("[RenderPhasesRunner] Run() started");
            foreach (var phase in RenderPhases.Phases)
            {
                if (!phase.Enabled) continue;
                Console.WriteLine($"[RenderPhasesRunner] Executing phase: {phase.CommandName}");
                RenderDispatcher.Execute(phase.CommandName, phase.PipelineId);
            }
            Console.WriteLine("[RenderPhasesRunner] Run() finished");
        }
    }
}
