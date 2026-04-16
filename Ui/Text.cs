using System;
using System.IO;
using System.Collections.Generic;
using System.Numerics;
using SETUE.ECS;

namespace SETUE.Systems
{
    public static class Texts
    {
        private static Dictionary<string, float> _panelNextYOffset = new();

        public static void Load()
        {
            string path = "Ui/Text.csv";
            if (!File.Exists(path))
            {
                Console.WriteLine($"[Texts] File not found: {path}");
                return;
            }

            var lines = File.ReadAllLines(path);
            if (lines.Length < 2) return;

            var headers = lines[0].Split(',');
            Console.WriteLine($"[Texts] Headers: {string.Join(" | ", headers)}");

            int iId        = Array.IndexOf(headers, "id");
            int iPanelId   = Array.IndexOf(headers, "panel_id");
            int iText      = Array.IndexOf(headers, "text");
            int iFontId    = Array.IndexOf(headers, "font_id");
            int iColorId   = Array.IndexOf(headers, "color_id");
            int iAlign     = Array.IndexOf(headers, "align");
            int iLayer     = Array.IndexOf(headers, "layer");
            int iRotation  = Array.IndexOf(headers, "rotation");
            int iSource    = Array.IndexOf(headers, "source");
            int iPrefix    = Array.IndexOf(headers, "prefix");
            int iPadLeft   = Array.IndexOf(headers, "pad_left");
            int iPadTop    = Array.IndexOf(headers, "pad_top");
            int iLineHeight= Array.IndexOf(headers, "line_height");
            int iVAlign    = Array.IndexOf(headers, "valign");

            var world = Object.ECSWorld;
            _panelNextYOffset.Clear();

            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                var parts = line.Split(',');

                string Get(int idx) => idx >= 0 && idx < parts.Length ? parts[idx].Trim() : "";

                string id = Get(iId);
                string panelId = Get(iPanelId);
                string content = Get(iText);
                string fontId = string.IsNullOrEmpty(Get(iFontId)) ? "default" : Get(iFontId);
                string align = string.IsNullOrEmpty(Get(iAlign)) ? "center" : Get(iAlign);
                int layer = int.TryParse(Get(iLayer), out var l) ? l : 10;
                float rotation = float.TryParse(Get(iRotation), out var rot) ? rot : 0f;
                string source = Get(iSource);
                string prefix = Get(iPrefix);

                float padLeft = float.TryParse(Get(iPadLeft), out var pl) ? pl : 10f;
                float padTop = float.TryParse(Get(iPadTop), out var pt) ? pt : 10f;
                float lineHeight = float.TryParse(Get(iLineHeight), out var lh) ? lh : 20f;
                string valign = Get(iVAlign);
                if (string.IsNullOrEmpty(valign)) valign = "top";

                Vector4 color = new Vector4(1, 1, 1, 1);
                string cid = Get(iColorId);
                if (!string.IsNullOrEmpty(cid))
                {
                    var c = Colors.Get(cid);
                    color = new Vector4(c.R, c.G, c.B, c.Alpha);
                }

                Entity e = world.CreateEntity();
                world.AddComponent(e, new TextComponent
                {
                    Id = id,
                    Content = content,
                    FontId = fontId,
                    FontSize = 16f,
                    Color = color,
                    Align = align,
                    Rotation = rotation,
                    Layer = layer,
                    Source = source,
                    Prefix = prefix,
                    PanelId = panelId,
                    PadLeft = padLeft,
                    PadTop = padTop,
                    LineHeight = lineHeight,
                    VAlign = valign
                });

                world.AddComponent(e, new TransformComponent
                {
                    Position = Vector3.Zero,
                    Scale = Vector3.One,
                    Rotation = Quaternion.Identity
                });
            }

            Console.WriteLine($"[Texts] Loaded {world.Query<TextComponent>().Count()} text entities");
        }

