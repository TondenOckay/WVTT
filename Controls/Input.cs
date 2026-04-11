using System;
using System.IO;
using System.Collections.Generic;
using System.Numerics;
using SDL3;

namespace SETUE.Controls
{
    public static class Input
    {
        public static Vector2 MouseDelta  { get; private set; }
        public static float   ScrollDelta { get; private set; }
        public static Vector2 MousePos    { get; private set; }

        static readonly Dictionary<string, string> _actionToInput    = new();
        static readonly Dictionary<string, string> _actionToModifier = new();
        static readonly HashSet<string>            _actionEnabled     = new();

        static readonly HashSet<string> _held    = new();
        static readonly HashSet<string> _pressed = new();
        static readonly HashSet<string> _modHeld = new();
        static readonly Dictionary<string, string> _editChar = new();

        public static bool   IsEditing     { get; private set; } = false;
        public static string EditBuffer    { get; private set; } = "";
        public static string EditSource    { get; private set; } = "";
        public static bool   EditConfirmed { get; private set; } = false;
        public static bool   EditCancelled { get; private set; } = false;

        public static void StartEdit(string currentValue, string source)
        {
            IsEditing     = true;
            EditBuffer    = currentValue;
            Console.WriteLine($"[Input] IsEditing={IsEditing} Buffer={EditBuffer}");
            EditSource    = source;
            EditConfirmed = false;
            EditCancelled = false;
        }

        public static void EndEdit()
        {
            IsEditing     = false;
            EditBuffer    = "";
            EditSource    = "";
            EditConfirmed = false;
            EditCancelled = false;
        }

        public static void Load()
        {
            string csvPath = "Controls/Input.csv";
            _actionToInput.Clear();
            _actionToModifier.Clear();
            _actionEnabled.Clear();

            if (!File.Exists(csvPath)) { Console.WriteLine($"[Input] CSV not found: {csvPath}"); return; }
            var lines   = File.ReadAllLines(csvPath);
            var headers = lines[0].Split(',');
            int idxAction   = Array.IndexOf(headers, "action");
            int idxInput    = Array.IndexOf(headers, "input");
            int idxModifier = Array.IndexOf(headers, "modifier");
            int idxEditChar = Array.IndexOf(headers, "edit_char");
            int idxEnabled  = Array.IndexOf(headers, "enabled");

            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line)) continue;
                var p = line.Split(',');
                string action = p[idxAction].Trim();
                _actionToInput[action]    = idxInput    >= 0 ? p[idxInput].Trim()    : "";
                _actionToModifier[action] = idxModifier >= 0 ? p[idxModifier].Trim() : "";
                if (idxEditChar >= 0 && p.Length > idxEditChar && !string.IsNullOrEmpty(p[idxEditChar].Trim()))
                    _editChar[p[idxAction].Trim()] = p[idxEditChar].Trim();
                if (idxEnabled >= 0 && p[idxEnabled].Trim().ToLower() == "true")
                    _actionEnabled.Add(action);
            }
            Console.WriteLine($"[Input] Loaded {_actionToInput.Count} bindings");
        }

        public static void ProcessEvent(SDL.Event e)
        {
            switch ((SDL.EventType)e.Type)
            {
                case SDL.EventType.MouseMotion:
                    MouseDelta = new Vector2(e.Motion.XRel, e.Motion.YRel);
                    MousePos   = new Vector2(e.Motion.X,    e.Motion.Y);
                    break;

                case SDL.EventType.MouseButtonDown:
                    string downBtn = ButtonName(e.Button.Button);
                    _held.Add(downBtn);
                    _pressed.Add(downBtn);
                    break;

                case SDL.EventType.MouseButtonUp:
                    _held.Remove(ButtonName(e.Button.Button));
                    break;

                case SDL.EventType.MouseWheel:
                    ScrollDelta = e.Wheel.Y;
                    if (e.Wheel.Y > 0) { _held.Add("ScrollY"); _pressed.Add("ScrollY"); }
                    if (e.Wheel.Y < 0) { _held.Add("ScrollY"); _pressed.Add("ScrollY"); }
                    break;

                case SDL.EventType.KeyDown:
                    string downKey = e.Key.Scancode.ToString();
                    _held.Add(downKey);
                    _pressed.Add(downKey);
                    if (downKey == "LShift" || downKey == "RShift")
                        _modHeld.Add("Shift");
                    if (IsEditing)
                    {
                        if (downKey == "Return" || downKey == "KpEnter")
                            EditConfirmed = true;
                        else if (downKey == "Escape")
                            EditCancelled = true;
                        else if (downKey == "Backspace" && EditBuffer.Length > 0)
                            EditBuffer = EditBuffer[..^1];
                        else
                        {
                            foreach (var kv in _editChar)
                                if (_actionToInput.TryGetValue(kv.Key, out var inp) && inp == downKey)
                                { EditBuffer += kv.Value; break; }
                        }
                    }
                    break;

                case SDL.EventType.KeyUp:
                    string upKey = e.Key.Scancode.ToString();
                    _held.Remove(upKey);
                    if (upKey == "LShift" || upKey == "RShift")
                        _modHeld.Remove("Shift");
                    break;
            }
        }

        public static bool IsActionHeld(string action)
        {
            if (!_actionEnabled.Contains(action)) return false;
            if (!_actionToInput.TryGetValue(action, out var input)) return false;
            string mod = _actionToModifier.GetValueOrDefault(action, "");
            bool modOk = string.IsNullOrEmpty(mod) ? _modHeld.Count == 0 : _modHeld.Contains(mod);
            return _held.Contains(input) && modOk;
        }

        public static bool IsActionPressed(string action)
        {
            if (!_actionEnabled.Contains(action)) return false;
            if (!_actionToInput.TryGetValue(action, out var input)) return false;
            string mod = _actionToModifier.GetValueOrDefault(action, "");
            bool modOk = string.IsNullOrEmpty(mod) || _modHeld.Contains(mod);
            return _pressed.Contains(input) && modOk;
        }

        public static void Consume(string action)
        {
            if (_actionToInput.TryGetValue(action, out var input))
                _pressed.Remove(input);
        }

        public static void Flush()
        {
            MouseDelta  = Vector2.Zero;
            ScrollDelta = 0f;
            _pressed.Clear();
            _held.Remove("ScrollY");
        }

        static string ButtonName(byte btn) => btn switch
        {
            1 => "MouseLeft",
            2 => "MouseMiddle",
            3 => "MouseRight",
            _ => $"Mouse{btn}"
        };
    }
}
