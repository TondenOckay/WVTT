using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;

namespace SETUE.Systems
{
    public class Text
    {
        public string Id      { get; set; } = "";
        public string PanelId { get; set; } = "";
        public string Content { get; set; } = "";
        public string FontId  { get; set; } = "default";
        public float  R       { get; set; } = 1f;
        public float  G       { get; set; } = 1f;
        public float  B       { get; set; } = 1f;
        public string Align    { get; set; } = "center";
        public float  Rotation { get; set; } = 0f;
        public int    Layer   { get; set; } = 10;
        public string Source  { get; set; } = "";
        public string Prefix  { get; set; } = "";
    }

    public static class Texts
    {
        private static List<Text> _texts = new();
        public static IEnumerable<Text> Sorted => _texts.OrderBy(t => t.Layer);
        public static IReadOnlyDictionary<string, Text> All => _texts.ToDictionary(t => t.Id);
        public static void Add(Text t)      => _texts.Add(t);
        public static void Remove(string id)     => _texts.RemoveAll(t => t.Id == id);

        public static void Update()
        {
            var sel = SETUE.Objects3D.Objects.SelectedObject;
            foreach (var t in _texts)
            {
                if (string.IsNullOrEmpty(t.Source)) continue;
                float val2 = sel != null ? sel.GetProperty(t.Source) : 0f;
                string disp = sel != null ? $"{t.Prefix}  {val2:F3}" : $"{t.Prefix}  ---";
                t.Content = disp;
            }
        }

        public static void Load()
        {
            string path = "Ui/Text.csv";
            _texts.Clear();
            if (!File.Exists(path)) { Console.WriteLine($"[Texts] File not found: {path}"); return; }
            var lines   = File.ReadAllLines(path);
            var headers = lines[0].Split(',');
            int iId      = Array.IndexOf(headers, "id");
            int iPanelId = Array.IndexOf(headers, "panel_id");
            int iText    = Array.IndexOf(headers, "text");
            int iFontId  = Array.IndexOf(headers, "font_id");
            int iColorId = Array.IndexOf(headers, "color_id");
            int iAlign   = Array.IndexOf(headers, "align");
            int iLayer    = Array.IndexOf(headers, "layer");
            int iRotation = Array.IndexOf(headers, "rotation");
            int iSource   = Array.IndexOf(headers, "source");
            int iPrefix   = Array.IndexOf(headers, "prefix");

            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                var p = line.Split(',');
                string Get(int idx) => idx >= 0 && idx < p.Length ? p[idx].Trim() : "";

                var label = new Text
                {
                    Id      = Get(iId),
                    PanelId = Get(iPanelId),
                    Content = Get(iText),
                    FontId  = string.IsNullOrEmpty(Get(iFontId)) ? "default" : Get(iFontId),
                    Align   = string.IsNullOrEmpty(Get(iAlign))  ? "center"  : Get(iAlign),
                    Layer    = int.TryParse(Get(iLayer),    out var l)    ? l    : 10,
                    Rotation = float.TryParse(Get(iRotation), out var rot) ? rot : 0f,
                    Source   = Get(iSource),
                    Prefix   = Get(iPrefix),
                };
                string cid = Get(iColorId);
                if (!string.IsNullOrEmpty(cid)) { var c = Colors.Get(cid); label.R = c.R; label.G = c.G; label.B = c.B; }
                _texts.Add(label);
            }
            foreach (var t in _texts) Console.WriteLine($"[Texts] {t.Id} rot={t.Rotation}");
            Console.WriteLine($"[Texts] Loaded {_texts.Count} text label(s)");
        }
    }
}
