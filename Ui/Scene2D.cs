using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;
using SETUE.Core;
using SETUE.Systems;
using SETUE.RenderEngine;

namespace SETUE.Scene
{
    public class DrawCommand2D
    {
        public Matrix4x4 Transform;
        public Vector4 Color;
        public string PipelineId = "";
        public Silk.NET.Vulkan.Buffer VertexBuffer;
        public Silk.NET.Vulkan.Buffer IndexBuffer;
        public uint IndexCount;
        public int Order;
        public bool IsText;
        public string FontId = "";      // <-- ADDED
    }

    public class Scene2DRule
    {
        public string Id = "";
        public bool Enabled;
        public int Order;
        public string DataSource = "";
        public string ItemFilter = "";
        public string MeshSource = "";
        public string TransformSource = "";
        public string ColorSource = "";
    }

    public static class Scene2D
    {
        private static List<Scene2DRule> _rules = new();
        public static List<DrawCommand2D> Commands { get; private set; } = new();

        public static void Load()
        {
            string path = "Ui/Scene2D.csv";
            if (!File.Exists(path))
            {
                Console.WriteLine($"[Scene2D] Missing {path}");
                return;
            }

            var lines = File.ReadAllLines(path);
            var headers = lines[0].Split(',');

            int idxId = Array.IndexOf(headers, "id");
            int idxEnabled = Array.IndexOf(headers, "enabled");
            int idxOrder = Array.IndexOf(headers, "order");
            int idxDataSource = Array.IndexOf(headers, "data_source");
            int idxFilter = Array.IndexOf(headers, "item_filter");
            int idxMesh = Array.IndexOf(headers, "mesh_source");
            int idxTransform = Array.IndexOf(headers, "transform_source");
            int idxColor = Array.IndexOf(headers, "color_source");

            _rules.Clear();
            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                var p = line.Split(',');
                string Get(int idx) => idx >= 0 && idx < p.Length ? p[idx].Trim() : "";

                _rules.Add(new Scene2DRule
                {
                    Id = Get(idxId),
                    Enabled = Get(idxEnabled).ToLower() == "true",
                    Order = int.TryParse(Get(idxOrder), out var o) ? o : 0,
                    DataSource = Get(idxDataSource),
                    ItemFilter = Get(idxFilter),
                    MeshSource = Get(idxMesh),
                    TransformSource = Get(idxTransform),
                    ColorSource = Get(idxColor)
                });
            }

            _rules.Sort((a, b) => a.Order.CompareTo(b.Order));
            Console.WriteLine($"[Scene2D] Loaded {_rules.Count} rules");
        }

        public static void Update()
        {
            float sw = Vulkan.SwapExtent.Width;
            float sh = Vulkan.SwapExtent.Height;

            Commands.Clear();

            foreach (var rule in _rules)
            {
                if (!rule.Enabled) continue;

                switch (rule.DataSource)
                {
                    case "panels":
                        foreach (var panel in Panels.Sorted)
                        {
                            if (!panel.Visible) continue;
                            string meshId = rule.MeshSource.StartsWith("fixed:") ? rule.MeshSource.Substring(6) : rule.MeshSource;
                            try
                            {
                                MeshBuffer.Get(meshId, out var vbuf, out var ibuf, out uint indexCount);
                                Commands.Add(new DrawCommand2D
                                {
                                    Transform = ComputePanelTransform(panel, sw, sh),
                                    Color = new Vector4(panel.R, panel.G, panel.B, panel.Alpha),
                                    PipelineId = "rect_pipeline",
                                    VertexBuffer = vbuf,
                                    IndexBuffer = ibuf,
                                    IndexCount = indexCount,
                                    Order = rule.Order,
                                    IsText = false
                                });
                            }
                            catch (KeyNotFoundException)
                            {
                                Console.WriteLine($"[Scene2D] Mesh '{meshId}' not found for panel '{panel.Id}'");
                            }
                        }
                        break;

                    case "texts":
                        var panelLookup = Panels.All;
                        foreach (var text in Texts.Sorted)
                        {
                            if (!panelLookup.TryGetValue(text.PanelId, out var panel)) continue;
                            if (!panel.Visible) continue;

                            if (text.PanelId == "tab_item" || text.PanelId == "tab_view")
                            {
                                text.Rotation = 90f;
                                if (text.Content.Length > 1) text.Content = text.Content.Substring(0, 1);
                            }

                            string fontId = string.IsNullOrEmpty(text.FontId) ? "default" : text.FontId;
                            var font = SETUE.UI.Fonts.Get(fontId);
                            if (font == null) continue;

                            BuildTextBuffers(text, panel, font, sw, sh,
                                out var vbuf, out var ibuf, out uint idxCount);

                            Commands.Add(new DrawCommand2D
                            {
                                Transform = Matrix4x4.Identity,
                                Color = new Vector4(text.R, text.G, text.B, 1f),
                                PipelineId = "text_pipeline",
                                VertexBuffer = vbuf,
                                IndexBuffer = ibuf,
                                IndexCount = idxCount,
                                Order = rule.Order,
                                IsText = true,
                                FontId = fontId      // <-- SET FONT ID
                            });
                        }
                        break;
                }
            }

            Commands.Sort((a, b) => a.Order.CompareTo(b.Order));
        }

