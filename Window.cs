using System;
using SDL3;
using SETUE.Core;

namespace SETUE
{
    public static class Window
    {
        static IntPtr _window;
        static bool _shouldQuit;

        public static void Load()
        {
            if (!SDL.Init(SDL.InitFlags.Video))
            {
                Debug.LogError("Window", $"SDL_Init failed: {SDL.GetError()}");
                return;
            }

            _window = SDL.CreateWindow("SETUE Engine", 1920, 1080, SDL.WindowFlags.Vulkan | SDL.WindowFlags.Resizable);
            if (_window == IntPtr.Zero)
            {
                Debug.LogError("Window", $"SDL_CreateWindow failed: {SDL.GetError()}");
                return;
            }

            Vulkan.CreateSurfaceFromSDL(_window);
            Debug.LogLoad("Window", "Window created on scheduler thread");
        }

        public static void ProcessEvents()
        {
            while (SDL.PollEvent(out var e))
            {
                if (e.Type == (uint)SDL.EventType.Quit)
                {
                    _shouldQuit = true;
                    MasterClock.Stop();
                }
            }
        }

        public static IntPtr GetHandle() => _window;
        public static bool ShouldQuit() => _shouldQuit;
    }
}
