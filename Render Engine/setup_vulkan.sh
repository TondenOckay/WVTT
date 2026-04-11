#!/bin/bash
# ================================================================
# SETUE Vulkan Engine Setup
# ================================================================

RENDER="/home/syii/Documents/SETUE/Render Engine"
mkdir -p "$RENDER"
echo "[Setup] Target: $RENDER"

# ================================================================
# Vulkan.csv
# ================================================================
cat > "$RENDER/Vulkan.csv" << 'CSVEOF'
ID,ObjectType,Enabled,AppName,EngineName,ApiVersion,EnabledExtensions,EnabledLayers,DevicePreference,RequiredExtensions,SurfaceFormat,ColorSpace,PresentMode,CompositeAlpha,Attachment0_LoadOp,Attachment0_StoreOp,Attachment0_InitialLayout,Attachment0_FinalLayout,Attachment1_Format,Attachment1_LoadOp,Attachment1_StoreOp,Attachment1_InitialLayout,Attachment1_FinalLayout,Subpass0_DepthAttachment,Dependency_SrcStage,Dependency_DstStage,MaxFramesInFlight
instance,instance,true,SETUE App,SETUE Engine,1.3,VK_KHR_surface,,,,,,,,,,,,,,,,,,,,
device,device,true,,,,,,discrete_gpu,VK_KHR_swapchain,,,,,,,,,,,,,,,,,
swapchain,swapchain,true,,,,,,,,,B8G8R8A8_SRGB,SRGB_NONLINEAR,FIFO,OPAQUE,,,,,,,,,,,,,
renderpass,renderpass,true,,,,,,,,,,,,CLEAR,STORE,UNDEFINED,PRESENT_SRC_KHR,D32_SFLOAT,CLEAR,DONTCARE,UNDEFINED,DEPTH_STENCIL_ATTACHMENT_OPTIMAL,1,TOP_OF_PIPE,COLOR_ATTACHMENT_OUTPUT,
pipeline,pipeline,true,,,,,,,,,,,,,,,,,,,,,,,,,2
CSVEOF
echo "[Setup] Vulkan.csv done"

# ================================================================
# Vulkan_Helper.csv
# ================================================================
cat > "$RENDER/Vulkan_Helper.csv" << 'CSVEOF'
ID,Type,Enabled,Description
core,SETUE.VulkanHandlers_Core,true,Instance / Device / Swapchain / RenderPass / Pipeline
CSVEOF
echo "[Setup] Vulkan_Helper.csv done"

# ================================================================
# Vulkan.cs  — FROZEN FOREVER
# ================================================================
cat > "$RENDER/Vulkan.cs" << 'CSEOF'
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Silk.NET.Vulkan;
using Silk.NET.Vulkan.Extensions.KHR;
using Silk.NET.Core.Native;
using SDL3;

using VkImage     = Silk.NET.Vulkan.Image;
using VkSemaphore = Silk.NET.Vulkan.Semaphore;
using VkBuffer    = Silk.NET.Vulkan.Buffer;

namespace SETUE
{
    // ---------------------------------------------------------------
    // Attribute — tag any static method to register it as a handler
    // ---------------------------------------------------------------
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class VulkanHandlerAttribute : Attribute
    {
        public string ObjectType { get; }
        public VulkanHandlerAttribute(string objectType) => ObjectType = objectType;
    }

    // ---------------------------------------------------------------
    // Vulkan — FROZEN dispatcher, never modified again
    // ---------------------------------------------------------------
    public static partial class Vulkan
    {
        // Core
        public static Vk             VK                  { get; internal set; } = null!;
        public static Instance       Instance            { get; internal set; }
        public static PhysicalDevice PhysicalDevice      { get; internal set; }
        public static Device         Device              { get; internal set; }
        public static Queue          GraphicsQueue       { get; internal set; }
        public static uint           GraphicsQueueFamily { get; internal set; }

        // Swapchain
        public static KhrSwapchain  KhrSwapchain   { get; internal set; } = null!;
        public static KhrSurface    KhrSurface     { get; internal set; } = null!;
        public static SwapchainKHR  Swapchain      { get; internal set; }
        public static VkImage[]     SwapImages     { get; internal set; } = null!;
        public static Format        SwapFormat     { get; internal set; }
        public static Extent2D      SwapExtent     { get; internal set; }
        public static ImageView[]   SwapImageViews { get; internal set; } = null!;
        public static Framebuffer[] Framebuffers   { get; internal set; } = null!;
        public static VkImage       DepthImage     { get; internal set; }
        public static DeviceMemory  DepthMemory    { get; internal set; }
        public static ImageView     DepthImageView { get; internal set; }

        // Render pass
        public static RenderPass RenderPass { get; internal set; }

        // Commands / sync
        public static CommandPool     CommandPool    { get; internal set; }
        public static CommandBuffer[] CommandBuffers { get; internal set; } = null!;
        public static VkSemaphore[]   ImageAvailable { get; internal set; } = null!;
        public static VkSemaphore[]   RenderFinished { get; internal set; } = null!;
        public static Fence[]         InFlight       { get; internal set; } = null!;
        public static int             MaxFrames      { get; internal set; } = 2;
        public static int             CurrentFrame   { get; internal set; } = 0;
        public static uint            LastImageIndex { get; internal set; }

        // Surface
        public static SurfaceKHR Surface { get; internal set; }
        public static IntPtr     Window  { get; internal set; }

        // Helper command pool
        public static CommandPool HelperPool      { get; internal set; }
        public static bool        HelperPoolReady { get; internal set; } = false;

        // Deferred GPU memory free list
        public static readonly List<(VkBuffer buf, DeviceMemory mem)> DeferredFree = new();

        // Config rows
        public static readonly Dictionary<string, Dictionary<string, string>> Rows        = new();
        public static readonly List<Dictionary<string, string>>               RowsOrdered = new();

        // Handler registry
        static readonly Dictionary<string, Action<Dictionary<string, string>>> _handlers = new();

        // Convenience
        public static CommandBuffer CurrentCmd => CommandBuffers[LastImageIndex];

        // ===========================================================
        // Load — entry point, FROZEN FOREVER
        // ===========================================================
        public static void Load()
        {
            Console.WriteLine("[Vulkan] Load()");
            VK = Vk.GetApi();
            LoadHandlers();
            LoadSettings();

            foreach (var row in RowsOrdered)
            {
                if (!row.TryGetValue("Enabled", out var en) || en.ToLower() != "true") continue;
                if (!row.TryGetValue("ObjectType", out var objType)) continue;
                ProcessRow(objType.ToLower(), row);
            }
        }

