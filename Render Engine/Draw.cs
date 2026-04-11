using System;
using System.Collections.Generic;
using System.Numerics;
using System.Runtime.InteropServices;
using Silk.NET.Vulkan;
using SETUE.RenderEngine;
using SETUE.Scene;

namespace SETUE
{
    [StructLayout(LayoutKind.Sequential)]
    struct PushConstants
    {
        public Matrix4x4 MVP;
        public Matrix4x4 Model;
        public Vector4   Color;
    }

    public static unsafe class Draw
    {
        private static DescriptorSet _cachedTextDS;
        private static PipelineLayout _cachedTextLayout;
        private static string _lastFontId = "";

        public static void Load() { }

        public static void Execute()
        {
            var cmd = Vulkan.CurrentCmd;

            Scene2D.Update();
            Scene3D.Update();

            uint pushSize = (uint)Marshal.SizeOf<PushConstants>();

            // Draw 3D
            foreach (var cmd3D in Scene3D.Commands)
            {
                if (cmd3D.VertexBuffer.Handle == 0 || cmd3D.IndexBuffer.Handle == 0) continue;
                var pipeline = Shaders.GetHandle(cmd3D.PipelineId);
                var layout = Shaders.GetLayout(cmd3D.PipelineId);
                if (pipeline.Handle == 0) continue;

                Vulkan.VK.CmdBindPipeline(cmd, PipelineBindPoint.Graphics, pipeline);
                ulong offset = 0;
                var vbuf = cmd3D.VertexBuffer;
                var ibuf = cmd3D.IndexBuffer;
                Vulkan.VK.CmdBindVertexBuffers(cmd, 0, 1, &vbuf, &offset);
                Vulkan.VK.CmdBindIndexBuffer(cmd, ibuf, 0, IndexType.Uint32);

                PushConstants push;
                push.MVP = cmd3D.Transform;
                push.Model = cmd3D.Transform;
                push.Color = cmd3D.Color;

                Vulkan.VK.CmdPushConstants(cmd, layout,
                    ShaderStageFlags.VertexBit | ShaderStageFlags.FragmentBit,
                    0, pushSize, &push);
                Vulkan.VK.CmdDrawIndexed(cmd, cmd3D.IndexCount, 1, 0, 0, 0);
            }

            // Draw 2D
            foreach (var cmd2D in Scene2D.Commands)
            {
                if (cmd2D.VertexBuffer.Handle == 0 || cmd2D.IndexBuffer.Handle == 0) continue;
                var pipeline = Shaders.GetHandle(cmd2D.PipelineId);
                var layout = Shaders.GetLayout(cmd2D.PipelineId);
                if (pipeline.Handle == 0) continue;

                Vulkan.VK.CmdBindPipeline(cmd, PipelineBindPoint.Graphics, pipeline);

                if (cmd2D.IsText)
                {
                    if (_cachedTextDS.Handle == 0 || _lastFontId != "default")
                    {
                        var atlas = SETUE.UI.Fonts.Get("default");
                        if (atlas != null)
                        {
                            _cachedTextDS = Vulkan.GetOrUploadAtlas(atlas, "text_pipeline");
                            _cachedTextLayout = layout;
                            _lastFontId = "default";
                        }
                    }
                    if (_cachedTextDS.Handle != 0)
                    {
                        var ds = _cachedTextDS;
                        Vulkan.VK.CmdBindDescriptorSets(cmd, PipelineBindPoint.Graphics,
                            _cachedTextLayout, 0, 1, &ds, 0, null);
                    }
                }

                ulong offset = 0;
                var vbuf = cmd2D.VertexBuffer;
                var ibuf = cmd2D.IndexBuffer;
                Vulkan.VK.CmdBindVertexBuffers(cmd, 0, 1, &vbuf, &offset);
                Vulkan.VK.CmdBindIndexBuffer(cmd, ibuf, 0, IndexType.Uint32);

                PushConstants push;
                push.MVP = cmd2D.Transform;
                push.Model = cmd2D.Transform;
                push.Color = cmd2D.Color;

                Vulkan.VK.CmdPushConstants(cmd, layout,
                    ShaderStageFlags.VertexBit | ShaderStageFlags.FragmentBit,
                    0, pushSize, &push);
                Vulkan.VK.CmdDrawIndexed(cmd, cmd2D.IndexCount, 1, 0, 0, 0);
            }
        }
    }
}
