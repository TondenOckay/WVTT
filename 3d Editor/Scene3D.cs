using VkBuffer = Silk.NET.Vulkan.Buffer;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using Silk.NET.Vulkan;
using SETUE.Core;
using SETUE.Components;
using SETUE.Objects3D;
using SETUE.RenderEngine;

namespace SETUE.Scene
{
    public class DrawCommand3D
    {
        public Matrix4x4 Transform;
        public Vector4 Color;
        public string PipelineId = "";
        public VkBuffer VertexBuffer;
        public VkBuffer IndexBuffer;
        public uint IndexCount;
        public int Order;
    }

    public class Scene3DRule
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

    public static class Scene3D
    {
        private static List<Scene3DRule> _rules = new();
        public static List<DrawCommand3D> Commands { get; private set; } = new();

        public static void Load()
        {
            string path = "3d Editor/Scene3D.csv";
            if (!File.Exists(path))
            {
                Console.WriteLine($"[Scene3D] Missing {path}");
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

                _rules.Add(new Scene3DRule
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
            Console.WriteLine($"[Scene3D] Loaded {_rules.Count} rules");
        }

        public static void Update()
        {
            Commands.Clear();

            foreach (var rule in _rules)
            {
                if (!rule.Enabled) continue;

                if (rule.DataSource == "ecs")
                {
                    // Query all entities with Position
                    foreach (var entity in ECS.Query<Position>())
                    {
                        if (!ECS.HasComponent<Mesh>(entity)) continue;

                        ref var pos = ref ECS.GetComponent<Position>(entity);
                        ref var mesh = ref ECS.GetComponent<Mesh>(entity);

                        // Apply filter if present (e.g., "Layer=3")
                        if (!string.IsNullOrEmpty(rule.ItemFilter))
                        {
                            if (rule.ItemFilter.StartsWith("Layer="))
                            {
                                if (!int.TryParse(rule.ItemFilter.Substring(6), out int layer) || mesh.Layer != layer)
                                    continue;
                            }
                        }

                        // Get mesh buffers
                        if (!MeshBuffer.Get(mesh.MeshId, out var vbuf, out var ibuf, out uint idxCount))
                        {
                            // Fallback to cube
                            if (!MeshBuffer.Get("cube", out vbuf, out ibuf, out idxCount))
                                continue;
                        }

                        // Build transform (simple translation for now)
                        var transform = Matrix4x4.CreateTranslation(pos.X, pos.Y, pos.Z);

                        // Color (default white for now)
                        var color = new Vector4(1, 1, 1, 1);

                        Commands.Add(new DrawCommand3D
                        {
                            Transform = transform,
                            Color = color,
                            PipelineId = string.IsNullOrEmpty(mesh.PipelineId) ? "mesh_pipeline" : mesh.PipelineId,
                            VertexBuffer = vbuf,
                            IndexBuffer = ibuf,
                            IndexCount = idxCount,
                            Order = rule.Order
                        });
                    }
                }
                else if (rule.DataSource == "objects")  // Legacy support
                {
                    foreach (var obj in Objects.All.Values)
                    {
                        if (!obj.Visible) continue;
                        try
                        {
                            MeshBuffer.Get(obj.Shape, out var vbuf, out var ibuf, out uint idxCount);
                            Commands.Add(new DrawCommand3D
                            {
                                Transform = Objects.GetMVP(obj),
                                Color = new Vector4(obj.R, obj.G, obj.B, 1f),
                                PipelineId = string.IsNullOrEmpty(obj.Pipeline) ? "mesh_pipeline" : obj.Pipeline,
                                VertexBuffer = vbuf,
                                IndexBuffer = ibuf,
                                IndexCount = idxCount,
                                Order = rule.Order
                            });
                        }
                        catch (KeyNotFoundException)
                        {
                            Console.WriteLine($"[Scene3D] Mesh '{obj.Shape}' not found, skipping object '{obj.Id}'");
                        }
                    }
                }
            }

            Commands.Sort((a, b) => a.Order.CompareTo(b.Order));
        }
    }
}