        // ===========================================================
        // Handler loader — reads Vulkan_Helper.csv, FROZEN FOREVER
        // ===========================================================
        static void LoadHandlers()
        {
            string path = "Render Engine/Vulkan_Helper.csv";
            if (!File.Exists(path)) { Console.WriteLine($"[Vulkan] Missing {path}"); return; }

            var lines  = File.ReadAllLines(path);
            var header = lines[0].Split(',');

            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line)) continue;

                var cols = line.Split(',');
                var row  = new Dictionary<string, string>();
                for (int j = 0; j < header.Length && j < cols.Length; j++)
                    row[header[j].Trim()] = cols[j].Trim();

                if (!row.TryGetValue("Enabled", out var en) || en.ToLower() != "true") continue;
                if (!row.TryGetValue("Type",    out var typeName)) continue;

                var type = Type.GetType(typeName);
                if (type == null)
                {
                    Console.WriteLine($"[Vulkan] Handler type not found: {typeName}");
                    continue;
                }

                var methods = type
                    .GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                    .Where(m => m.GetCustomAttribute<VulkanHandlerAttribute>() != null);

                foreach (var method in methods)
                {
                    var key = method.GetCustomAttribute<VulkanHandlerAttribute>()!.ObjectType.ToLower();
                    _handlers[key] = r => method.Invoke(null, new object[] { r });
                    Console.WriteLine($"[Vulkan] Registered: {key} -> {typeName}.{method.Name}");
                }
            }
        }

        // ===========================================================
        // Config loader — reads Vulkan.csv, FROZEN FOREVER
        // ===========================================================
        static void LoadSettings()
        {
            Rows.Clear();
            RowsOrdered.Clear();

            string path = "Render Engine/Vulkan.csv";
            if (!File.Exists(path)) { Console.WriteLine($"[Vulkan] Missing {path}"); return; }

            var lines  = File.ReadAllLines(path);
            var header = lines[0].Split(',');

            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line)) continue;

                var cols = line.Split(',');
                var row  = new Dictionary<string, string>();
                for (int j = 0; j < header.Length && j < cols.Length; j++)
                    row[header[j].Trim()] = cols[j].Trim();

                if (row.TryGetValue("ID", out var id) && !string.IsNullOrEmpty(id))
                    Rows[id] = row;

                RowsOrdered.Add(row);
            }

            Console.WriteLine($"[Vulkan] Config rows: {Rows.Count}");
        }

        // ===========================================================
        // Dispatcher — FROZEN FOREVER
        // ===========================================================
        static void ProcessRow(string objType, Dictionary<string, string> row)
        {
            if (_handlers.TryGetValue(objType, out var handler))
                handler(row);
            else
                Console.WriteLine($"[Vulkan] No handler for '{objType}' — create a [VulkanHandler(\"{objType}\")] method and add its class to Vulkan_Helper.csv");
        }

        // ===========================================================
        // Generic CSV-to-struct binder — FROZEN FOREVER
        // ===========================================================
        public static T BindSettings<T>(Dictionary<string, string> row) where T : struct
        {
            T obj = default;
            foreach (var field in typeof(T).GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (row.TryGetValue(field.Name, out var strVal))
                {
                    var val = ConvertValue(strVal, field.FieldType);
                    if (val != null) field.SetValueDirect(__makeref(obj), val);
                }
            }
            return obj;
        }

        public static object? ConvertValue(string str, Type t)
        {
            if (t == typeof(string)) return str;
            if (t == typeof(bool))   return bool.TryParse(str,  out var b)  ? b  : false;
            if (t == typeof(int))    return int.TryParse(str,   out var iv) ? iv : 0;
            if (t == typeof(uint))   return uint.TryParse(str,  out var ui) ? ui : 0u;
            if (t == typeof(float))  return float.TryParse(str, out var f)  ? f  : 0f;
            if (t.IsEnum)            return Enum.TryParse(t, str, true, out var e) ? e : 0;
            return null;
        }

        // ===========================================================
        // SDL surface handshake — called before Load()
        // ===========================================================
        public static void CreateSurfaceFromSDL(IntPtr window)
        {
            Window = window;
            Console.WriteLine("[Vulkan] Window handle stored.");
        }

        // ===========================================================
        // Frame loop — FROZEN FOREVER
        // ===========================================================
        public static unsafe void DoDrawFrame()
        {
            var fence = InFlight[CurrentFrame];
            VK.WaitForFences(Device, 1, &fence, true, ulong.MaxValue);
            FlushDeferred();
            VK.ResetFences(Device, 1, &fence);

            uint imageIndex = 0;
            KhrSwapchain.AcquireNextImage(Device, Swapchain, ulong.MaxValue,
                ImageAvailable[CurrentFrame], default, ref imageIndex);
            LastImageIndex = imageIndex;

            var cmd = CommandBuffers[imageIndex];
            VK.ResetCommandBuffer(cmd, 0);

            var beginInfo = new CommandBufferBeginInfo { SType = StructureType.CommandBufferBeginInfo };
            VK.BeginCommandBuffer(cmd, &beginInfo);

            var clearValues = stackalloc ClearValue[2];
            clearValues[0] = new ClearValue { Color = new ClearColorValue(Render.ClearR, Render.ClearG, Render.ClearB, 1.0f) };
            clearValues[1] = new ClearValue { DepthStencil = new ClearDepthStencilValue(Render.DepthClear, 0) };

            var rpBegin = new RenderPassBeginInfo
            {
                SType           = StructureType.RenderPassBeginInfo,
                RenderPass      = RenderPass,
                Framebuffer     = Framebuffers[imageIndex],
                RenderArea      = new Rect2D { Offset = new Offset2D(0, 0), Extent = SwapExtent },
                ClearValueCount = 2,
                PClearValues    = clearValues
            };
            VK.CmdBeginRenderPass(cmd, &rpBegin, SubpassContents.Inline);

            Render.RenderFrame();

            VK.CmdEndRenderPass(cmd);
            VK.EndCommandBuffer(cmd);

            var waitSem   = ImageAvailable[CurrentFrame];
            var signalSem = RenderFinished[CurrentFrame];
            var waitStage = PipelineStageFlags.ColorAttachmentOutputBit;

            var submit = new SubmitInfo
            {
                SType                = StructureType.SubmitInfo,
                WaitSemaphoreCount   = 1, PWaitSemaphores   = &waitSem,
                PWaitDstStageMask    = &waitStage,
                CommandBufferCount   = 1, PCommandBuffers   = &cmd,
                SignalSemaphoreCount = 1, PSignalSemaphores = &signalSem
            };
            VK.QueueSubmit(GraphicsQueue, 1, &submit, fence);

            var sc      = Swapchain;
            var present = new PresentInfoKHR
            {
                SType              = StructureType.PresentInfoKhr,
                WaitSemaphoreCount = 1, PWaitSemaphores = &signalSem,
                SwapchainCount     = 1, PSwapchains     = &sc,
                PImageIndices      = &imageIndex
            };
            KhrSwapchain.QueuePresent(GraphicsQueue, &present);
            CurrentFrame = (CurrentFrame + 1) % MaxFrames;
        }
    }
}
CSEOF
echo "[Setup] Vulkan.cs done"

