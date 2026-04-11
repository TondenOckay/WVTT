using System;
using System.IO;
using System.Collections.Generic;
using SETUE.Objects3D;
using SETUE.Systems;

namespace SETUE.UI
{
    public static class SceneTree
    {
        static string _panelId;
        static float  _rowHeight;
        static float  _paddingX;
        static float  _paddingY;
        static float  _rowR;
        static float  _rowG;
        static float  _rowB;
        static float  _selR;
        static float  _selG;
        static float  _selB;
        static string _fontId;
        static float  _textR;
        static float  _textG;
        static float  _textB;
        static float  _indentWidth;

        public static void Load()
        {
            string csvPath = "Ui/SceneTree.csv";
            if (!File.Exists(csvPath)) { Console.WriteLine($"[SceneTree] Missing {csvPath}"); return; }
            var lines   = File.ReadAllLines(csvPath);
            if (lines.Length < 2) return;
            var headers = lines[0].Split(',');
            var vals    = lines[1].Split(',');
            var settings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < headers.Length && i < vals.Length; i++)
                settings[headers[i].Trim()] = vals[i].Trim();

            if (settings.TryGetValue("panel_id",    out var pid)) _panelId   = pid;
            if (settings.TryGetValue("row_height",  out var rh))  _rowHeight = float.Parse(rh);
            if (settings.TryGetValue("padding_x",   out var px))  _paddingX  = float.Parse(px);
            if (settings.TryGetValue("padding_y",   out var py))  _paddingY  = float.Parse(py);
            if (settings.TryGetValue("row_r",       out var rr))  _rowR      = float.Parse(rr);
            if (settings.TryGetValue("row_g",       out var rg))  _rowG      = float.Parse(rg);
            if (settings.TryGetValue("row_b",       out var rb))  _rowB      = float.Parse(rb);
            if (settings.TryGetValue("selected_r",  out var sr))  _selR      = float.Parse(sr);
            if (settings.TryGetValue("selected_g",  out var sg))  _selG      = float.Parse(sg);
            if (settings.TryGetValue("selected_b",  out var sb))  _selB      = float.Parse(sb);
            if (settings.TryGetValue("font_id",      out var fi))  _fontId    = fi;
            if (settings.TryGetValue("text_r",       out var txr)) _textR     = float.Parse(txr);
            if (settings.TryGetValue("text_g",       out var txg)) _textG     = float.Parse(txg);
            if (settings.TryGetValue("text_b",       out var txb)) _textB     = float.Parse(txb);
            if (settings.TryGetValue("indent_width",  out var iw))  _indentWidth = float.Parse(iw);
            Console.WriteLine($"[SceneTree] Loaded settings panel={_panelId} rowH={_rowHeight}");
        }

        static int GetDepth(string id, int safety = 0)
        {
            if (safety > 32) return 0;
            if (!Objects.All.TryGetValue(id, out var obj)) return 0;
            if (string.IsNullOrEmpty(obj.Parent)) return 0;
            return 1 + GetDepth(obj.Parent, safety + 1);
        }

        public static void Update()
        {
            if (string.IsNullOrEmpty(_panelId)) return;
            if (!Panels.All.TryGetValue(_panelId, out var parent)) return;

            var selected = Objects.SelectedObject;
            float y = parent.Y + _paddingY;

            // Remove old scene tree panels
            var toRemove = new List<string>();
            foreach (var key in Panels.All.Keys)
                if (key.StartsWith("_st_")) toRemove.Add(key);
            foreach (var key in toRemove)
                Panels.Remove(key);
            var toRemoveTxt = new List<string>();
            foreach (var key in Texts.All.Keys)
                if (key.StartsWith("_st_txt_")) toRemoveTxt.Add(key);
            foreach (var key in toRemoveTxt)
                Texts.Remove(key);

            foreach (var obj in Objects.All.Values)
            {
                int   depth  = GetDepth(obj.Id);
                float indent = _paddingX + depth * _indentWidth;
                bool  isSel  = selected != null && selected.Id == obj.Id;

                string rowId = "_st_" + obj.Id;
                string txtId = "_st_txt_" + obj.Id;

                // Only add if not already present (safety check)
                if (!Panels.All.ContainsKey(rowId))
                {
                    var row = new Panel
                    {
                        Id      = rowId,
                        X       = parent.X + indent,
                        Y       = y,
                        Width   = parent.Width - indent - _paddingX,
                        Height  = _rowHeight - 2f,
                        R       = isSel ? Colors.Get("row_selected").R : _rowR,
                        G       = isSel ? Colors.Get("row_selected").G : _rowG,
                        B       = isSel ? Colors.Get("row_selected").B : _rowB,
                        Alpha   = isSel ? Colors.Get("row_selected").Alpha : Colors.Get("transparent").Alpha,
                        Visible = true,
                        Layer   = parent.Layer + 1,
                    };
                    Panels.Add(row);
                }

                if (!Texts.All.ContainsKey(txtId))
                {
                    var label = new Text
                    {
                        Id      = txtId,
                        PanelId = rowId,
                        Content = obj.Id,
                        FontId  = string.IsNullOrEmpty(_fontId) ? "default" : _fontId,
                        R       = _textR,
                        G       = _textG,
                        B       = _textB,
                        Align   = "left",
                        Layer   = parent.Layer + 1,
                    };
                    Texts.Add(label);
                }

                y += _rowHeight;
            }
        }
    }
}
