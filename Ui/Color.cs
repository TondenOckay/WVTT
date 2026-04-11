using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace SETUE.Systems
{
    public struct ColorEntry
    {
        public float R, G, B, Alpha;
    }

    public static class Colors
    {
        private static Dictionary<string, ColorEntry> _colors = new(StringComparer.OrdinalIgnoreCase);

        public static void Load()
        {
            string csvPath = "Ui/Color.csv";
            if (!File.Exists(csvPath)) { Console.WriteLine($"[Colors] File not found: {csvPath}"); return; }
            var lines   = File.ReadAllLines(csvPath);
            var headers = lines[0].Split(',');
            int iId    = Array.IndexOf(headers, "color_id");
            int iR     = Array.IndexOf(headers, "r");
            int iG     = Array.IndexOf(headers, "g");
            int iB     = Array.IndexOf(headers, "b");
            int iAlpha = Array.IndexOf(headers, "alpha");

            _colors.Clear();
            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                var p = line.Split(',');
                string Get(int idx) => idx >= 0 && idx < p.Length ? p[idx].Trim() : "";
                _colors[Get(iId)] = new ColorEntry
                {
                    R     = float.TryParse(Get(iR),     out var r) ? r : 1f,
                    G     = float.TryParse(Get(iG),     out var g) ? g : 1f,
                    B     = float.TryParse(Get(iB),     out var b) ? b : 1f,
                    Alpha = float.TryParse(Get(iAlpha), out var a) ? a : 1f
                };
            }
            Console.WriteLine($"[Colors] Loaded {_colors.Count} colors");
        }

        public static bool TryGet(string id, out ColorEntry c) => _colors.TryGetValue(id, out c);

        public static ColorEntry Get(string id)
        {
            if (!string.IsNullOrEmpty(id) && _colors.TryGetValue(id, out var c)) return c;
            return new ColorEntry { R = 1f, G = 1f, B = 1f, Alpha = 1f };
        }
    }
}
