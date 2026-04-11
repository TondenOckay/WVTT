using System;
using System.IO;
using System.Collections.Generic;
using SETUE.Systems;
using SETUE.Objects3D;

namespace SETUE.Controls
{
    class SelectionRule
    {
        public string Id = "";
        public string InputAction = "";
        public string HitTestType = "";
        public string HitTestValue = "";
        public string OnClickOperation = "";
        public string DragTarget = "";
        public string DragProperty = "";
        public string DragInputSource = "";
        public float DragMultiplier = 1.0f;
        public float DragMin = float.NaN;
        public float DragMax = float.NaN;
        public string MoveWith = "";
        public string MoveEdge = "";
        public bool ConsumeInput;
        public bool RaycastEnabled;
    }

    public static class Selection
    {
        static List<SelectionRule> _rules = new();
        static SelectionRule? _activeDragRule;
        static float _dragLastMouseX;
        static Dictionary<string, string> _barActive = new();
        static Dictionary<string, (float x, float y, float w, float h)> _originalGeo = new();

        public static bool LastHitWasPanel { get; private set; } = false;
        public static string LastHitPanelId { get; private set; } = "";

        public static void Load()
        {
            string path = "Controls/Selection.csv";
            if (!File.Exists(path)) { Console.WriteLine($"[Selection] Missing {path}"); return; }
            var lines = File.ReadAllLines(path);
            var headers = lines[0].Split(',');

            int idxId = Array.IndexOf(headers, "id");
            int idxAction = Array.IndexOf(headers, "input_action");
            int idxHitType = Array.IndexOf(headers, "hit_test_type");
            int idxHitValue = Array.IndexOf(headers, "hit_test_value");
            int idxOnClick = Array.IndexOf(headers, "on_click_operation");
            int idxDragTarget = Array.IndexOf(headers, "drag_target");
            int idxDragProp = Array.IndexOf(headers, "drag_property");
            int idxDragSrc = Array.IndexOf(headers, "drag_input_source");
            int idxDragMult = Array.IndexOf(headers, "drag_multiplier");
            int idxDragMin = Array.IndexOf(headers, "drag_min");
            int idxDragMax = Array.IndexOf(headers, "drag_max");
            int idxMoveWith = Array.IndexOf(headers, "move_with");
            int idxMoveEdge = Array.IndexOf(headers, "move_edge");
            int idxConsume = Array.IndexOf(headers, "consume_input");
            int idxRaycast = Array.IndexOf(headers, "raycast_enabled");

            _rules.Clear();
            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                var p = line.Split(',');
                string Get(int idx) => idx >= 0 && idx < p.Length ? p[idx].Trim() : "";

                _rules.Add(new SelectionRule
                {
                    Id = Get(idxId),
                    InputAction = Get(idxAction),
                    HitTestType = Get(idxHitType),
                    HitTestValue = Get(idxHitValue),
                    OnClickOperation = Get(idxOnClick),
                    DragTarget = Get(idxDragTarget),
                    DragProperty = Get(idxDragProp),
                    DragInputSource = Get(idxDragSrc),
                    DragMultiplier = float.TryParse(Get(idxDragMult), out var m) ? m : 1.0f,
                    DragMin = float.TryParse(Get(idxDragMin), out var min) ? min : float.NaN,
                    DragMax = float.TryParse(Get(idxDragMax), out var max) ? max : float.NaN,
                    MoveWith = Get(idxMoveWith),
                    MoveEdge = Get(idxMoveEdge),
                    ConsumeInput = Get(idxConsume).ToLower() == "true",
                    RaycastEnabled = Get(idxRaycast).ToLower() == "true"
                });
            }
            Console.WriteLine($"[Selection] Loaded {_rules.Count} rules");
        }

