using System;

namespace SETUE
{
    public static class RenderDispatcher
    {
        public static bool FrameRequested { get; set; } = false;

        public static void Execute(string commandName, string? pipelineId)
        {
            if (commandName == "Begin_Frame")
                FrameRequested = true;
        }
    }
}

