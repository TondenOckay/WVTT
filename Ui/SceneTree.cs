using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using SETUE.Core;
using SETUE.ECS;
using SETUE.Systems;

namespace SETUE.UI
{
    public static class SceneTree
    {
        public class SceneTreeRow
        {
            public string Target { get; set; } = "";
            public string TemplatePanelId { get; set; } = "";
            public string RowColorId { get; set; } = "";
            public string RowSelectedColorId { get; set; } = "";
            public float IndentPerLevel { get; set; } = 20f;
            public string ContextMenuId { get; set; } = "";
            public int TemplatePanelIdResolved { get; set; }
            public int RowColorIdResolved { get; set; }
            public int RowSelectedColorIdResolved { get; set; }
            public int ContextMenuIdResolved { get; set; }
        }

        private static Dictionary<string, SceneTreeRow> _styleLookup = new();
        private static Entity? _containerEntity;
        private static TransformComponent _containerTransform;
        private static PanelComponent _containerPanel;
        private static Entity? _sceneRoot;

        private class RowData
        {
            public Entity PanelEntity;
            public Entity TextEntity;
            public Entity TargetEntity;
            public SceneTreeRow Style = null!;
            public bool LastSelectedState;
            public int Depth;
        }

        private static readonly Dictionary<Entity, RowData> _rows = new();
        private static int _containerPanelId;
        private static float _paddingX = 8f;
        private static float _paddingY = 4f;

        // ---------------------------------------------------------------------
        // Initialization
        // ---------------------------------------------------------------------
        public static void Load()
        {
            Console.WriteLine("[SceneTree] ========== Load() ==========");
            _containerPanelId = StringRegistry.GetOrAdd("left_panel");
            LoadStyles("Ui/SceneTree.csv");
        }

        private static void LoadStyles(string csvPath)
        {
            if (!File.Exists(csvPath))
            {
                Console.WriteLine($"[SceneTree] ERROR: Missing {csvPath}");
                return;
            }

            var lines = File.ReadAllLines(csvPath);
            if (lines.Length < 2) return;

            var headers = lines[0].Split(',');
            var colIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < headers.Length; i++)
                colIndex[headers[i].Trim()] = i;

            string Get(string colName, string[] parts) =>
                colIndex.TryGetValue(colName, out int idx) && idx < parts.Length ? parts[idx].Trim() : "";

            _styleLookup.Clear();
            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                var parts = line.Split(',');

                string target = Get("target", parts);
                if (string.IsNullOrEmpty(target)) continue;

                var row = new SceneTreeRow
                {
                    Target = target,
                    TemplatePanelId = Get("row_panel_id", parts),
                    RowColorId = Get("row_color_id", parts),
                    RowSelectedColorId = Get("row_selected_color_id", parts),
                    IndentPerLevel = float.TryParse(Get("indent", parts), out var indent) ? indent : 20f,
                    ContextMenuId = Get("context_menu_id", parts)
                };

                row.TemplatePanelIdResolved = string.IsNullOrEmpty(row.TemplatePanelId) ? 0 : StringRegistry.GetOrAdd(row.TemplatePanelId);
                row.RowColorIdResolved = string.IsNullOrEmpty(row.RowColorId) ? 0 : StringRegistry.GetOrAdd(row.RowColorId);
                row.RowSelectedColorIdResolved = string.IsNullOrEmpty(row.RowSelectedColorId) ? 0 : StringRegistry.GetOrAdd(row.RowSelectedColorId);
                row.ContextMenuIdResolved = string.IsNullOrEmpty(row.ContextMenuId) ? 0 : StringRegistry.GetOrAdd(row.ContextMenuId);

                _styleLookup[target] = row;
                Console.WriteLine($"[SceneTree] Loaded style for '{target}': template={row.TemplatePanelId}");
            }