        public static void Update()
        {
            if (Input.IsEditing)
            {
                if (Input.EditConfirmed || Input.EditCancelled)
                {
                    if (Input.EditConfirmed)
                    {
                        var sel = Objects.SelectedObject;
                        if (sel != null && float.TryParse(Input.EditBuffer, out float val))
                            sel.SetProperty(Input.EditSource, val);
                    }
                    Input.EndEdit();
                }
            }

            if (_activeDragRule != null)
            {
                if (Input.IsActionHeld(_activeDragRule.InputAction))
                {
                    float rawDelta = Input.MousePos.X - _dragLastMouseX;
                    ApplyDrag(rawDelta);
                    _dragLastMouseX = Input.MousePos.X;
                }
                else
                {
                    _activeDragRule = null;
                    _originalGeo.Clear();
                    Console.WriteLine("[Selection] Drag ended");
                }
                if (_activeDragRule?.ConsumeInput == true)
                    Input.Consume(_activeDragRule.InputAction);
                return;
            }

            LastHitWasPanel = false;
            LastHitPanelId = "";

            foreach (var rule in _rules)
            {
                if (!Input.IsActionPressed(rule.InputAction)) continue;
                var mouse = Input.MousePos;

                Panel? hitPanel = null;

                if (rule.HitTestType == "panel_prefix")
                {
                    foreach (var panel in Panels.Sorted)
                    {
                        if (!panel.Visible) continue;
                        if (!panel.Id.StartsWith(rule.HitTestValue)) continue;
                        if (mouse.X >= panel.X && mouse.X <= panel.X + panel.Width &&
                            mouse.Y >= panel.Y && mouse.Y <= panel.Y + panel.Height)
                        {
                            hitPanel = panel;
                            break;
                        }
                    }
                }
                else if (rule.HitTestType == "viewport")
                {
                    bool overPanel = false;
                    foreach (var p in Panels.Sorted)
                    {
                        if (!p.Visible) continue;
                        if (mouse.X >= p.X && mouse.X <= p.X + p.Width &&
                            mouse.Y >= p.Y && mouse.Y <= p.Y + p.Height)
                        { overPanel = true; break; }
                    }
                    if (!overPanel) hitPanel = null;
                    else continue;
                }

                if (hitPanel != null || rule.HitTestType == "viewport")
                {
                    LastHitWasPanel = hitPanel != null;
                    LastHitPanelId = hitPanel?.Id ?? "";

                    switch (rule.OnClickOperation)
                    {
                        case "select_object":
                            if (rule.HitTestValue == "_st_" && hitPanel != null)
                            {
                                string objId = hitPanel.Id.Substring(rule.HitTestValue.Length);
                                Objects.Select(objId);
                            }
                            break;
                        case "start_drag":
                            _activeDragRule = rule;
                            _dragLastMouseX = Input.MousePos.X;
                            // Store original geometry for all potential followers
                            foreach (var r in _rules)
                                if (r.DragTarget == rule.DragTarget && !string.IsNullOrEmpty(r.MoveWith))
                                    if (Panels.All.TryGetValue(r.MoveWith, out var follower))
                                        _originalGeo[r.MoveWith] = (follower.X, follower.Y, follower.Width, follower.Height);
                            if (Panels.All.TryGetValue(rule.DragTarget, out var target))
                                _originalGeo[rule.DragTarget] = (target.X, target.Y, target.Width, target.Height);
                            Console.WriteLine($"[Selection] Drag started: {rule.Id}");
                            break;
                        case "raycast":
                            if (rule.RaycastEnabled)
                            {
                                var hit = Objects.Raycast(mouse);
                                if (hit != null) Objects.Select(hit);
                                else Objects.Deselect();
                            }
                            break;
                    }

                    if (rule.ConsumeInput)
                    {
                        Input.Consume(rule.InputAction);
                        return;
                    }
                }
            }
        }

        static void ApplyDrag(float rawDelta)
        {
            if (_activeDragRule == null) return;
            var activeRule = _activeDragRule;
            if (!Panels.All.TryGetValue(activeRule.DragTarget, out var target)) return;

            float delta = rawDelta * activeRule.DragMultiplier;
            if (activeRule.DragInputSource == "mouse_delta_x_neg") delta = -delta;

            float current = activeRule.DragProperty switch
            {
                "width" => target.Width,
                "x" => target.X,
                "y" => target.Y,
                _ => 0f
            };
            float newValue = current + delta;
            if (!float.IsNaN(activeRule.DragMin)) newValue = Math.Max(newValue, activeRule.DragMin);
            if (!float.IsNaN(activeRule.DragMax)) newValue = Math.Min(newValue, activeRule.DragMax);

            Panels.SetPanelProperty(activeRule.DragTarget, activeRule.DragProperty, newValue);

            // Apply all follower rules that target the same drag target
            foreach (var rule in _rules)
            {
                if (rule.DragTarget != activeRule.DragTarget) continue;
                if (string.IsNullOrEmpty(rule.MoveWith)) continue;
                if (!Panels.All.TryGetValue(rule.MoveWith, out var follower)) continue;
                if (!_originalGeo.TryGetValue(rule.MoveWith, out var orig))
                    orig = (follower.X, follower.Y, follower.Width, follower.Height);

                switch (rule.MoveEdge)
                {
                    case "left":
                        float newLeft = target.X + target.Width;
                        follower.X = newLeft;
                        follower.Width = (orig.x + orig.w) - newLeft;
                        break;
                    case "right":
                        float newRight = target.X;
                        follower.Width = newRight - follower.X;
                        break;
                    case "top":
                        float newTop = target.Y + target.Height;
                        follower.Y = newTop;
                        follower.Height = (orig.y + orig.h) - newTop;
                        break;
                    case "bottom":
                        float newBottom = target.Y;
                        follower.Height = newBottom - follower.Y;
                        break;
                    case "all":
                        if (_originalGeo.TryGetValue(activeRule.DragTarget, out var targetOrig))
                        {
                            follower.X = orig.x + (target.X - targetOrig.x);
                            follower.Y = orig.y + (target.Y - targetOrig.y);
                        }
                        break;
                }

                if (follower.Width < 0) follower.Width = 0;
                if (follower.Height < 0) follower.Height = 0;
            }
        }

        static void SetPrefixVisible(string prefix, bool visible)
        {
            foreach (var kv in Panels.All)
                if (kv.Key.StartsWith(prefix)) kv.Value.Visible = visible;
        }
    }
}