# ================================================================
# Vulkan_Helper.cs — GPU helper methods, partial class
# ================================================================
cat > "$RENDER/Vulkan_Helper.cs" << 'CSEOF'
using System;
using System.Collections.Generic;
using Silk.NET.Vulkan;

using VkImage  = Silk.NET.Vulkan.Image;
using VkBuffer = Silk.NET.Vulkan.Buffer;

namespace SETUE
{
    // Low-level GPU helpers — add new helpers here as needed.
    // Vulkan.cs is never touched.
    public static partial class Vulkan
    {
        // ===========================================================
        // Memory type lookup
        // ===========================================================
        static unsafe uint FindMemoryType(uint typeFilter, MemoryPropertyFlags props)
        {
            PhysicalDeviceMemoryProperties memProps;
            VK.GetPhysicalDeviceMemoryProperties(PhysicalDevice, &memProps);
            for (uint i = 0; i < memProps.MemoryTypeCount; i++)
                if ((typeFilter & (1u << (int)i)) != 0 &&
                    (memProps.MemoryTypes[(int)i].PropertyFlags & props) == props)
                    return i;
            return 0;
        }

        // ===========================================================
        // Buffer
        // ===========================================================
        public static unsafe void CreateBuffer(
            ulong size, BufferUsageFlags usage, MemoryPropertyFlags memProps,
            out VkBuffer buffer, out DeviceMemory memory)
        {
            var info = new BufferCreateInfo
            {
                SType       = StructureType.BufferCreateInfo,
                Size        = size,
                Usage       = usage,
                SharingMode = SharingMode.Exclusive
            };
            VK.CreateBuffer(Device, &info, null, out buffer);

            MemoryRequirements req;
            VK.GetBufferMemoryRequirements(Device, buffer, &req);

            var alloc = new MemoryAllocateInfo
            {
                SType           = StructureType.MemoryAllocateInfo,
                AllocationSize  = req.Size,
                MemoryTypeIndex = FindMemoryType(req.MemoryTypeBits, memProps)
            };
            VK.AllocateMemory(Device, &alloc, null, out memory);
            VK.BindBufferMemory(Device, buffer, memory, 0);
        }

        // ===========================================================
        // Image
        // ===========================================================
        public static unsafe void CreateImage(
            uint w, uint h, Format format, ImageTiling tiling,
            ImageUsageFlags usage, MemoryPropertyFlags memProps,
            out VkImage image, out DeviceMemory memory)
        {
            var info = new ImageCreateInfo
            {
                SType         = StructureType.ImageCreateInfo,
                ImageType     = ImageType.Type2D,
                Format        = format,
                Extent        = new Extent3D(w, h, 1),
                MipLevels     = 1,
                ArrayLayers   = 1,
                Samples       = SampleCountFlags.Count1Bit,
                Tiling        = tiling,
                Usage         = usage,
                SharingMode   = SharingMode.Exclusive,
                InitialLayout = ImageLayout.Undefined
            };
            VK.CreateImage(Device, &info, null, out image);

            MemoryRequirements req;
            VK.GetImageMemoryRequirements(Device, image, &req);

            var alloc = new MemoryAllocateInfo
            {
                SType           = StructureType.MemoryAllocateInfo,
                AllocationSize  = req.Size,
                MemoryTypeIndex = FindMemoryType(req.MemoryTypeBits, memProps)
            };
            VK.AllocateMemory(Device, &alloc, null, out memory);
            VK.BindImageMemory(Device, image, memory, 0);
        }

        // ===========================================================
        // Image View
        // ===========================================================
        public static unsafe ImageView CreateImageView(
            VkImage image, Format format, ImageAspectFlags aspect)
        {
            var info = new ImageViewCreateInfo
            {
                SType            = StructureType.ImageViewCreateInfo,
                Image            = image,
                ViewType         = ImageViewType.Type2D,
                Format           = format,
                SubresourceRange = new ImageSubresourceRange
                {
                    AspectMask     = aspect,
                    BaseMipLevel   = 0,
                    LevelCount     = 1,
                    BaseArrayLayer = 0,
                    LayerCount     = 1
                }
            };
            VK.CreateImageView(Device, &info, null, out var view);
            return view;
        }

        // ===========================================================
        // Image Layout Transition
        // ===========================================================
        public static unsafe void TransitionImageLayout(
            VkImage image, ImageLayout oldLayout, ImageLayout newLayout)
        {
            EnsureHelperPool();

            var allocInfo = new CommandBufferAllocateInfo
            {
                SType              = StructureType.CommandBufferAllocateInfo,
                CommandPool        = HelperPool,
                Level              = CommandBufferLevel.Primary,
                CommandBufferCount = 1
            };
            VK.AllocateCommandBuffers(Device, &allocInfo, out var cmd);

            var beginInfo = new CommandBufferBeginInfo
            {
                SType = StructureType.CommandBufferBeginInfo,
                Flags = CommandBufferUsageFlags.OneTimeSubmitBit
            };
            VK.BeginCommandBuffer(cmd, &beginInfo);

            var srcStage  = PipelineStageFlags.TopOfPipeBit;
            var dstStage  = PipelineStageFlags.TransferBit;
            var srcAccess = AccessFlags.None;
            var dstAccess = AccessFlags.TransferWriteBit;

            if (newLayout == ImageLayout.ShaderReadOnlyOptimal)
            {
                srcStage  = PipelineStageFlags.TransferBit;
                dstStage  = PipelineStageFlags.FragmentShaderBit;
                srcAccess = AccessFlags.TransferWriteBit;
                dstAccess = AccessFlags.ShaderReadBit;
            }

            var barrier = new ImageMemoryBarrier
            {
                SType               = StructureType.ImageMemoryBarrier,
                OldLayout           = oldLayout,
                NewLayout           = newLayout,
                SrcQueueFamilyIndex = Vk.QueueFamilyIgnored,
                DstQueueFamilyIndex = Vk.QueueFamilyIgnored,
                Image               = image,
                SrcAccessMask       = srcAccess,
                DstAccessMask       = dstAccess,
                SubresourceRange    = new ImageSubresourceRange
                {
                    AspectMask = ImageAspectFlags.ColorBit,
                    LevelCount = 1,
                    LayerCount = 1
                }
            };
            VK.CmdPipelineBarrier(cmd, srcStage, dstStage, 0, 0, null, 0, null, 1, &barrier);
            VK.EndCommandBuffer(cmd);

            var submit = new SubmitInfo
            {
                SType              = StructureType.SubmitInfo,
                CommandBufferCount = 1,
                PCommandBuffers    = &cmd
            };
            VK.QueueSubmit(GraphicsQueue, 1, &submit, default);
            VK.QueueWaitIdle(GraphicsQueue);
            VK.FreeCommandBuffers(Device, HelperPool, 1, &cmd);
        }

