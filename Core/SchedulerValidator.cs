using System;
using System.Collections.Generic;
using System.Linq;

namespace SETUE.Core
{
    public static class SchedulerValidator
    {
        public class ValidationResult
        {
            public bool IsValid { get; set; } = true;
            public List<string> Errors { get; set; } = new();
        }

        public static ValidationResult Validate(List<SchedulerEntry> entries)
        {
            var result = new ValidationResult();

            // Helper to check if an entry exists and is enabled
            bool ExistsEnabled(string className, string method)
            {
                return entries.Any(e =>
                    e.ClassName == className &&
                    e.Method == method &&
                    e.Enabled);
            }

            // Helper to find first enabled entry for a given class/method
            SchedulerEntry? GetEntry(string className, string method) =>
                entries.FirstOrDefault(e => e.ClassName == className && e.Method == method && e.Enabled);

            // ------------------------------------------------------------
            // 1. REQUIRED ENTRIES (must exist and be enabled)
            // ------------------------------------------------------------
            var required = new[]
            {
                ("SETUE.Window", "Load"),
                ("SETUE.Vulkan", "Load"),
                ("SETUE.Window", "ProcessEvents"),
                ("SETUE.Vulkan", "DoDrawFrame")
            };

            foreach (var (cls, method) in required)
            {
                if (!ExistsEnabled(cls, method))
                {
                    result.IsValid = false;
                    result.Errors.Add($"Required entry missing or disabled: {cls}.{method}");
                }
            }

            // ------------------------------------------------------------
            // 2. ORDERING CONSTRAINTS (Method A must run before Method B)
            // ------------------------------------------------------------
            var orderingRules = new[]
            {
                new { FirstClass = "SETUE.Window", FirstMethod = "Load",
                      SecondClass = "SETUE.Vulkan", SecondMethod = "Load",
                      Context = "Window must be loaded before Vulkan" },
                new { FirstClass = "SETUE.Window", FirstMethod = "ProcessEvents",
                      SecondClass = "SETUE.Controls.Input", SecondMethod = "Flush",
                      Context = "ProcessEvents must run before Input.Flush" }
            };

            foreach (var rule in orderingRules)
            {
                var first = GetEntry(rule.FirstClass, rule.FirstMethod);
                var second = GetEntry(rule.SecondClass, rule.SecondMethod);

                if (first == null || second == null)
                    continue; // Missing entries already reported

                bool firstBeforeSecond = false;
                if (first.Loop != second.Loop)
                    firstBeforeSecond = string.Compare(first.Loop, second.Loop) < 0;
                else if (Math.Abs(first.TimeSlot - second.TimeSlot) > 0.0001f)
                    firstBeforeSecond = first.TimeSlot < second.TimeSlot;
                else
                    firstBeforeSecond = first.RunOrder < second.RunOrder;

                if (!firstBeforeSecond)
                {
                    result.IsValid = false;
                    result.Errors.Add($"Ordering violation: {rule.FirstClass}.{rule.FirstMethod} must run before {rule.SecondClass}.{rule.SecondMethod} — {rule.Context}");
                }
            }

            // ------------------------------------------------------------
            // 3. CRITICAL BOOT SEQUENCE (within Loop=Boot)
            // ------------------------------------------------------------
            var bootEntries = entries
                .Where(e => e.Loop == "Boot" && e.Enabled)
                .OrderBy(e => e.TimeSlot)
                .ThenBy(e => e.RunOrder)
                .ToList();

            var windowLoadBoot = bootEntries.FirstOrDefault(e => e.ClassName == "SETUE.Window" && e.Method == "Load");
            var vulkanLoadBoot = bootEntries.FirstOrDefault(e => e.ClassName == "SETUE.Vulkan" && e.Method == "Load");

            if (windowLoadBoot != null && vulkanLoadBoot != null)
            {
                if (windowLoadBoot.TimeSlot >= vulkanLoadBoot.TimeSlot)
                {
                    result.IsValid = false;
                    result.Errors.Add("Boot order: Window.Load must have a smaller TimeSlot than Vulkan.Load (run first)");
                }
            }

            // ------------------------------------------------------------
            // 4. DRAW.EXECUTE MUST NOT BE SCHEDULED (it's called inside DoDrawFrame)
            // ------------------------------------------------------------
            var drawExecute = entries.FirstOrDefault(e => e.ClassName == "SETUE.Draw" && e.Method == "Execute" && e.Enabled);
            if (drawExecute != null)
            {
                result.IsValid = false;
                result.Errors.Add("SETUE.Draw.Execute is scheduled but it must be called inside Vulkan.DoDrawFrame. Remove it from Scheduler.csv.");
            }

            return result;
        }
    }
}
