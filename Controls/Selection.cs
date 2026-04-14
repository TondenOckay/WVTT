using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;
using SETUE.ECS;

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
        private static List<SelectionRule> _rules = new();
        private static SelectionRule? _activeDragRule;
        private static float _dragLastMouseX;
        private static Dictionary<Entity, (Vector3 pos, Vector3 scale)> _originalTransforms = new();
        private static Entity? _draggedEntity;

        public static bool LastHitWasPanel { get; private set; }
        public static string LastHitPanelId { get; private set; } = "";

        public static void Load()
        {
            string path = "Controls/Selection.csv";
            if (!File.Exists(path)) { Console.WriteLine($"[Selection] Missing {path}"); return; }
            var lines = File.ReadAllLines(path);
            if (lines.Length == 0) return;

            var headers = lines[0].Split(',');
            int GetIdx(string name) => Array.IndexOf(headers, name);

            int idxId = GetIdx("id"), idxAction = GetIdx("input_action"), idxHitType = GetIdx("hit_test_type"),
                idxHitValue = GetIdx("hit_test_value"), idxOnClick = GetIdx("on_click_operation"),
                idxDragTarget = GetIdx("drag_target"), idxDragProp = GetIdx("drag_property"),
                idxDragSrc = GetIdx("drag_input_source"), idxDragMult = GetIdx("drag_multiplier"),
                idxDragMin = GetIdx("drag_min"), idxDragMax = GetIdx("drag_max"),
                idxMoveWith = GetIdx("move_with"), idxMoveEdge = GetIdx("move_edge"),
                idxConsume = GetIdx("consume_input"), idxRaycast = GetIdx("raycast_enabled");

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
            if (Input.IsEditing) { HandleEdit(); return; }
            var world = Object.ECSWorld;

            if (_activeDragRule != null && _draggedEntity != null)
            {
                if (Input.IsActionHeld(_activeDragRule.InputAction))
                {
                    ApplyDrag(world, Input.MousePos.X - _dragLastMouseX);
                    _dragLastMouseX = Input.MousePos.X;
                    if (_activeDragRule.ConsumeInput) Input.Consume(_activeDragRule.InputAction);
                }
                else EndDrag();
                return;
            }

            LastHitWasPanel = false;
            LastHitPanelId = "";

            foreach (var rule in _rules)
            {
                if (!Input.IsActionPressed(rule.InputAction)) continue;
                var mouse = Input.MousePos;

                (Entity? hitEntity, PanelComponent panel, TransformComponent trans) = (null, default, default);
                bool isViewportHit = false;

                if (rule.HitTestType == "panel_prefix")
                {
                    if (string.IsNullOrEmpty(rule.HitTestValue)) continue;
                    (hitEntity, panel, trans) = HitTestPanelPrefix(world, rule.HitTestValue, mouse);
                }
                else if (rule.HitTestType == "viewport")
                {
                    if (IsMouseOverAnyPanel(world, mouse)) continue;
                    isViewportHit = true;
                }

                if (hitEntity != null || isViewportHit)
                {
                    LastHitWasPanel = hitEntity != null;
                    LastHitPanelId = panel.Id ?? "";
                    ExecuteOperation(rule, world, hitEntity, panel, mouse);
                    if (rule.ConsumeInput) { Input.Consume(rule.InputAction); return; }
                }
            }
        }

        // ─── Helpers (eliminate repetition) ─────────────────────────────────

        private static bool IsMouseOverAnyPanel(World world, Vector2 mouse)
        {
            foreach (var (_, trans, panel) in world.Query<TransformComponent, PanelComponent>())
                if (panel.Visible && PointInRect(mouse, trans))
                    return true;
            return false;
        }

        private static (Entity? entity, PanelComponent panel, TransformComponent trans)
            HitTestPanelPrefix(World world, string prefix, Vector2 mouse)
        {
            foreach (var (e, trans, panel) in world.Query<TransformComponent, PanelComponent>())
                if (panel.Visible && panel.Id.StartsWith(prefix) && PointInRect(mouse, trans))
                    return (e, panel, trans);
            return (null, default, default);
        }

        private static bool PointInRect(Vector2 p, TransformComponent t) =>
            p.X >= t.Position.X - t.Scale.X * 0.5f && p.X <= t.Position.X + t.Scale.X * 0.5f &&
            p.Y >= t.Position.Y - t.Scale.Y * 0.5f && p.Y <= t.Position.Y + t.Scale.Y * 0.5f;

        private static void ExecuteOperation(SelectionRule rule, World world, Entity? hitEntity, PanelComponent panel, Vector2 mouse)
        {
            switch (rule.OnClickOperation)
            {
                case "select_object":
                    if (hitEntity != null && rule.HitTestValue.StartsWith("_st_") &&
                        int.TryParse(panel.Id.Substring(rule.HitTestValue.Length), out int id))
                        ToggleSelectionById(world, id);
                    break;
                case "start_drag":
                    if (hitEntity != null) StartDrag(rule, world, hitEntity.Value, panel);
                    break;
                case "raycast":
                    if (rule.RaycastEnabled) RaycastSelect(world, mouse);
                    break;
                default:
                    Console.WriteLine($"[Selection] Operation: {rule.OnClickOperation} on {panel.Id}");
                    break;
            }
        }

        private static void ToggleSelectionById(World world, int id)
        {
            foreach (var (entity, _, _) in world.Query<TransformComponent, MeshComponent>())
                if (entity.Id == id)
                {
                    if (world.HasComponent<SelectedComponent>(entity))
                        world.RemoveComponent<SelectedComponent>(entity);
                    else
                        world.AddComponent(entity, new SelectedComponent());
                    break;
                }
        }

        private static void StartDrag(SelectionRule rule, World world, Entity entity, PanelComponent panel)
        {
            _activeDragRule = rule;
            _draggedEntity = entity;
            _dragLastMouseX = Input.MousePos.X;
            _originalTransforms.Clear();

            var trans = world.GetComponent<TransformComponent>(entity);
            _originalTransforms[entity] = (trans.Position, trans.Scale);

            if (!string.IsNullOrEmpty(rule.MoveWith))
                foreach (var (e, _, p) in world.Query<TransformComponent, PanelComponent>())
                    if (p.Id == rule.MoveWith)
                        _originalTransforms[e] = (world.GetComponent<TransformComponent>(e).Position,
                                                 world.GetComponent<TransformComponent>(e).Scale);

            Console.WriteLine($"[Selection] Drag started on {panel.Id}");
        }

        private static void EndDrag()
        {
            _activeDragRule = null;
            _draggedEntity = null;
            _originalTransforms.Clear();
            Console.WriteLine("[Selection] Drag ended");
        }

        private static void ApplyDrag(World world, float rawDelta)
        {
            if (_activeDragRule == null || _draggedEntity == null) return;
            var rule = _activeDragRule;
            var target = _draggedEntity.Value;
            if (!world.HasComponent<TransformComponent>(target)) return;

            var trans = world.GetComponent<TransformComponent>(target);
            float delta = rawDelta * rule.DragMultiplier;
            if (rule.DragInputSource == "mouse_delta_x_neg") delta = -delta;

            // Apply delta to the correct property using a unified helper
            ApplyDeltaToTransform(ref trans, rule.DragProperty, delta, rule.DragMin, rule.DragMax);
            world.SetComponent(target, trans);

            // Update followers
            foreach (var r in _rules)
                if (r.DragTarget == rule.DragTarget && !string.IsNullOrEmpty(r.MoveWith))
                    UpdateFollower(world, r, target, trans);
        }

        private static void ApplyDeltaToTransform(ref TransformComponent t, string prop, float delta, float min, float max)
        {
            switch (prop)
            {
                case "x":      t.Position.X = Clamp(t.Position.X + delta, min, max); break;
                case "y":      t.Position.Y = Clamp(t.Position.Y + delta, min, max); break;
                case "width":  t.Scale.X   = Clamp(t.Scale.X   + delta, min, max); break;
                case "height": t.Scale.Y   = Clamp(t.Scale.Y   + delta, min, max); break;
            }
        }

        private static float Clamp(float value, float min, float max)
        {
            if (!float.IsNaN(min)) value = Math.Max(value, min);
            if (!float.IsNaN(max)) value = Math.Min(value, max);
            return value;
        }

        private static void UpdateFollower(World world, SelectionRule rule, Entity target, TransformComponent targetTrans)
        {
            Entity? follower = null;
            foreach (var (e, _, p) in world.Query<TransformComponent, PanelComponent>())
                if (p.Id == rule.MoveWith) { follower = e; break; }
            if (follower == null) return;

            var fTrans = world.GetComponent<TransformComponent>(follower.Value);
            if (!_originalTransforms.TryGetValue(follower.Value, out var orig))
                orig = (fTrans.Position, fTrans.Scale);
            if (!_originalTransforms.TryGetValue(target, out var targetOrig))
                targetOrig = (targetTrans.Position, targetTrans.Scale);

            switch (rule.MoveEdge)
            {
                case "left":   AdjustEdge(ref fTrans, orig, targetTrans, targetOrig, axis: 0, movingRight: true); break;
                case "right":  AdjustEdge(ref fTrans, orig, targetTrans, targetOrig, axis: 0, movingRight: false); break;
                case "top":    AdjustEdge(ref fTrans, orig, targetTrans, targetOrig, axis: 1, movingRight: true); break;
                case "bottom": AdjustEdge(ref fTrans, orig, targetTrans, targetOrig, axis: 1, movingRight: false); break;
                case "all":    fTrans.Position = orig.pos + (targetTrans.Position - targetOrig.pos); break;
            }

            if (fTrans.Scale.X < 0) fTrans.Scale.X = 0;
            if (fTrans.Scale.Y < 0) fTrans.Scale.Y = 0;
            world.SetComponent(follower.Value, fTrans);
        }

        private static void AdjustEdge(ref TransformComponent fTrans,
            (Vector3 pos, Vector3 scale) orig, TransformComponent targetTrans,
            (Vector3 pos, Vector3 scale) targetOrig, int axis, bool movingRight)
        {
            float movingEdge, fixedEdge, newSize, newCenter;
            if (axis == 0) // X axis
            {
                movingEdge = movingRight
                    ? targetTrans.Position.X + targetTrans.Scale.X * 0.5f
                    : targetTrans.Position.X - targetTrans.Scale.X * 0.5f;
                fixedEdge = movingRight
                    ? orig.pos.X + orig.scale.X * 0.5f
                    : orig.pos.X - orig.scale.X * 0.5f;
                newSize = movingRight ? fixedEdge - movingEdge : movingEdge - fixedEdge;
                newCenter = (movingEdge + fixedEdge) * 0.5f;
                fTrans.Position.X = newCenter;
                fTrans.Scale.X = newSize;
            }
            else // Y axis
            {
                movingEdge = movingRight
                    ? targetTrans.Position.Y + targetTrans.Scale.Y * 0.5f
                    : targetTrans.Position.Y - targetTrans.Scale.Y * 0.5f;
                fixedEdge = movingRight
                    ? orig.pos.Y + orig.scale.Y * 0.5f
                    : orig.pos.Y - orig.scale.Y * 0.5f;
                newSize = movingRight ? fixedEdge - movingEdge : movingEdge - fixedEdge;
                newCenter = (movingEdge + fixedEdge) * 0.5f;
                fTrans.Position.Y = newCenter;
                fTrans.Scale.Y = newSize;
            }
        }

        private static void RaycastSelect(World world, Vector2 mouse)
        {
            var hit = Raycast(world, mouse);
            foreach (var e in world.Query<SelectedComponent>())
                world.RemoveComponent<SelectedComponent>(e);
            if (hit != null) world.AddComponent(hit.Value, new SelectedComponent());
        }

        private static Entity? Raycast(World world, Vector2 mousePos)
        {
            Entity? camEntity = null;
            CameraComponent cam = default;
            foreach (var e in world.Query<CameraComponent>())
            { camEntity = e; cam = world.GetComponent<CameraComponent>(e); break; }
            if (camEntity == null) return null;

            float aspect = (float)Vulkan.SwapExtent.Width / Vulkan.SwapExtent.Height;
            float fovRad = cam.Fov * MathF.PI / 180f;
            float ndcX = (mousePos.X / Vulkan.SwapExtent.Width) * 2f - 1f;
            float ndcY = (mousePos.Y / Vulkan.SwapExtent.Height) * 2f - 1f;
            Vector3 rayDir = Vector3.Normalize(new Vector3(
                ndcX * MathF.Tan(fovRad / 2f) * aspect,
                -ndcY * MathF.Tan(fovRad / 2f),
                -1f));

            Matrix4x4.Invert(Matrix4x4.CreateLookAt(cam.Position, cam.Pivot, Vector3.UnitY), out var invView);
            rayDir = Vector3.TransformNormal(rayDir, invView);
            Vector3 origin = cam.Position;

            Entity? closest = null;
            float closestDist = float.MaxValue;
            foreach (var (e, trans, _) in world.Query<TransformComponent, MeshComponent>())
            {
                Vector3 oc = origin - trans.Position;
                float radius = Math.Max(trans.Scale.X, Math.Max(trans.Scale.Y, trans.Scale.Z)) * 0.5f;
                float b = Vector3.Dot(oc, rayDir);
                float c = Vector3.Dot(oc, oc) - radius * radius;
                float disc = b * b - c;
                if (disc > 0)
                {
                    float t = -b - MathF.Sqrt(disc);
                    if (t > 0 && t < closestDist) { closestDist = t; closest = e; }
                }
            }
            return closest;
        }

        private static void HandleEdit()
        {
            if (Input.EditConfirmed || Input.EditCancelled)
            {
                if (Input.EditConfirmed) Console.WriteLine($"[Selection] Edit: {Input.EditBuffer}");
                Input.EndEdit();
            }
        }
    }
}