        // ===========================================================
        // Buffer to Image copy
        // ===========================================================
        public static unsafe void CopyBufferToImage(VkBuffer src, VkImage dst, uint w, uint h)
        {
            EnsureHelperPool();

            var allocInfo = new CommandBufferAllocateInfo
            {
                SType              = StructureType.CommandBufferAllocateInfo,
                CommandPool        = HelperPool,
                Level              = CommandBufferLevel.Primary,
                CommandBufferCount = 1
            };
            VK.AllocateCommandBuffers(Device, &allocInfo, out var cmd);

            var beginInfo = new CommandBufferBeginInfo
            {
                SType = StructureType.CommandBufferBeginInfo,
                Flags = CommandBufferUsageFlags.OneTimeSubmitBit
            };
            VK.BeginCommandBuffer(cmd, &beginInfo);

            var region = new BufferImageCopy
            {
                ImageSubresource = new ImageSubresourceLayers
                {
                    AspectMask = ImageAspectFlags.ColorBit,
                    LayerCount = 1
                },
                ImageExtent = new Extent3D(w, h, 1)
            };
            VK.CmdCopyBufferToImage(cmd, src, dst, ImageLayout.TransferDstOptimal, 1, &region);
            VK.EndCommandBuffer(cmd);

            var submit = new SubmitInfo
            {
                SType              = StructureType.SubmitInfo,
                CommandBufferCount = 1,
                PCommandBuffers    = &cmd
            };
            VK.QueueSubmit(GraphicsQueue, 1, &submit, default);
            VK.QueueWaitIdle(GraphicsQueue);
            VK.FreeCommandBuffers(Device, HelperPool, 1, &cmd);
        }

        // ===========================================================
        // Deferred GPU memory free
        // ===========================================================
        public static void DeferFree(VkBuffer buf, DeviceMemory mem) =>
            DeferredFree.Add((buf, mem));

        public static unsafe void FlushDeferred()
        {
            if (DeferredFree.Count == 0) return;
            VK.QueueWaitIdle(GraphicsQueue);
            foreach (var (buf, mem) in DeferredFree)
            {
                VK.DestroyBuffer(Device, buf, null);
                VK.FreeMemory(Device, mem, null);
            }
            DeferredFree.Clear();
        }

        // ===========================================================
        // One-time submit command pool
        // ===========================================================
        public static unsafe void EnsureHelperPool()
        {
            if (HelperPoolReady) return;
            var info = new CommandPoolCreateInfo
            {
                SType            = StructureType.CommandPoolCreateInfo,
                Flags            = CommandPoolCreateFlags.TransientBit,
                QueueFamilyIndex = GraphicsQueueFamily
            };
            VK.CreateCommandPool(Device, &info, null, out var pool);
            HelperPool      = pool;
            HelperPoolReady = true;
        }

        // ===========================================================
        // Font Atlas Upload
        // ===========================================================
        static readonly Dictionary<string, DescriptorSet> _fontDescriptors = new();

        public static unsafe DescriptorSet GetOrUploadAtlas(
            SETUE.UI.Font atlas, string pipelineId)
        {
            if (_fontDescriptors.TryGetValue(atlas.FontId, out var cached)) return cached;

            ulong size = (ulong)atlas.Pixels.Length;
            CreateBuffer(size,
                BufferUsageFlags.TransferSrcBit,
                MemoryPropertyFlags.HostVisibleBit | MemoryPropertyFlags.HostCoherentBit,
                out var stagingBuf, out var stagingMem);

            void* mapped;
            VK.MapMemory(Device, stagingMem, 0, size, 0, &mapped);
            fixed (byte* src = atlas.Pixels)
                System.Buffer.MemoryCopy(src, mapped, (long)size, (long)size);
            VK.UnmapMemory(Device, stagingMem);

            CreateImage((uint)atlas.AtlasWidth, (uint)atlas.AtlasHeight,
                Format.R8Unorm, ImageTiling.Optimal,
                ImageUsageFlags.TransferDstBit | ImageUsageFlags.SampledBit,
                MemoryPropertyFlags.DeviceLocalBit,
                out var img, out var imgMem);

            TransitionImageLayout(img, ImageLayout.Undefined, ImageLayout.TransferDstOptimal);
            CopyBufferToImage(stagingBuf, img, (uint)atlas.AtlasWidth, (uint)atlas.AtlasHeight);
            TransitionImageLayout(img, ImageLayout.TransferDstOptimal, ImageLayout.ShaderReadOnlyOptimal);

            VK.DestroyBuffer(Device, stagingBuf, null);
            VK.FreeMemory(Device, stagingMem, null);

            var view = CreateImageView(img, Format.R8Unorm, ImageAspectFlags.ColorBit);

            var sampInfo = new SamplerCreateInfo
            {
                SType        = StructureType.SamplerCreateInfo,
                MagFilter    = Filter.Nearest,
                MinFilter    = Filter.Nearest,
                MipmapMode   = SamplerMipmapMode.Nearest,
                AddressModeU = SamplerAddressMode.ClampToEdge,
                AddressModeV = SamplerAddressMode.ClampToEdge,
                AddressModeW = SamplerAddressMode.ClampToEdge
            };
            VK.CreateSampler(Device, &sampInfo, null, out var sampler);
            atlas.ImageView = view;
            atlas.Sampler   = sampler;

            var poolSize = new DescriptorPoolSize
            {
                Type            = DescriptorType.CombinedImageSampler,
                DescriptorCount = 1
            };
            var poolInfo = new DescriptorPoolCreateInfo
            {
                SType         = StructureType.DescriptorPoolCreateInfo,
                MaxSets       = 1,
                PoolSizeCount = 1,
                PPoolSizes    = &poolSize
            };
            VK.CreateDescriptorPool(Device, &poolInfo, null, out var pool);

            var dsLayout  = Shaders.GetSamplerLayout(pipelineId);
            var allocInfo = new DescriptorSetAllocateInfo
            {
                SType              = StructureType.DescriptorSetAllocateInfo,
                DescriptorPool     = pool,
                DescriptorSetCount = 1,
                PSetLayouts        = &dsLayout
            };
            VK.AllocateDescriptorSets(Device, &allocInfo, out var ds);

            var imageInfo = new DescriptorImageInfo
            {
                ImageView   = view,
                Sampler     = sampler,
                ImageLayout = ImageLayout.ShaderReadOnlyOptimal
            };
            var write = new WriteDescriptorSet
            {
                SType           = StructureType.WriteDescriptorSet,
                DstSet          = ds,
                DstBinding      = 0,
                DescriptorCount = 1,
                DescriptorType  = DescriptorType.CombinedImageSampler,
                PImageInfo      = &imageInfo
            };
            VK.UpdateDescriptorSets(Device, 1, &write, 0, null);

            _fontDescriptors[atlas.FontId] = ds;
            return ds;
        }
    }
}
CSEOF
echo "[Setup] Vulkan_Helper.cs done"

