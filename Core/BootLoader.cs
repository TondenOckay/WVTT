using System;
using System.Collections.Generic;
using System.IO;

namespace SETUE.Core;

public static class BootLoader
{
    public static int WindowWidth { get; private set; } = 1280;
    public static int WindowHeight { get; private set; } = 720;
    public static string WindowTitle { get; private set; } = "Data Driven Engine";
    public static bool VSync { get; private set; } = true;
    
    public static void Load()
    {
        string path = "Core/BootLoader.csv";
        
        if (!File.Exists(path))
        {
            Console.WriteLine($"[BootLoader] File not found: {path}, using defaults");
            return;
        }
        
        var lines = File.ReadAllLines(path);
        
        for (int i = 1; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
            
            var parts = line.Split(',');
            if (parts.Length < 2) continue;
            
            string setting = parts[0].Trim();
            string value = parts[1].Trim();
            
            switch (setting)
            {
                case "window_width": WindowWidth = int.Parse(value); break;
                case "window_height": WindowHeight = int.Parse(value); break;
                case "window_title": WindowTitle = value; break;
                case "vsync": VSync = bool.Parse(value); break;
            }
        }
        
        Console.WriteLine($"[BootLoader] Loaded: {WindowWidth}x{WindowHeight} '{WindowTitle}'");
    }
}