            Console.WriteLine($"[SceneTree] Loaded {_styleLookup.Count} row styles.");
        }

        public static SceneTreeRow? GetStyleForType(string entityType)
        {
            _styleLookup.TryGetValue(entityType, out var style);
            if (style == null) _styleLookup.TryGetValue("Object", out style);
            return style;
        }

        // ---------------------------------------------------------------------
        // Main Update
        // ---------------------------------------------------------------------
        public static void Update()
        {
            var world = Object.ECSWorld;

            if (!TryGetContainer(world))
            {
                Console.WriteLine("[SceneTree] Container not found, skipping update.");
                return;
            }

            EnsureSceneRoot(world);
            world.ExecuteCommands();

            var hierarchy = BuildHierarchy(world);
            SyncRows(world, hierarchy);
            UpdateRows(world, hierarchy);
        }

        // ---------------------------------------------------------------------
        // Container & Scene Root
        // ---------------------------------------------------------------------
        private static bool TryGetContainer(World world)
        {
            if (_containerEntity.HasValue &&
                world.HasComponent<PanelComponent>(_containerEntity.Value) &&
                world.HasComponent<TransformComponent>(_containerEntity.Value))
            {
                var panel = world.GetComponent<PanelComponent>(_containerEntity.Value);
                if (panel.Id == _containerPanelId)
                {
                    _containerTransform = world.GetComponent<TransformComponent>(_containerEntity.Value);
                    _containerPanel = panel;
                    return true;
                }
            }

            _containerEntity = null;
            world.ForEach<PanelComponent>((Entity e) =>
            {
                var panel = world.GetComponent<PanelComponent>(e);
                if (panel.Id == _containerPanelId)
                {
                    _containerEntity = e;
                    _containerTransform = world.GetComponent<TransformComponent>(e);
                    _containerPanel = panel;
                }
            });

            return _containerEntity.HasValue;
        }

        private static void EnsureSceneRoot(World world)
        {
            if (_sceneRoot.HasValue && world.HasComponent<SceneRootComponent>(_sceneRoot.Value))
                return;

            _sceneRoot = null;
            world.ForEach<SceneRootComponent>((Entity e) => _sceneRoot = e);

            if (!_sceneRoot.HasValue)
            {
                _sceneRoot = world.CreateEntity();
                world.AddComponent(_sceneRoot.Value, new SceneRootComponent());
                world.AddComponent(_sceneRoot.Value, new TransformComponent
                {
                    Position = Vector3.Zero,
                    Scale = Vector3.One,
                    Rotation = Quaternion.Identity
                });
                world.AddComponent(_sceneRoot.Value, new NameComponent { NameId = StringRegistry.GetOrAdd("Scene") });
                Console.WriteLine($"[SceneTree] Created Scene root entity {_sceneRoot.Value.Index}.");
            }
        }

        private static Dictionary<Entity, int> BuildHierarchy(World world)
        {
            var result = new Dictionary<Entity, int>();
            if (!_sceneRoot.HasValue) return result;

            var queue = new Queue<(Entity entity, int depth)>();
            queue.Enqueue((_sceneRoot.Value, 0));

            while (queue.Count > 0)
            {
                var (current, depth) = queue.Dequeue();
                result[current] = depth;

                world.ForEach<ParentComponent>((Entity child) =>
                {
                    var p = world.GetComponent<ParentComponent>(child);
                    if (p.Parent == current)
                        queue.Enqueue((child, depth + 1));
                });
            }

            return result;
        }

        // ---------------------------------------------------------------------
        // Row Management
        // ---------------------------------------------------------------------
        private static void SyncRows(World world, Dictionary<Entity, int> hierarchy)
        {
            var toRemove = new List<Entity>();
            foreach (var kv in _rows)
                if (!hierarchy.ContainsKey(kv.Key))
                    toRemove.Add(kv.Key);
            foreach (var e in toRemove)
            {
                DestroyRow(world, _rows[e]);
                _rows.Remove(e);
            }

            // Skip the Scene entity itself (it has a static panel already)
            foreach (var (entity, depth) in hierarchy)
            {
                if (entity == _sceneRoot) continue;

                if (!_rows.ContainsKey(entity))
                    CreateRow(world, entity, depth);
            }
        }

        private static void CreateRow(World world, Entity targetEntity, int depth)
        {
            string typeName = GetEntityTypeName(world, targetEntity);
            var style = GetStyleForType(typeName) ?? GetStyleForType("Object");
            if (style == null || style.TemplatePanelIdResolved == 0)
            {
                Console.WriteLine($"[SceneTree] ERROR: No template panel defined for '{typeName}'");
                return;
            }

            // Find the template panel entity (created by Panels.Load)
            Entity? templatePanelEntity = null;
            world.ForEach<PanelComponent>((Entity e) =>
            {
                var p = world.GetComponent<PanelComponent>(e);
                if (p.Id == style.TemplatePanelIdResolved)
                    templatePanelEntity = e;
            });

            if (!templatePanelEntity.HasValue)
            {
                Console.WriteLine($"[SceneTree] ERROR: Template panel '{StringRegistry.GetString(style.TemplatePanelIdResolved)}' not found.");
                return;
            }

            // Find the associated text entity (from Text.csv) that belongs to this template
            Entity? templateTextEntity = null;
            world.ForEach<TextComponent>((Entity e) =>
            {
                var t = world.GetComponent<TextComponent>(e);
                if (t.PanelId == style.TemplatePanelIdResolved)
                    templateTextEntity = e;
            });

            // Clone the panel
            Entity rowEntity = ClonePanel(world, templatePanelEntity.Value, targetEntity, depth, style);
            if (rowEntity.Index == 0) return;

            // Clone or create the text entity
            Entity textEntity = Entity.Null;
            if (templateTextEntity.HasValue)
            {
                textEntity = CloneTextForRow(world, templateTextEntity.Value, rowEntity, targetEntity, depth, style);
            }

            // Link as child of left_panel for clipping
            var dragComp = world.HasComponent<DragComponent>(rowEntity) 
                ? world.GetComponent<DragComponent>(rowEntity) 
                : new DragComponent();
            dragComp.ParentNameId = _containerPanelId;
            world.SetComponent(rowEntity, dragComp);

            _rows[targetEntity] = new RowData
            {
                PanelEntity = rowEntity,
                TextEntity = textEntity,
                TargetEntity = targetEntity,
                Style = style,
                LastSelectedState = world.HasComponent<SelectedComponent>(targetEntity),
                Depth = depth
            };

            Console.WriteLine($"[SceneTree] Created row for {typeName} entity {targetEntity.Index}");
        }

        private static Entity ClonePanel(World world, Entity template, Entity targetEntity, int depth, SceneTreeRow style)
        {
            var templateTrans = world.GetComponent<TransformComponent>(template);
            var templatePanel = world.GetComponent<PanelComponent>(template);
            var templateMat = world.GetComponent<MaterialComponent>(template);

            float containerWidth = _containerTransform.Scale.X;
            float rowWidth = containerWidth - _paddingX * 2f;
            float rowHeight = templateTrans.Scale.Y;

            int rowPanelId = StringRegistry.GetOrAdd($"_st_{targetEntity.Index}");

            Entity newEntity = world.CreateEntity();

            world.AddComponent(newEntity, new TransformComponent
            {
                Position = Vector3.Zero,
                Scale = new Vector3(rowWidth, rowHeight, 1),
                Rotation = Quaternion.Identity
            });

            world.AddComponent(newEntity, new PanelComponent
            {
                Id = rowPanelId,
                Visible = _containerPanel.Visible,
                Layer = _containerPanel.Layer + 1,
                Alpha = templatePanel.Alpha,
                Clickable = templatePanel.Clickable,
                TextId = 0,  // Text is separate entity, not inline
                ClipChildren = false
            });

            Vector4 color = style.RowColorIdResolved != 0 
                ? GetColorFromId(style.RowColorIdResolved) 
                : templateMat.Color;
            world.AddComponent(newEntity, new MaterialComponent
            {
                PipelineId = templateMat.PipelineId,
                Color = color
            });

            return newEntity;
        }

        private static Entity CloneTextForRow(World world, Entity templateText, Entity rowPanelEntity, Entity targetEntity, int depth, SceneTreeRow style)
        {
            var templateTextComp = world.GetComponent<TextComponent>(templateText);
            var templateTrans = world.GetComponent<TransformComponent>(templateText);

            // Get the row panel's ID
            var rowPanel = world.GetComponent<PanelComponent>(rowPanelEntity);
            int rowPanelId = rowPanel.Id;

            // Build the display name
            string displayName = GetDisplayName(targetEntity);
            int contentId = StringRegistry.GetOrAdd(displayName);

            Entity newTextEntity = world.CreateEntity();

            world.AddComponent(newTextEntity, new TransformComponent
            {
                Position = Vector3.Zero,
                Scale = templateTrans.Scale,
                Rotation = Quaternion.Identity
            });

            world.AddComponent(newTextEntity, new TextComponent
            {
                Id = StringRegistry.GetOrAdd($"_st_txt_{targetEntity.Index}"),
                ContentId = contentId,
                FontId = templateTextComp.FontId,
                FontSize = templateTextComp.FontSize,
                Color = templateTextComp.Color,
                Align = templateTextComp.Align,
                VAlign = templateTextComp.VAlign,
                Layer = _containerPanel.Layer + 2,
                PanelId = rowPanelId,
                PadLeft = templateTextComp.PadLeft + depth * style.IndentPerLevel,
                PadTop = templateTextComp.PadTop,
                LineHeight = templateTextComp.LineHeight,
                Source = templateTextComp.Source,
                Prefix = templateTextComp.Prefix,
                Rotation = templateTextComp.Rotation
            });

            return newTextEntity;
        }

        private static void DestroyRow(World world, RowData row)
        {
            world.DestroyEntity(row.PanelEntity);
            if (row.TextEntity.Index != 0)
                world.DestroyEntity(row.TextEntity);
        }

        private static void UpdateRows(World world, Dictionary<Entity, int> hierarchy)
        {
            float containerLeft   = _containerTransform.Position.X - _containerTransform.Scale.X * 0.5f;
            float containerTop    = _containerTransform.Position.Y - _containerTransform.Scale.Y * 0.5f;
            float containerWidth  = _containerTransform.Scale.X;
            float containerHeight = _containerTransform.Scale.Y;

            // Start Y after the fixed Scene panel (height = 24, top = 80, so bottom = 104)
            float y = 104 + _paddingY;

            var orderedEntities = hierarchy.OrderBy(kv => kv.Value).ThenBy(kv => kv.Key.Index).Select(kv => kv.Key).ToList();

            foreach (var entity in orderedEntities)
            {
                if (entity == _sceneRoot) continue;

                if (!_rows.TryGetValue(entity, out var row))
                    continue;

                bool isSelected = world.HasComponent<SelectedComponent>(entity);
                var panelTrans = world.GetComponent<TransformComponent>(row.PanelEntity);
                var material = world.GetComponent<MaterialComponent>(row.PanelEntity);

                float rowHeight = panelTrans.Scale.Y;
                float rowWidth = containerWidth - _paddingX * 2f;

                panelTrans.Position = new Vector3(
                    containerLeft + _paddingX + rowWidth * 0.5f,
                    y + rowHeight * 0.5f,
                    0f
                );
                panelTrans.Scale = new Vector3(rowWidth, rowHeight, 1f);
                world.SetComponent(row.PanelEntity, panelTrans);

                if (isSelected != row.LastSelectedState)
                {
                    Vector4 normalColor = row.Style.RowColorIdResolved != 0
                        ? GetColorFromId(row.Style.RowColorIdResolved)
                        : material.Color;
                    Vector4 selectedColor = row.Style.RowSelectedColorIdResolved != 0
                        ? GetColorFromId(row.Style.RowSelectedColorIdResolved)
                        : new Vector4(0.3f, 0.5f, 0.8f, 1f);
                    material.Color = isSelected ? selectedColor : normalColor;
                    world.SetComponent(row.PanelEntity, material);
                    row.LastSelectedState = isSelected;
                }

                y += rowHeight;

                if (y + rowHeight > containerTop + containerHeight - _paddingY)
                    break;
            }
        }

        // ---------------------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------------------
        private static string GetEntityTypeName(World world, Entity e)
        {
            if (world.HasComponent<SceneRootComponent>(e)) return "Scene";
            if (world.HasComponent<CameraComponent>(e)) return "Camera";
            if (world.HasComponent<LightComponent>(e)) return "Light";
            if (world.HasComponent<TerrainComponent>(e)) return "Terrain";
            if (world.HasComponent<MeshComponent>(e)) return "Object";
            if (world.HasComponent<ParentComponent>(e) && !world.HasComponent<MeshComponent>(e)) return "Parent";
            return "Object";
        }

        private static string GetDisplayName(Entity entity)
        {
            var world = Object.ECSWorld;
            if (world.HasComponent<NameComponent>(entity))
            {
                int id = world.GetComponent<NameComponent>(entity).NameId;
                string name = StringRegistry.GetString(id);
                if (!string.IsNullOrEmpty(name))
                    return name;
            }
            return $"Entity_{entity.Index}";
        }

        private static Vector4 GetColorFromId(int colorId)
        {
            string colorName = StringRegistry.GetString(colorId);
            var c = Colors.Get(colorName);
            return new Vector4(c.R, c.G, c.B, c.Alpha);
        }

        // Stubs for context menu actions
        public static void RenameSelected(int panelId, Vector2 mousePos) => Console.WriteLine($"[SceneTree] Rename {panelId}");
        public static void DeleteSelected(int panelId, Vector2 mousePos) => Console.WriteLine($"[SceneTree] Delete {panelId}");
    }
}