# ================================================================
# VulkanHandlers_Core.cs — existing handlers moved out of Vulkan.cs
# ================================================================
cat > "$RENDER/VulkanHandlers_Core.cs" << 'CSEOF'
using System;
using System.Collections.Generic;
using System.Linq;
using Silk.NET.Vulkan;
using Silk.NET.Vulkan.Extensions.KHR;
using Silk.NET.Core;
using Silk.NET.Core.Native;
using SDL3;

using VkImage     = Silk.NET.Vulkan.Image;
using VkSemaphore = Silk.NET.Vulkan.Semaphore;

namespace SETUE
{
    // ---------------------------------------------------------------
    // Core handlers — instance, device, swapchain, renderpass, pipeline
    // To add a NEW system: create VulkanHandlers_YourSystem.cs
    // and add one row to Vulkan_Helper.csv. Nothing else changes.
    // ---------------------------------------------------------------
    public static class VulkanHandlers_Core
    {
        // ===========================================================
        // Instance
        // ===========================================================
        [VulkanHandler("instance")]
        public static void Handle_Instance(Dictionary<string, string> row)
        {
            CreateInstance(row);
            CreateSurface();
        }

        struct InstanceSettings
        {
            public string AppName           = "App";
            public string EngineName        = "Engine";
            public string ApiVersion        = "1.3";
            public string EnabledExtensions = "";
            public string EnabledLayers     = "";
        }

