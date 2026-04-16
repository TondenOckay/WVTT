using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;
using SETUE.ECS;

namespace SETUE.Controls
{
    public class ActionRule
    {
        public string ParentName = "";
        public string ObjectName = "";
        public string MoveEdge = "";
        public string Script = "";
        public float MinDistance = float.NaN;
        public float MaxDistance = float.NaN;
    }

    public struct ActiveDrag : IComponent
    {
        public string Script;
        public Vector2 LastMousePos;
        public Dictionary<Entity, string> EntityMoveEdges;
        public Dictionary<Entity, (Vector3 pos, Vector3 scale)> OriginalTransforms;
        public Entity ParentEntity;
        // Store per‑entity limits (from CSV)
        public Dictionary<Entity, (float min, float max)> EntityLimits;
    }

    public static class Action
    {
        private static List<ActionRule> _actionRules = new();

        public static void Load()
        {
            string path = "Controls/Action.csv";
            if (!File.Exists(path))
            {
                Console.WriteLine($"[Action] Missing {path}");
                return;
            }

            var lines = File.ReadAllLines(path);
            if (lines.Length < 2) return;

            var headers = lines[0].Split(',');
            int idxParent = Array.IndexOf(headers, "parent_name");
            int idxObject = Array.IndexOf(headers, "object_name");
            int idxEdge = Array.IndexOf(headers, "move_edge");
            int idxScript = Array.IndexOf(headers, "script");
            int idxMin = Array.IndexOf(headers, "min_distance");
            int idxMax = Array.IndexOf(headers, "max_distance");

            _actionRules.Clear();
            for (int i = 1; i < lines.Length; i++)
            {
                var p = lines[i].Split(',');
                string Get(int idx) => idx >= 0 && idx < p.Length ? p[idx].Trim() : "";

                _actionRules.Add(new ActionRule
                {
                    ParentName = Get(idxParent),
                    ObjectName = Get(idxObject),
                    MoveEdge = Get(idxEdge),
                    Script = Get(idxScript),
                    MinDistance = float.TryParse(Get(idxMin), out var min) ? min : float.NaN,
                    MaxDistance = float.TryParse(Get(idxMax), out var max) ? max : float.NaN
                });
            }
            Console.WriteLine($"[Action] Loaded {_actionRules.Count} action rules");
        }