        // ... (keep the rest of the file unchanged: BuildTextBuffers, RotateScreen, ComputePanelTransform)
        // I'll include them here to ensure the file is complete.
        private static void BuildTextBuffers(Text text, Panel panel, SETUE.UI.Font atlas, float sw, float sh,
            out Silk.NET.Vulkan.Buffer vbuf, out Silk.NET.Vulkan.Buffer ibuf, out uint indexCount)
        {
            vbuf = default; ibuf = default; indexCount = 0;

            List<float> verts = new();
            List<uint> indices = new();
            uint idxOffset = 0;

            float totalW = 0f;
            foreach (char c in text.Content)
                if (atlas.Glyphs.TryGetValue(c, out var g)) totalW += g.AdvanceX;

            float panelCX = panel.X + panel.Width * 0.5f;
            float panelCY = panel.Y + panel.Height * 0.5f;

            float x, y;
            if (text.Rotation != 0f)
            {
                x = (float)Math.Floor(panelCX - totalW * 0.5f);
                y = (float)Math.Floor(panelCY - atlas.LineHeight * 0.5f) + atlas.Ascent;
            }
            else
            {
                x = text.Align == "left"
                    ? (float)Math.Floor(panel.X + 4f)
                    : (float)Math.Floor(panelCX - totalW * 0.5f);
                y = (float)Math.Floor(panel.Y + (panel.Height - atlas.LineHeight) * 0.5f) + atlas.Ascent;
            }

            float cosR = MathF.Cos(text.Rotation * MathF.PI / 180f);
            float sinR = MathF.Sin(text.Rotation * MathF.PI / 180f);

            foreach (char c in text.Content)
            {
                if (!atlas.Glyphs.TryGetValue(c, out var glyph)) { x += 8f; continue; }

                float glyphLeft = x, glyphRight = x + glyph.Width;
                float glyphTop = y - atlas.Ascent, glyphBottom = y - atlas.Ascent + glyph.Height;

                if (text.Rotation == 0f)
                {
                    if (glyphRight < panel.X || glyphLeft > panel.X + panel.Width ||
                        glyphBottom < panel.Y || glyphTop > panel.Y + panel.Height)
                    { x += glyph.AdvanceX; continue; }
                }

                float x0 = (float)Math.Floor(x), y0 = (float)Math.Floor(y - atlas.Ascent);
                float x1 = x0 + glyph.Width, y1 = y0 + glyph.Height;

                (float rx00, float ry00) = RotateScreen(x0, y0, panelCX, panelCY, cosR, sinR);
                (float rx10, float ry10) = RotateScreen(x1, y0, panelCX, panelCY, cosR, sinR);
                (float rx11, float ry11) = RotateScreen(x1, y1, panelCX, panelCY, cosR, sinR);
                (float rx01, float ry01) = RotateScreen(x0, y1, panelCX, panelCY, cosR, sinR);

                float nx0 = (rx00 / sw) * 2f - 1f, ny0 = (ry00 / sh) * 2f - 1f;
                float nx1 = (rx10 / sw) * 2f - 1f, ny1 = (ry10 / sh) * 2f - 1f;
                float nx2 = (rx11 / sw) * 2f - 1f, ny2 = (ry11 / sh) * 2f - 1f;
                float nx3 = (rx01 / sw) * 2f - 1f, ny3 = (ry01 / sh) * 2f - 1f;

                verts.AddRange(new[] {
                    nx0, ny0, 0f, glyph.U0, glyph.V0, 0f,
                    nx1, ny1, 0f, glyph.U1, glyph.V0, 0f,
                    nx2, ny2, 0f, glyph.U1, glyph.V1, 0f,
                    nx0, ny0, 0f, glyph.U0, glyph.V0, 0f,
                    nx2, ny2, 0f, glyph.U1, glyph.V1, 0f,
                    nx3, ny3, 0f, glyph.U0, glyph.V1, 0f
                });

                indices.AddRange(new[] {
                    idxOffset, idxOffset+1, idxOffset+2,
                    idxOffset+3, idxOffset+4, idxOffset+5
                });
                idxOffset += 6;

                x += glyph.AdvanceX;
            }

            if (verts.Count == 0) return;

            ulong vSize = (ulong)(verts.Count * sizeof(float));
            ulong iSize = (ulong)(indices.Count * sizeof(uint));
            Vulkan.CreateBuffer(vSize, Silk.NET.Vulkan.BufferUsageFlags.VertexBufferBit,
                Silk.NET.Vulkan.MemoryPropertyFlags.HostVisibleBit | Silk.NET.Vulkan.MemoryPropertyFlags.HostCoherentBit,
                out vbuf, out var vmem);
            Vulkan.CreateBuffer(iSize, Silk.NET.Vulkan.BufferUsageFlags.IndexBufferBit,
                Silk.NET.Vulkan.MemoryPropertyFlags.HostVisibleBit | Silk.NET.Vulkan.MemoryPropertyFlags.HostCoherentBit,
                out ibuf, out var imem);

            unsafe
            {
                void* mapped;
                Vulkan.VK.MapMemory(Vulkan.Device, vmem, 0, vSize, 0, &mapped);
                fixed (float* src = verts.ToArray()) System.Buffer.MemoryCopy(src, mapped, (long)vSize, (long)vSize);
                Vulkan.VK.UnmapMemory(Vulkan.Device, vmem);

                Vulkan.VK.MapMemory(Vulkan.Device, imem, 0, iSize, 0, &mapped);
                fixed (uint* src = indices.ToArray()) System.Buffer.MemoryCopy(src, mapped, (long)iSize, (long)iSize);
                Vulkan.VK.UnmapMemory(Vulkan.Device, imem);
            }

            indexCount = (uint)indices.Count;
            Vulkan.DeferFree(vbuf, vmem);
            Vulkan.DeferFree(ibuf, imem);
        }

        private static (float, float) RotateScreen(float px, float py, float cx, float cy, float cosR, float sinR)
        {
            float dx = px - cx, dy = py - cy;
            return (cx + dx * cosR - dy * sinR, cy + dx * sinR + dy * cosR);
        }

        private static Matrix4x4 ComputePanelTransform(Panel p, float sw, float sh)
        {
            float x = (p.X / sw) * 2f - 1f;
            float y = (p.Y / sh) * 2f - 1f;
            float w = (p.Width / sw) * 2f;
            float h = (p.Height / sh) * 2f;
            float cx = x + w * 0.5f;
            float cy = y + h * 0.5f;
            return Matrix4x4.CreateScale(w, h, 1f) * Matrix4x4.CreateTranslation(cx, cy, 0f);
        }
    }
}
