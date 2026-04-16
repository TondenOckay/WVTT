using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;
using SETUE.ECS;

namespace SETUE.Controls
{
    public class SelectionRule
    {
        public string Id = "";
        public string InputAction = "";
        public string HitTestType = "";
        public string HitTestValue = "";
        public string OnClickOperation = "";
        public bool ConsumeInput;
        public bool RaycastEnabled;
        public string ActionId = "";
    }

    public struct ActionRequest : IComponent
    {
        public string ParentName;
        public Vector2 MouseStartPos;
    }

    public static class Selection
    {
        private static List<SelectionRule> _rules = new();
        private static Entity? _actionRequestEntity;

        public static void Load()
        {
            string path = "Controls/Selection.csv";
            if (!File.Exists(path)) return;
            var lines = File.ReadAllLines(path);
            if (lines.Length < 2) return;

            var headers = lines[0].Split(',');
            int G(string n) => Array.IndexOf(headers, n);

            _rules.Clear();
            for (int i = 1; i < lines.Length; i++)
            {
                var p = lines[i].Split(',');
                string Get(int idx) => idx >= 0 && idx < p.Length ? p[idx].Trim() : "";

                _rules.Add(new SelectionRule
                {
                    Id = Get(G("id")),
                    InputAction = Get(G("input_action")),
                    HitTestType = Get(G("hit_test_type")),
                    HitTestValue = Get(G("hit_test_value")),
                    OnClickOperation = Get(G("on_click_operation")),
                    ConsumeInput = Get(G("consume_input")).ToLower() == "true",
                    RaycastEnabled = Get(G("raycast_enabled")).ToLower() == "true",
                    ActionId = Get(G("action_id"))
                });
            }
            Console.WriteLine($"[Selection] Loaded {_rules.Count} rules");
        }

        public static void Update()
        {
            var world = Object.ECSWorld;

            if (_actionRequestEntity.HasValue && world.HasComponent<ActionRequest>(_actionRequestEntity.Value))
                world.DestroyEntity(_actionRequestEntity.Value);
            _actionRequestEntity = null;

            foreach (var rule in _rules)
            {
                if (!Input.IsActionPressed(rule.InputAction)) continue;
                var mouse = Input.MousePos;

                Entity? hitEntity = HitTest(world, rule, mouse);
                if (hitEntity != null && !string.IsNullOrEmpty(rule.ActionId))
                {
                    var reqEntity = world.CreateEntity();
                    world.AddComponent(reqEntity, new ActionRequest
                    {
                        ParentName = rule.ActionId,
                        MouseStartPos = mouse
                    });
                    _actionRequestEntity = reqEntity;

                    if (rule.ConsumeInput)
                        Input.Consume(rule.InputAction);
                    break;
                }
            }
        }

        private static Entity? HitTest(World world, SelectionRule rule, Vector2 mouse)
        {
            if (rule.HitTestType == "panel_prefix")
            {
                foreach (var entity in world.Query<TransformComponent>())
                {
                    if (!world.HasComponent<PanelComponent>(entity)) continue;
                    var trans = world.GetComponent<TransformComponent>(entity);
                    var panel = world.GetComponent<PanelComponent>(entity);

                    if (panel.Visible && panel.Id.StartsWith(rule.HitTestValue) &&
                        mouse.X >= trans.Position.X - trans.Scale.X / 2 && mouse.X <= trans.Position.X + trans.Scale.X / 2 &&
                        mouse.Y >= trans.Position.Y - trans.Scale.Y / 2 && mouse.Y <= trans.Position.Y + trans.Scale.Y / 2)
                    {
                        return entity;
                    }
                }
            }
            return null;
        }
    }
}