        public static void Update()
        {
            var world = Object.ECSWorld;

            // Process new ActionRequests
            foreach (var requestEntity in world.Query<ActionRequest>())
            {
                var req = world.GetComponent<ActionRequest>(requestEntity);
                StartDrag(world, req.ParentName, req.MouseStartPos);
                world.DestroyEntity(requestEntity);
            }

            // Update all active drags
            foreach (var parentEntity in world.Query<ActiveDrag>())
            {
                var drag = world.GetComponent<ActiveDrag>(parentEntity);

                if (!Input.IsActionHeld("select_object"))
                {
                    EndDrag(world, parentEntity);
                    continue;
                }

                Vector2 currentMouse = Input.MousePos;
                float rawDeltaX = currentMouse.X - drag.LastMousePos.X;
                float rawDeltaY = currentMouse.Y - drag.LastMousePos.Y;

                if (Math.Abs(rawDeltaX) > 0.001f || Math.Abs(rawDeltaY) > 0.001f)
                {
                    Vector3 delta = Movement.CalculateDelta(drag.Script, rawDeltaX, rawDeltaY);

                    // --- 1. Move the parent entity first (with its own limits) ---
                    var parentTrans = world.GetComponent<TransformComponent>(parentEntity);
                    var parentOrig = drag.OriginalTransforms[parentEntity];
                    
                    float newParentX = parentTrans.Position.X + delta.X;
                    float newParentY = parentTrans.Position.Y + delta.Y;

                    // Apply parent's limits if they exist
                    if (drag.EntityLimits.TryGetValue(parentEntity, out var parentLimits))
                    {
                        if (!float.IsNaN(parentLimits.min))
                        {
                            newParentX = Math.Max(newParentX, parentLimits.min);
                            newParentY = Math.Max(newParentY, parentLimits.min);
                        }
                        if (!float.IsNaN(parentLimits.max))
                        {
                            newParentX = Math.Min(newParentX, parentLimits.max);
                            newParentY = Math.Min(newParentY, parentLimits.max);
                        }
                    }

                    parentTrans.Position = new Vector3(newParentX, newParentY, parentTrans.Position.Z);
                    world.SetComponent(parentEntity, parentTrans);

                    // --- 2. Move all followers based on the new parent position ---
                    foreach (var kv in drag.EntityMoveEdges)
                    {
                        var entity = kv.Key;
                        var moveEdge = kv.Value;

                        if (entity.Equals(parentEntity))
                            continue;

                        var trans = world.GetComponent<TransformComponent>(entity);
                        var orig = drag.OriginalTransforms[entity];

                        if (moveEdge == "all")
                        {
                            float newX = orig.pos.X + (parentTrans.Position.X - parentOrig.pos.X);
                            float newY = orig.pos.Y + (parentTrans.Position.Y - parentOrig.pos.Y);
                            
                            // Apply follower's own limits
                            if (drag.EntityLimits.TryGetValue(entity, out var limits))
                            {
                                if (!float.IsNaN(limits.min))
                                {
                                    newX = Math.Max(newX, limits.min);
                                    newY = Math.Max(newY, limits.min);
                                }
                                if (!float.IsNaN(limits.max))
                                {
                                    newX = Math.Min(newX, limits.max);
                                    newY = Math.Min(newY, limits.max);
                                }
                            }
                            
                            trans.Position = new Vector3(newX, newY, trans.Position.Z);
                        }
                        else if (moveEdge == "right" || moveEdge == "left" || moveEdge == "top" || moveEdge == "bottom")
                        {
                            AdjustEdge(ref trans, orig, parentTrans, parentOrig, moveEdge, drag.EntityLimits.GetValueOrDefault(entity));
                        }
                        else
                        {
                            float newX = trans.Position.X + delta.X;
                            float newY = trans.Position.Y + delta.Y;
                            
                            if (drag.EntityLimits.TryGetValue(entity, out var limits))
                            {
                                if (!float.IsNaN(limits.min))
                                {
                                    newX = Math.Max(newX, limits.min);
                                    newY = Math.Max(newY, limits.min);
                                }
                                if (!float.IsNaN(limits.max))
                                {
                                    newX = Math.Min(newX, limits.max);
                                    newY = Math.Min(newY, limits.max);
                                }
                            }
                            
                            trans.Position = new Vector3(newX, newY, trans.Position.Z);
                        }

                        world.SetComponent(entity, trans);
                    }

                    drag.LastMousePos = currentMouse;
                    world.SetComponent(parentEntity, drag);
                }
            }
        }

