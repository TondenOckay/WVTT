using System;
using System.IO;
using System.Collections.Generic;

namespace SETUE
{
    public static class Render
    {
        public static float ClearR     { get; private set; } = 0.1f;
        public static float ClearG     { get; private set; } = 0.1f;
        public static float ClearB     { get; private set; } = 0.15f;
        public static bool  VSync      { get; private set; } = true;
        public static int   TargetFps  { get; private set; } = 60;
        public static float DepthClear { get; private set; } = 1.0f;

        public static void Load()
        {
            string path = "Render Engine/Render.csv";
            if (!File.Exists(path)) { Console.WriteLine($"[Render] Missing {path}"); return; }
            var lines = File.ReadAllLines(path);
            if (lines.Length < 2) return;
            var headers = lines[0].Split(',');
            var values  = lines[1].Split(',');
            var row = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < headers.Length && i < values.Length; i++)
                row[headers[i].Trim()] = values[i].Trim();

            if (row.TryGetValue("clear_r",    out var cr))  ClearR     = float.Parse(cr);
            if (row.TryGetValue("clear_g",    out var cg))  ClearG     = float.Parse(cg);
            if (row.TryGetValue("clear_b",    out var cb))  ClearB     = float.Parse(cb);
            if (row.TryGetValue("vsync",      out var vs))  VSync      = vs.Equals("true", StringComparison.OrdinalIgnoreCase);
            if (row.TryGetValue("target_fps", out var fps)) TargetFps  = int.Parse(fps);
            if (row.TryGetValue("depth_clear",out var dc))  DepthClear = float.Parse(dc);

            Console.WriteLine($"[Render] Loaded — clear=({ClearR},{ClearG},{ClearB}) vsync={VSync} fps={TargetFps} depth_clear={DepthClear}");
        }

        public static void Init()
        {
            Load();
            RenderPhases.Load();
        }

        public static void RenderFrame()
        {
            RenderPhasesRunner.Run();
        }
    }
}
