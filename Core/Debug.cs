using System;
using System.Collections.Generic;
using System.IO;

namespace SETUE.Core
{
    public static class Debug
    {
        private static Dictionary<string, (bool load, bool update, bool errors, bool verbose)> _settings = new();

        public static void Load()
        {
            string path = "Core/Debug.csv";
            if (!File.Exists(path))
            {
                Console.WriteLine("[Debug] No Debug.csv found – logging disabled.");
                return;
            }
            var lines = File.ReadAllLines(path);
            for (int i = 1; i < lines.Length; i++)
            {
                var parts = lines[i].Split(',');
                if (parts.Length < 5) continue;
                string name = parts[0].Trim();
                bool logLoad   = parts[1].Trim().ToLower() == "true";
                bool logUpdate = parts[2].Trim().ToLower() == "true";
                bool logErrors = parts[3].Trim().ToLower() == "true";
                bool verbose   = parts[4].Trim().ToLower() == "true";
                _settings[name] = (logLoad, logUpdate, logErrors, verbose);
            }
            Console.WriteLine($"[Debug] Loaded settings for {_settings.Count} systems");
        }

        private static bool ShouldLog(string systemName, string level)
        {
            if (!_settings.TryGetValue(systemName, out var s))
                return false;
            return level switch
            {
                "load"    => s.load,
                "update"  => s.update,
                "error"   => s.errors,
                "verbose" => s.verbose,
                _         => false
            };
        }

        public static void Log(string systemName, string message)
        {
            Console.WriteLine($"[{systemName}] {message}");
        }

        public static void LogLoad(string systemName, string message)
        {
            if (ShouldLog(systemName, "load"))
                Console.WriteLine($"[{systemName}] {message}");
        }

        public static void LogUpdate(string systemName, string message)
        {
            if (ShouldLog(systemName, "update"))
                Console.WriteLine($"[{systemName}] {message}");
        }

        public static void LogError(string systemName, string message)
        {
            if (ShouldLog(systemName, "error"))
                Console.WriteLine($"[{systemName}] ERROR: {message}");
        }

        public static void LogVerbose(string systemName, string message)
        {
            if (ShouldLog(systemName, "verbose"))
                Console.WriteLine($"[{systemName}] {message}");
        }

        // Legacy compatibility
        public static bool ShouldLogLoad(string systemName) => ShouldLog(systemName, "load");
        public static bool ShouldLogUpdate(string systemName) => ShouldLog(systemName, "update");
        public static bool ShouldLogError(string systemName) => ShouldLog(systemName, "error");
        public static bool ShouldLogVerbose(string systemName) => ShouldLog(systemName, "verbose");
    }
}