        private static void StartDrag(World world, string parentName, Vector2 mousePos)
        {
            var entitiesToMove = new Dictionary<Entity, string>();
            var originalTransforms = new Dictionary<Entity, (Vector3 pos, Vector3 scale)>();
            var entityLimits = new Dictionary<Entity, (float min, float max)>();
            string scriptToUse = "slide_x";

            // Find the parent entity
            Entity? parentEntity = null;
            foreach (var entity in world.Query<PanelComponent>())
            {
                var panel = world.GetComponent<PanelComponent>(entity);
                if (panel.Id == parentName)
                {
                    parentEntity = entity;
                    break;
                }
            }
            if (parentEntity == null)
            {
                Console.WriteLine($"[Action] Parent entity '{parentName}' not found.");
                return;
            }

            // Add parent to movement list
            var parentTrans = world.GetComponent<TransformComponent>(parentEntity.Value);
            entitiesToMove[parentEntity.Value] = "parent";
            originalTransforms[parentEntity.Value] = (parentTrans.Position, parentTrans.Scale);

            // Find all followers from Action.csv
            foreach (var rule in _actionRules)
            {
                if (rule.ParentName == parentName)
                {
                    scriptToUse = rule.Script;

                    foreach (var entity in world.Query<PanelComponent>())
                    {
                        var panel = world.GetComponent<PanelComponent>(entity);
                        if (panel.Id == rule.ObjectName)
                        {
                            if (!entity.Equals(parentEntity.Value))
                            {
                                entitiesToMove[entity] = rule.MoveEdge;
                            }
                            var trans = world.GetComponent<TransformComponent>(entity);
                            originalTransforms[entity] = (trans.Position, trans.Scale);
                            
                            // Store limits for this entity
                            entityLimits[entity] = (rule.MinDistance, rule.MaxDistance);
                            break;
                        }
                    }
                }
            }

            world.AddComponent(parentEntity.Value, new ActiveDrag
            {
                Script = scriptToUse,
                LastMousePos = mousePos,
                EntityMoveEdges = entitiesToMove,
                OriginalTransforms = originalTransforms,
                ParentEntity = parentEntity.Value,
                EntityLimits = entityLimits
            });

            Console.WriteLine($"[Action] Started drag on '{parentName}' with {entitiesToMove.Count - 1} followers.");
        }

        private static void EndDrag(World world, Entity entity)
        {
            world.RemoveComponent<ActiveDrag>(entity);
            Console.WriteLine($"[Action] Ended drag.");
        }

        private static void AdjustEdge(ref TransformComponent fTrans,
            (Vector3 pos, Vector3 scale) orig, TransformComponent targetTrans,
            (Vector3 pos, Vector3 scale) targetOrig, string moveEdge,
            (float min, float max) limits)
        {
            float movingEdge, fixedEdge, newSize, newCenter;
            bool isXAxis = (moveEdge == "left" || moveEdge == "right");
            bool movingRight = (moveEdge == "left" || moveEdge == "top");

            if (isXAxis)
            {
                movingEdge = movingRight
                    ? targetTrans.Position.X + targetTrans.Scale.X / 2f
                    : targetTrans.Position.X - targetTrans.Scale.X / 2f;
                fixedEdge = movingRight
                    ? orig.pos.X + orig.scale.X / 2f
                    : orig.pos.X - orig.scale.X / 2f;
                newSize = movingRight ? fixedEdge - movingEdge : movingEdge - fixedEdge;
                newCenter = (movingEdge + fixedEdge) / 2f;
                
                // Apply min/max to the position
                if (!float.IsNaN(limits.min))
                    newCenter = Math.Max(newCenter, limits.min);
                if (!float.IsNaN(limits.max))
                    newCenter = Math.Min(newCenter, limits.max);
                    
                fTrans.Position.X = newCenter;
                fTrans.Scale.X = Math.Max(newSize, 1f);
            }
            else
            {
                movingEdge = movingRight
                    ? targetTrans.Position.Y + targetTrans.Scale.Y / 2f
                    : targetTrans.Position.Y - targetTrans.Scale.Y / 2f;
                fixedEdge = movingRight
                    ? orig.pos.Y + orig.scale.Y / 2f
                    : orig.pos.Y - orig.scale.Y / 2f;
                newSize = movingRight ? fixedEdge - movingEdge : movingEdge - fixedEdge;
                newCenter = (movingEdge + fixedEdge) / 2f;
                
                // Apply min/max to the position
                if (!float.IsNaN(limits.min))
                    newCenter = Math.Max(newCenter, limits.min);
                if (!float.IsNaN(limits.max))
                    newCenter = Math.Min(newCenter, limits.max);
                    
                fTrans.Position.Y = newCenter;
                fTrans.Scale.Y = Math.Max(newSize, 1f);
            }
        }
    }
}
