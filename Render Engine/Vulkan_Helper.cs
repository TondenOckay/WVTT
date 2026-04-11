using SETUE.RenderEngine;
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