        public static void Update()
        {
            var world = Object.ECSWorld;
            Entity? selectedEntity = null;
            foreach (var e in world.Query<SelectedComponent>())
            {
                selectedEntity = e;
                break;
            }

            var panelTexts = new Dictionary<string, List<Entity>>();
            foreach (var e in world.Query<TextComponent>())
            {
                var text = world.GetComponent<TextComponent>(e);
                if (!string.IsNullOrEmpty(text.PanelId))
                {
                    if (!panelTexts.ContainsKey(text.PanelId))
                        panelTexts[text.PanelId] = new List<Entity>();
                    panelTexts[text.PanelId].Add(e);
                }
            }

            _panelNextYOffset.Clear();

            foreach (var kvp in panelTexts)
            {
                string panelId = kvp.Key;
                var entities = kvp.Value;

                Entity? panelEntity = null;
                PanelComponent panelComp = default;
                TransformComponent panelTrans = default;
                foreach (var (pe, pc, pt) in world.Query<PanelComponent, TransformComponent>())
                {
                    if (pc.Id == panelId)
                    {
                        panelEntity = pe;
                        panelComp = pc;
                        panelTrans = pt;
                        break;
                    }
                }
                if (!panelEntity.HasValue || !panelComp.Visible) continue;

                Vector3 panelPos = panelTrans.Position;
                Vector3 panelScale = panelTrans.Scale;
                float panelLeft = panelPos.X - panelScale.X * 0.5f;
                float panelTop = panelPos.Y - panelScale.Y * 0.5f;
                float panelWidth = panelScale.X;
                float panelHeight = panelScale.Y;

                // Sort by layer
                entities.Sort((a, b) =>
                {
                    var ta = world.GetComponent<TextComponent>(a);
                    var tb = world.GetComponent<TextComponent>(b);
                    return ta.Layer.CompareTo(tb.Layer);
                });

                var firstText = world.GetComponent<TextComponent>(entities[0]);
                string vAlign = firstText.VAlign;

                bool isVertical = Math.Abs(firstText.Rotation) == 90 || Math.Abs(firstText.Rotation) == 270;

                float visualTop = 0f, visualBottom = 0f;
                float currentBaselineOffset = 0f;
                bool firstLine = true;

                foreach (var e in entities)
                {
                    var t = world.GetComponent<TextComponent>(e);
                    var font = SETUE.UI.Fonts.Get(t.FontId);
                    if (font == null) continue;

                    float ascent = font.Ascent;
                    float descent = 0f;

                    // Try to get Descent if available, otherwise estimate
                    var descentProp = font.GetType().GetProperty("Descent");
                    if (descentProp != null)
                        descent = (float)descentProp.GetValue(font);
                    else
                        descent = ascent * 0.25f; // reasonable fallback for Latin fonts

                    if (isVertical)
                    {
                        // Vertical text: visual height = string width
                        float stringWidth = 0f;
                        foreach (char c in t.Content)
                            if (font.Glyphs.TryGetValue(c, out var g))
                                stringWidth += g.AdvanceX;

                        if (firstLine)
                        {
                            visualTop = -stringWidth * 0.5f;
                            visualBottom = stringWidth * 0.5f;
                            firstLine = false;
                        }
                        else
                        {
                            currentBaselineOffset += t.LineHeight;
                            float lineTop = currentBaselineOffset - stringWidth * 0.5f;
                            float lineBottom = currentBaselineOffset + stringWidth * 0.5f;
                            if (lineTop < visualTop) visualTop = lineTop;
                            if (lineBottom > visualBottom) visualBottom = lineBottom;
                        }
                    }
                    else
                    {
                        // Horizontal text
                        if (firstLine)
                        {
                            visualTop = -ascent;
                            visualBottom = descent;
                            firstLine = false;
                        }
                        else
                        {
                            currentBaselineOffset += t.LineHeight;
                            float lineTop = currentBaselineOffset - ascent;
                            float lineBottom = currentBaselineOffset + descent;
                            if (lineTop < visualTop) visualTop = lineTop;
                            if (lineBottom > visualBottom) visualBottom = lineBottom;
                        }
                    }
                }

                float visualHeight = visualBottom - visualTop;

                float startY;
                string vAlignClean = vAlign?.Trim() ?? "";
                if (string.Equals(vAlignClean, "middle", StringComparison.OrdinalIgnoreCase))
                {
                    float blockTop = panelTop + (panelHeight - visualHeight) * 0.5f;
                    startY = blockTop - visualTop;
                    Console.WriteLine($"[Texts] Panel '{panelId}' MIDDLE: visualHeight={visualHeight:F1}, blockTop={blockTop:F1}, startY={startY:F1}");
                }
                else if (string.Equals(vAlignClean, "bottom", StringComparison.OrdinalIgnoreCase))
                {
                    float blockTop = panelTop + panelHeight - visualHeight - firstText.PadTop;
                    startY = blockTop - visualTop;
                }
                else // "top"
                {
                    startY = panelTop + firstText.PadTop - visualTop;
                }

                currentBaselineOffset = 0f;
                foreach (var e in entities)
                {
                    var text = world.GetComponent<TextComponent>(e);
                    var transform = world.GetComponent<TransformComponent>(e);

                    if (!string.IsNullOrEmpty(text.Source))
                    {
                        string newContent = text.Content;
                        if (selectedEntity != null && world.HasComponent<TransformComponent>(selectedEntity.Value))
                        {
                            var selTrans = world.GetComponent<TransformComponent>(selectedEntity.Value);
                            switch (text.Source)
                            {
                                case "position":
                                    newContent = $"{text.Prefix} {selTrans.Position.X:F3}, {selTrans.Position.Y:F3}, {selTrans.Position.Z:F3}";
                                    break;
                                case "rotation":
                                    newContent = $"{text.Prefix} {selTrans.Rotation.X:F2}, {selTrans.Rotation.Y:F2}, {selTrans.Rotation.Z:F2}, {selTrans.Rotation.W:F2}";
                                    break;
                                case "scale":
                                    newContent = $"{text.Prefix} {selTrans.Scale.X:F3}, {selTrans.Scale.Y:F3}, {selTrans.Scale.Z:F3}";
                                    break;
                                default:
                                    newContent = $"{text.Prefix} ---";
                                    break;
                            }
                        }
                        else
                        {
                            newContent = $"{text.Prefix} ---";
                        }

                        if (newContent != text.Content)
                        {
                            text.Content = newContent;
                            world.SetComponent(e, text);
                        }
                    }

                    float y = startY + currentBaselineOffset;
                    float x = panelLeft + text.PadLeft;
                    if (text.Align == "center")
                        x = panelLeft + panelWidth * 0.5f;
                    else if (text.Align == "right")
                        x = panelLeft + panelWidth - text.PadLeft;

                    transform.Position = new Vector3(x, y, 0);
                    world.SetComponent(e, transform);

                    currentBaselineOffset += text.LineHeight;
                }
            }
        }
    }
}