        static unsafe void CreateInstance(Dictionary<string, string> row)
        {
            var s = Vulkan.BindSettings<InstanceSettings>(row);

            var sdlExts   = SDL.VulkanGetInstanceExtensions(out uint _) ?? Array.Empty<string>();
            var extraExts = s.EnabledExtensions.Split(new[] { ';', '|', ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var allExts   = sdlExts.Concat(extraExts).Distinct().ToArray();
            var layers    = s.EnabledLayers.Split(new[] { ';', '|', ' ' }, StringSplitOptions.RemoveEmptyEntries);

            var appNamePtr    = SilkMarshal.StringToPtr(s.AppName);
            var engineNamePtr = SilkMarshal.StringToPtr(s.EngineName);
            var extPtr        = SilkMarshal.StringArrayToPtr(allExts);
            var layerPtr      = layers.Length > 0 ? SilkMarshal.StringArrayToPtr(layers) : IntPtr.Zero;

            var appInfo = new ApplicationInfo
            {
                SType              = StructureType.ApplicationInfo,
                PApplicationName   = (byte*)appNamePtr,
                ApplicationVersion = new Version32(1, 0, 0),
                PEngineName        = (byte*)engineNamePtr,
                EngineVersion      = new Version32(1, 0, 0),
                ApiVersion         = s.ApiVersion switch
                {
                    "1.0" => Vk.Version10,
                    "1.1" => Vk.Version11,
                    "1.2" => Vk.Version12,
                    _     => Vk.Version13
                }
            };

            var createInfo = new InstanceCreateInfo
            {
                SType                   = StructureType.InstanceCreateInfo,
                PApplicationInfo        = &appInfo,
                EnabledExtensionCount   = (uint)allExts.Length,
                PpEnabledExtensionNames = (byte**)extPtr,
                EnabledLayerCount       = (uint)layers.Length,
                PpEnabledLayerNames     = layers.Length > 0 ? (byte**)layerPtr : null
            };

            var result = Vulkan.VK.CreateInstance(&createInfo, null, out var instance);
            Vulkan.Instance = instance;
            Console.WriteLine(result == Result.Success ? "[Vulkan] Instance OK" : $"[Vulkan] Instance FAILED: {result}");

            SilkMarshal.Free(appNamePtr);
            SilkMarshal.Free(engineNamePtr);
            SilkMarshal.Free(extPtr);
            if (layerPtr != IntPtr.Zero) SilkMarshal.Free(layerPtr);
        }

        static void CreateSurface()
        {
            bool ok = SDL.VulkanCreateSurface(Vulkan.Window, Vulkan.Instance.Handle, IntPtr.Zero, out var handle);
            if (!ok) Console.WriteLine($"[Vulkan] Surface FAILED: {SDL.GetError()}");
            else { Vulkan.Surface = new SurfaceKHR((ulong)handle); Console.WriteLine("[Vulkan] Surface OK"); }
        }

        // ===========================================================
        // Device
        // ===========================================================
        [VulkanHandler("device")]
        public static void Handle_Device(Dictionary<string, string> row) => CreateDevice(row);

        struct DeviceSettings
        {
            public string DevicePreference   = "discrete_gpu";
            public string RequiredExtensions = "VK_KHR_swapchain";
        }

        static unsafe void CreateDevice(Dictionary<string, string> row)
        {
            var s = Vulkan.BindSettings<DeviceSettings>(row);

            uint count = 0;
            Vulkan.VK.EnumeratePhysicalDevices(Vulkan.Instance, ref count, null);
            var devices = new PhysicalDevice[count];
            fixed (PhysicalDevice* ptr = devices)
                Vulkan.VK.EnumeratePhysicalDevices(Vulkan.Instance, ref count, ptr);

            Vulkan.PhysicalDevice = PickDevice(devices, s.DevicePreference);
            Vulkan.VK.GetPhysicalDeviceProperties(Vulkan.PhysicalDevice, out var props);
            Console.WriteLine($"[Vulkan] GPU: {SilkMarshal.PtrToString((nint)props.DeviceName)}");

            uint qCount = 0;
            Vulkan.VK.GetPhysicalDeviceQueueFamilyProperties(Vulkan.PhysicalDevice, ref qCount, null);
            var queues = new QueueFamilyProperties[qCount];
            fixed (QueueFamilyProperties* ptr = queues)
                Vulkan.VK.GetPhysicalDeviceQueueFamilyProperties(Vulkan.PhysicalDevice, ref qCount, ptr);

            for (uint i = 0; i < qCount; i++)
                if (queues[i].QueueFlags.HasFlag(QueueFlags.GraphicsBit))
                { Vulkan.GraphicsQueueFamily = i; break; }

            float priority  = 1.0f;
            var queueCreate = new DeviceQueueCreateInfo
            {
                SType            = StructureType.DeviceQueueCreateInfo,
                QueueFamilyIndex = Vulkan.GraphicsQueueFamily,
                QueueCount       = 1,
                PQueuePriorities = &priority
            };

            var extList = s.RequiredExtensions
                .Split(new[] { ';', '|', ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var extPtr  = SilkMarshal.StringArrayToPtr(extList);

            var deviceCreate = new DeviceCreateInfo
            {
                SType                   = StructureType.DeviceCreateInfo,
                QueueCreateInfoCount    = 1,
                PQueueCreateInfos       = &queueCreate,
                EnabledExtensionCount   = (uint)extList.Length,
                PpEnabledExtensionNames = (byte**)extPtr
            };

            var result = Vulkan.VK.CreateDevice(Vulkan.PhysicalDevice, &deviceCreate, null, out var device);
            Vulkan.Device = device;
            Console.WriteLine(result == Result.Success ? "[Vulkan] Device OK" : $"[Vulkan] Device FAILED: {result}");

            SilkMarshal.Free(extPtr);
            Vulkan.VK.GetDeviceQueue(Vulkan.Device, Vulkan.GraphicsQueueFamily, 0, out var queue);
            Vulkan.GraphicsQueue = queue;
        }

        static unsafe PhysicalDevice PickDevice(PhysicalDevice[] devices, string pref)
        {
            foreach (var d in devices)
            {
                Vulkan.VK.GetPhysicalDeviceProperties(d, out var p);
                if (pref == "discrete_gpu"   && p.DeviceType == PhysicalDeviceType.DiscreteGpu)   return d;
                if (pref == "integrated_gpu" && p.DeviceType == PhysicalDeviceType.IntegratedGpu) return d;
            }
            return devices[0];
        }

        // ===========================================================
        // Swapchain
        // ===========================================================
        [VulkanHandler("swapchain")]
        public static void Handle_Swapchain(Dictionary<string, string> row) => CreateSwapchain(row);

        struct SwapchainSettings
        {
            public string SurfaceFormat  = "B8G8R8A8_SRGB";
            public string ColorSpace     = "SRGB_NONLINEAR";
            public string PresentMode    = "FIFO";
            public string CompositeAlpha = "OPAQUE";
        }

        static unsafe void CreateSwapchain(Dictionary<string, string> row)
        {
            if (!Vulkan.VK.TryGetInstanceExtension(Vulkan.Instance, out KhrSurface khrSurface))
            { Console.WriteLine("[Vulkan] KhrSurface missing"); return; }
            Vulkan.KhrSurface = khrSurface;

            khrSurface.GetPhysicalDeviceSurfaceCapabilities(Vulkan.PhysicalDevice, Vulkan.Surface, out var caps);

            uint fmtCount = 0;
            khrSurface.GetPhysicalDeviceSurfaceFormats(Vulkan.PhysicalDevice, Vulkan.Surface, ref fmtCount, null);
            var formats = new SurfaceFormatKHR[fmtCount];
            fixed (SurfaceFormatKHR* ptr = formats)
                khrSurface.GetPhysicalDeviceSurfaceFormats(Vulkan.PhysicalDevice, Vulkan.Surface, ref fmtCount, ptr);

            var s = Vulkan.BindSettings<SwapchainSettings>(row);

            var preferredFormat = s.SurfaceFormat.ToUpper() switch
            {
                "R8G8B8A8_SRGB" => Format.R8G8B8A8Srgb,
                _               => Format.B8G8R8A8Srgb
            };
            var presentMode = s.PresentMode.ToUpper() switch
            {
                "MAILBOX"   => PresentModeKHR.MailboxKhr,
                "IMMEDIATE" => PresentModeKHR.ImmediateKhr,
                _           => PresentModeKHR.FifoKhr
            };

            var chosen = formats.FirstOrDefault(f => f.Format == preferredFormat);
            if (chosen.Format == Format.Undefined) chosen = formats[0];
            Vulkan.SwapFormat = chosen.Format;
            Vulkan.SwapExtent = new Extent2D(1920, 1080);

            uint imageCount = caps.MinImageCount + 1;
            if (caps.MaxImageCount > 0 && imageCount > caps.MaxImageCount)
                imageCount = caps.MaxImageCount;

            var createInfo = new SwapchainCreateInfoKHR
            {
                SType            = StructureType.SwapchainCreateInfoKhr,
                Surface          = Vulkan.Surface,
                MinImageCount    = imageCount,
                ImageFormat      = Vulkan.SwapFormat,
                ImageColorSpace  = chosen.ColorSpace,
                ImageExtent      = Vulkan.SwapExtent,
                ImageArrayLayers = 1,
                ImageUsage       = ImageUsageFlags.ColorAttachmentBit,
                ImageSharingMode = SharingMode.Exclusive,
                PreTransform     = caps.CurrentTransform,
                CompositeAlpha   = CompositeAlphaFlagsKHR.OpaqueBitKhr,
                PresentMode      = presentMode,
                Clipped          = true
            };

            if (!Vulkan.VK.TryGetDeviceExtension(Vulkan.Instance, Vulkan.Device, out KhrSwapchain khrSwap))
            { Console.WriteLine("[Vulkan] KhrSwapchain missing"); return; }
            Vulkan.KhrSwapchain = khrSwap;

            khrSwap.CreateSwapchain(Vulkan.Device, &createInfo, null, out var swapchain);
            Vulkan.Swapchain = swapchain;

            uint imgCount = 0;
            khrSwap.GetSwapchainImages(Vulkan.Device, Vulkan.Swapchain, ref imgCount, null);
            var swapImages = new VkImage[imgCount];
            fixed (VkImage* ptr = swapImages)
                khrSwap.GetSwapchainImages(Vulkan.Device, Vulkan.Swapchain, ref imgCount, ptr);
            Vulkan.SwapImages = swapImages;

            Console.WriteLine($"[Vulkan] Swapchain OK images={imgCount}");
        }

        // ===========================================================
        // RenderPass + Framebuffers
        // ===========================================================
        [VulkanHandler("renderpass")]
        public static void Handle_RenderPass(Dictionary<string, string> row)
        {
            CreateRenderPass(row);
            CreateFramebuffers(row);
        }

        struct RenderPassSettings
        {
            public string Attachment0_LoadOp         = "CLEAR";
            public string Attachment0_StoreOp        = "STORE";
            public string Attachment0_InitialLayout  = "UNDEFINED";
            public string Attachment0_FinalLayout    = "PRESENT_SRC_KHR";
            public string Attachment1_Format         = "";
            public string Attachment1_LoadOp         = "CLEAR";
            public string Attachment1_StoreOp        = "DONTCARE";
            public string Attachment1_InitialLayout  = "UNDEFINED";
            public string Attachment1_FinalLayout    = "DEPTH_STENCIL_ATTACHMENT_OPTIMAL";
            public string Subpass0_DepthAttachment   = "";
            public string Dependency_SrcStage        = "COLOR_ATTACHMENT_OUTPUT";
            public string Dependency_DstStage        = "COLOR_ATTACHMENT_OUTPUT";
        }

        static unsafe void CreateRenderPass(Dictionary<string, string> row)
        {
            var s        = Vulkan.BindSettings<RenderPassSettings>(row);
            bool hasDepth = !string.IsNullOrEmpty(s.Attachment1_Format);

            var colorAtt = new AttachmentDescription
            {
                Format         = Vulkan.SwapFormat,
                Samples        = SampleCountFlags.Count1Bit,
                LoadOp         = ParseLoadOp(s.Attachment0_LoadOp),
                StoreOp        = ParseStoreOp(s.Attachment0_StoreOp),
                StencilLoadOp  = AttachmentLoadOp.DontCare,
                StencilStoreOp = AttachmentStoreOp.DontCare,
                InitialLayout  = ParseLayout(s.Attachment0_InitialLayout),
                FinalLayout    = ParseLayout(s.Attachment0_FinalLayout)
            };

            var depthFmt = s.Attachment1_Format.ToUpper() switch
            {
                "D24_UNORM_S8_UINT" => Format.D24UnormS8Uint,
                _                   => Format.D32Sfloat
            };

            var depthAtt = new AttachmentDescription
            {
                Format         = depthFmt,
                Samples        = SampleCountFlags.Count1Bit,
                LoadOp         = ParseLoadOp(s.Attachment1_LoadOp),
                StoreOp        = ParseStoreOp(s.Attachment1_StoreOp),
                StencilLoadOp  = AttachmentLoadOp.DontCare,
                StencilStoreOp = AttachmentStoreOp.DontCare,
                InitialLayout  = ParseLayout(s.Attachment1_InitialLayout),
                FinalLayout    = ParseLayout(s.Attachment1_FinalLayout)
            };

            var colorRef = new AttachmentReference { Attachment = 0, Layout = ImageLayout.ColorAttachmentOptimal };
            var depthRef = new AttachmentReference { Attachment = 1, Layout = ImageLayout.DepthStencilAttachmentOptimal };
            bool useDepth = hasDepth && s.Subpass0_DepthAttachment == "1";

            var subpass = new SubpassDescription
            {
                PipelineBindPoint       = PipelineBindPoint.Graphics,
                ColorAttachmentCount    = 1,
                PColorAttachments       = &colorRef,
                PDepthStencilAttachment = useDepth ? &depthRef : null
            };

            var srcStage = s.Dependency_SrcStage.ToUpper() == "TOP_OF_PIPE"
                ? PipelineStageFlags.TopOfPipeBit
                : PipelineStageFlags.ColorAttachmentOutputBit;

            var dep = new SubpassDependency
            {
                SrcSubpass    = Vk.SubpassExternal,
                DstSubpass    = 0,
                SrcStageMask  = srcStage | (hasDepth ? PipelineStageFlags.EarlyFragmentTestsBit : 0),
                DstStageMask  = PipelineStageFlags.ColorAttachmentOutputBit | (hasDepth ? PipelineStageFlags.EarlyFragmentTestsBit : 0),
                SrcAccessMask = AccessFlags.None,
                DstAccessMask = AccessFlags.ColorAttachmentWriteBit | (hasDepth ? AccessFlags.DepthStencilAttachmentWriteBit : 0)
            };

            var atts = stackalloc AttachmentDescription[2];
            atts[0]  = colorAtt;
            atts[1]  = depthAtt;

            var rpInfo = new RenderPassCreateInfo
            {
                SType           = StructureType.RenderPassCreateInfo,
                AttachmentCount = hasDepth ? 2u : 1u,
                PAttachments    = atts,
                SubpassCount    = 1,
                PSubpasses      = &subpass,
                DependencyCount = 1,
                PDependencies   = &dep
            };

            var result = Vulkan.VK.CreateRenderPass(Vulkan.Device, &rpInfo, null, out var rp);
            Vulkan.RenderPass = rp;
            Console.WriteLine(result == Result.Success
                ? $"[Vulkan] RenderPass OK depth={hasDepth}"
                : $"[Vulkan] RenderPass FAILED: {result}");
        }

        static unsafe void CreateFramebuffers(Dictionary<string, string> row)
        {
            var s        = Vulkan.BindSettings<RenderPassSettings>(row);
            bool hasDepth = !string.IsNullOrEmpty(s.Attachment1_Format);
            var depthFmt  = s.Attachment1_Format.ToUpper() switch
            {
                "D24_UNORM_S8_UINT" => Format.D24UnormS8Uint,
                _                   => Format.D32Sfloat
            };

            if (hasDepth)
            {
                Vulkan.CreateImage(
                    Vulkan.SwapExtent.Width, Vulkan.SwapExtent.Height,
                    depthFmt, ImageTiling.Optimal,
                    ImageUsageFlags.DepthStencilAttachmentBit,
                    MemoryPropertyFlags.DeviceLocalBit,
                    out var di, out var dm);
                Vulkan.DepthImage     = di;
                Vulkan.DepthMemory    = dm;
                Vulkan.DepthImageView = Vulkan.CreateImageView(di, depthFmt, ImageAspectFlags.DepthBit);
                Console.WriteLine("[Vulkan] Depth image OK");
            }

            var views = new ImageView[Vulkan.SwapImages.Length];
            for (int i = 0; i < views.Length; i++)
                views[i] = Vulkan.CreateImageView(Vulkan.SwapImages[i], Vulkan.SwapFormat, ImageAspectFlags.ColorBit);
            Vulkan.SwapImageViews = views;

            var fbs = new Framebuffer[Vulkan.SwapImages.Length];
            for (int i = 0; i < fbs.Length; i++)
            {
                var atts = stackalloc ImageView[2];
                atts[0]  = views[i];
                atts[1]  = Vulkan.DepthImageView;

                var fbInfo = new FramebufferCreateInfo
                {
                    SType           = StructureType.FramebufferCreateInfo,
                    RenderPass      = Vulkan.RenderPass,
                    AttachmentCount = hasDepth ? 2u : 1u,
                    PAttachments    = atts,
                    Width           = Vulkan.SwapExtent.Width,
                    Height          = Vulkan.SwapExtent.Height,
                    Layers          = 1
                };
                Vulkan.VK.CreateFramebuffer(Vulkan.Device, &fbInfo, null, out fbs[i]);
            }
            Vulkan.Framebuffers = fbs;
            Console.WriteLine($"[Vulkan] Framebuffers OK count={fbs.Length}");
        }

        static AttachmentLoadOp  ParseLoadOp(string s)  => s.ToUpper() switch
            { "LOAD" => AttachmentLoadOp.Load, "DONTCARE" => AttachmentLoadOp.DontCare, _ => AttachmentLoadOp.Clear };
        static AttachmentStoreOp ParseStoreOp(string s) =>
            s.ToUpper() == "DONTCARE" ? AttachmentStoreOp.DontCare : AttachmentStoreOp.Store;
        static ImageLayout ParseLayout(string s) => s.ToUpper() switch
        {
            "COLOR_ATTACHMENT_OPTIMAL"         => ImageLayout.ColorAttachmentOptimal,
            "PRESENT_SRC_KHR"                  => ImageLayout.PresentSrcKhr,
            "DEPTH_STENCIL_ATTACHMENT_OPTIMAL" => ImageLayout.DepthStencilAttachmentOptimal,
            "SHADER_READ_ONLY_OPTIMAL"          => ImageLayout.ShaderReadOnlyOptimal,
            _                                  => ImageLayout.Undefined
        };

        // ===========================================================
        // Pipeline + Render Loop
        // ===========================================================
        [VulkanHandler("pipeline")]
        public static void Handle_Pipeline(Dictionary<string, string> row)
        {
            Console.WriteLine("[Vulkan] Pipeline OK");
            CreateRenderLoop(row);
        }

        struct RenderLoopSettings
        {
            public int MaxFramesInFlight = 2;
        }

        static unsafe void CreateRenderLoop(Dictionary<string, string> row)
        {
            var s = Vulkan.BindSettings<RenderLoopSettings>(row);
            Vulkan.MaxFrames = s.MaxFramesInFlight;

            var poolInfo = new CommandPoolCreateInfo
            {
                SType            = StructureType.CommandPoolCreateInfo,
                QueueFamilyIndex = Vulkan.GraphicsQueueFamily,
                Flags            = CommandPoolCreateFlags.ResetCommandBufferBit
            };
            Vulkan.VK.CreateCommandPool(Vulkan.Device, &poolInfo, null, out var cmdPool);
            Vulkan.CommandPool = cmdPool;

            var cmdBufs   = new CommandBuffer[Vulkan.Framebuffers.Length];
            var allocInfo = new CommandBufferAllocateInfo
            {
                SType              = StructureType.CommandBufferAllocateInfo,
                CommandPool        = Vulkan.CommandPool,
                Level              = CommandBufferLevel.Primary,
                CommandBufferCount = (uint)cmdBufs.Length
            };
            fixed (CommandBuffer* ptr = cmdBufs)
                Vulkan.VK.AllocateCommandBuffers(Vulkan.Device, &allocInfo, ptr);
            Vulkan.CommandBuffers = cmdBufs;

            var imgAvail  = new VkSemaphore[Vulkan.MaxFrames];
            var renderFin = new VkSemaphore[Vulkan.MaxFrames];
            var fences    = new Fence[Vulkan.MaxFrames];

            var semInfo   = new SemaphoreCreateInfo { SType = StructureType.SemaphoreCreateInfo };
            var fenceInfo = new FenceCreateInfo     { SType = StructureType.FenceCreateInfo, Flags = FenceCreateFlags.SignaledBit };

            for (int i = 0; i < Vulkan.MaxFrames; i++)
            {
                Vulkan.VK.CreateSemaphore(Vulkan.Device, &semInfo,   null, out imgAvail[i]);
                Vulkan.VK.CreateSemaphore(Vulkan.Device, &semInfo,   null, out renderFin[i]);
                Vulkan.VK.CreateFence    (Vulkan.Device, &fenceInfo, null, out fences[i]);
            }
            Vulkan.ImageAvailable = imgAvail;
            Vulkan.RenderFinished = renderFin;
            Vulkan.InFlight       = fences;

            SETUE.RenderEngine.Shaders.Load();
            SETUE.RenderEngine.Shaders.Init(Vulkan.VK, Vulkan.Device, Vulkan.RenderPass, Vulkan.SwapExtent);
            SETUE.RenderEngine.MeshBuffer.Init(Vulkan.VK, Vulkan.Device, Vulkan.PhysicalDevice);
            SETUE.Objects3D.Objects.Load();
            Draw.Load();
            Render.Init();

            Console.WriteLine("[Vulkan] RenderLoop OK");
        }
    }
}
CSEOF
echo "[Setup] VulkanHandlers_Core.cs done"

echo ""
echo "=============================================="
echo " SETUE Vulkan Engine files written to:"
echo " $RENDER"
echo "=============================================="
echo " Vulkan.csv              — config rows (build order + settings)"
echo " Vulkan_Helper.csv       — handler class manifest"
echo " Vulkan.cs               — FROZEN dispatcher, never touch again"
echo " Vulkan_Helper.cs        — GPU helper methods"
echo " VulkanHandlers_Core.cs  — core Vulkan handlers"
echo ""
echo " To add text, font, 2D, 3D, compute, or anything new:"
echo "  1. Add a row to Vulkan.csv"
echo "  2. Add a row to Vulkan_Helper.csv"
echo "  3. Create VulkanHandlers_YourSystem.cs"
echo "  Vulkan.cs is never touched again."
echo "=============================================="
