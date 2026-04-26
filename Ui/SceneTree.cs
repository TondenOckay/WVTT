using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using SETUE.Controls;
using SETUE.Core;
using SETUE.ECS;
using static SETUE.Vulkan;

namespace SETUE.UI
{
    public static class SceneTree
    {
        private class RowConfig
        {
            public string ParentType = string.Empty;
            public string ChildType = string.Empty;
            public string TypeName = string.Empty;
            public string RowTemplate = string.Empty;
            public string MenuTemplate = string.Empty;
            public string[] CreateComponents = Array.Empty<string>();
            public string Value = string.Empty;
        }

        private static readonly List<RowConfig> _allRows = new();

        private static float _paddingX;
        private static float _paddingY;
        private static float _menuOffsetX;
        private static float _menuOffsetY;
        private static string _menuAnchor = "mouse";

        private static readonly Dictionary<string, RowConfig> _typeToConfig = new();
        private static readonly Dictionary<string, List<RowConfig>> _parentToChildren = new();
        private static readonly Dictionary<int, RowConfig> _menuItemIdToConfig = new();

        public struct EntityTypeComponent : IComponent
        {
            public int TypeNameId;
        }

        private static Entity? _containerEntity;
        private static TransformComponent _containerTransform;
        private static Entity? _sceneRoot;
        private static int _containerPanelId;

        private class RowData
        {
            public Entity PanelEntity;
            public Entity TargetEntity;
            public int Depth;
        }
        private static readonly Dictionary<Entity, RowData> _rows = new();

        private static Entity? _activeMenuContainer;
        private static List<Entity> _activeMenuItems = new();
        private static Dictionary<Entity, Vector3> _originalPositions = new();

        private static Entity? _selectedEntity;
        private static Entity? _pendingRenameEntity;
        private static Entity? _currentContextEntity;

        public static void Load()
        {
            Console.WriteLine("[SceneTree] ========== Load() ==========");
            _containerPanelId = StringRegistry.GetOrAdd("left_panel");
            LoadConfig("Ui/SceneTree.csv");
            BuildLookups();
            HideAllTemplates();
        }

        private static void LoadConfig(string path)
        {
            if (!File.Exists(path))
                throw new FileNotFoundException($"[SceneTree] ERROR: Required file '{path}' not found.");

            var lines = File.ReadAllLines(path);
            if (lines.Length < 2)
                throw new InvalidDataException($"[SceneTree] ERROR: '{path}' has no data rows.");

            var headers = lines[0].Split(',');
            var colIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < headers.Length; i++)
                colIndex[headers[i].Trim()] = i;

            string Get(string col, string[] parts) =>
                colIndex.TryGetValue(col, out int idx) && idx < parts.Length ? parts[idx].Trim() : "";

            _allRows.Clear();

            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                var parts = line.Split(',');

                _allRows.Add(new RowConfig
                {
                    ParentType = Get("parent_type", parts),
                    ChildType = Get("child_type", parts),
                    TypeName = Get("type_name", parts),
                    RowTemplate = Get("row_template", parts),
                    MenuTemplate = Get("menu_template", parts),
                    CreateComponents = Get("create_components", parts).Split(';', StringSplitOptions.RemoveEmptyEntries),
                    Value = Get("value", parts)
                });
            }

            Console.WriteLine($"[SceneTree] Loaded {_allRows.Count} configuration rows.");
        }

        private static void BuildLookups()
        {
            _typeToConfig.Clear();
            _parentToChildren.Clear();
            _menuItemIdToConfig.Clear();

            foreach (var row in _allRows)
            {
                if (row.ParentType == "Config")
                {
                    if (row.ChildType == "padding_x" && float.TryParse(row.Value, out float px)) _paddingX = px;
                    else if (row.ChildType == "padding_y" && float.TryParse(row.Value, out float py)) _paddingY = py;
                    else if (row.ChildType == "menu_offset_x" && float.TryParse(row.Value, out float mx)) _menuOffsetX = mx;
                    else if (row.ChildType == "menu_offset_y" && float.TryParse(row.Value, out float my)) _menuOffsetY = my;
                    else if (row.ChildType == "menu_anchor") _menuAnchor = row.Value;
                }
                else
                {
                    if (!string.IsNullOrEmpty(row.TypeName))
                    {
                        _typeToConfig[row.TypeName] = row;
                        Console.WriteLine($"[SceneTree] Registered type: {row.TypeName}");
                    }

                    if (!string.IsNullOrEmpty(row.ParentType))
                    {
                        if (!_parentToChildren.ContainsKey(row.ParentType))
                            _parentToChildren[row.ParentType] = new List<RowConfig>();
                        _parentToChildren[row.ParentType].Add(row);
                    }

                    if (!string.IsNullOrEmpty(row.MenuTemplate))
                    {
                        int menuItemId = StringRegistry.GetOrAdd(row.MenuTemplate);
                        _menuItemIdToConfig[menuItemId] = row;
                        Console.WriteLine($"[SceneTree] Mapped menu item '{row.MenuTemplate}' (ID {menuItemId}) to config for type '{row.TypeName}'");
                    }
                }
            }

            Console.WriteLine($"[SceneTree] Settings: padding=({_paddingX},{_paddingY}) offset=({_menuOffsetX},{_menuOffsetY}) anchor={_menuAnchor}");
            Console.WriteLine($"[SceneTree] Registered {_typeToConfig.Count} entity types, {_menuItemIdToConfig.Count} menu item mappings.");
        }

        private static void HideAllTemplates()
        {
            var world = Object.ECSWorld;
            world.ForEach<PanelComponent>((Entity e) =>
            {
                var p = world.GetComponent<PanelComponent>(e);
                string id = StringRegistry.GetString(p.Id);
                if (id.StartsWith("_st_template_") || id.StartsWith("scene_menu_"))
                {
                    p.Visible = false;
                    world.SetComponent(e, p);
                }
            });
            world.ExecuteCommands();
            Console.WriteLine("[SceneTree] All templates hidden.");
        }

        public static void Update()
        {
            var world = Object.ECSWorld;
            if (!TryGetContainer(world))
            {
                Console.WriteLine("[SceneTree] Update: Container not found.");
                return;
            }
            EnsureSceneRoot(world);
            world.ExecuteCommands();
            var hierarchy = BuildHierarchy(world);
            SyncRows(world, hierarchy);
            UpdateRows(world, hierarchy);

            if (Input.IsEditing)
            {
                if (Input.EditConfirmed) OnEditConfirmed();
                else if (Input.EditCancelled) OnEditCancelled();
            }
        }

        private static bool TryGetContainer(World world)
        {
            if (_containerEntity.HasValue &&
                world.HasComponent<PanelComponent>(_containerEntity.Value) &&
                world.HasComponent<TransformComponent>(_containerEntity.Value))
            {
                var p = world.GetComponent<PanelComponent>(_containerEntity.Value);
                if (p.Id == _containerPanelId)
                {
                    _containerTransform = world.GetComponent<TransformComponent>(_containerEntity.Value);
                    return true;
                }
            }
            _containerEntity = null;
            world.ForEach<PanelComponent>((Entity e) =>
            {
                var p = world.GetComponent<PanelComponent>(e);
                if (p.Id == _containerPanelId)
                {
                    _containerEntity = e;
                    _containerTransform = world.GetComponent<TransformComponent>(e);
                    Console.WriteLine($"[SceneTree] Container found: entity {e.Index}");
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
                world.AddComponent(_sceneRoot.Value, new TransformComponent { Position = Vector3.Zero, Scale = Vector3.One });
                world.AddComponent(_sceneRoot.Value, new NameComponent { NameId = StringRegistry.GetOrAdd("Scene") });
                world.AddComponent(_sceneRoot.Value, new EntityTypeComponent { TypeNameId = StringRegistry.GetOrAdd("Scene") });
                Console.WriteLine($"[SceneTree] Created Scene root entity {_sceneRoot.Value.Index}.");
            }
        }

        private static Dictionary<Entity, int> BuildHierarchy(World world)
        {
            var result = new Dictionary<Entity, int>();
            if (!_sceneRoot.HasValue) return result;
            var queue = new Queue<(Entity, int)>();
            queue.Enqueue((_sceneRoot.Value, 0));
            while (queue.Count > 0)
            {
                var (cur, depth) = queue.Dequeue();
                result[cur] = depth;
                world.ForEach<ParentComponent>((Entity child) =>
                {
                    var p = world.GetComponent<ParentComponent>(child);
                    if (p.Parent == cur) queue.Enqueue((child, depth + 1));
                });
            }
            Console.WriteLine($"[SceneTree] Hierarchy built: {result.Count} entities.");
            return result;
        }

        private static void SyncRows(World world, Dictionary<Entity, int> hierarchy)
        {
            var toRemove = _rows.Keys.Where(e => !hierarchy.ContainsKey(e)).ToList();
            foreach (var e in toRemove)
            {
                Console.WriteLine($"[SceneTree] Removing row for entity {e.Index}");
                world.DestroyEntity(_rows[e].PanelEntity);
                _rows.Remove(e);
            }
            foreach (var (e, depth) in hierarchy)
            {
                if (e == _sceneRoot) continue;
                if (!_rows.ContainsKey(e))
                {
                    Console.WriteLine($"[SceneTree] Creating row for entity {e.Index} (type {GetEntityTypeName(world, e)})");
                    CreateRow(world, e, depth);
                }
            }
        }

        private static void CreateRow(World world, Entity target, int depth)
        {
            string typeName = GetEntityTypeName(world, target);
            Console.WriteLine($"[SceneTree] CreateRow: target={target.Index}, type='{typeName}'");

            if (!_typeToConfig.TryGetValue(typeName, out var config))
            {
                Console.WriteLine($"[SceneTree] ERROR: No config for type '{typeName}'");
                return;
            }

            string rowTemplateId = config.RowTemplate;
            if (string.IsNullOrEmpty(rowTemplateId))
            {
                Console.WriteLine($"[SceneTree] ERROR: RowTemplate empty for type '{typeName}'");
                return;
            }

            int templateId = StringRegistry.GetOrAdd(rowTemplateId);
            Entity? template = FindPanelById(world, templateId);
            if (!template.HasValue)
            {
                Console.WriteLine($"[SceneTree] ERROR: Template panel '{rowTemplateId}' (ID {templateId}) not found!");
                return;
            }

            Console.WriteLine($"[SceneTree] Cloning template '{rowTemplateId}' for target {target.Index}");
            Entity row = ClonePanel(world, template.Value, target);
            if (row.Index == 0)
            {
                Console.WriteLine("[SceneTree] ERROR: ClonePanel returned invalid entity.");
                return;
            }

            var drag = world.HasComponent<DragComponent>(row) ? world.GetComponent<DragComponent>(row) : new DragComponent();
            drag.ParentNameId = _containerPanelId;
            world.SetComponent(row, drag);

            _rows[target] = new RowData { PanelEntity = row, TargetEntity = target, Depth = depth };
            Console.WriteLine($"[SceneTree] Row created: panel entity {row.Index} for target {target.Index}");
        }

        private static Entity? FindPanelById(World world, int id)
        {
            Entity? found = null;
            world.ForEach<PanelComponent>((Entity e) => { if (world.GetComponent<PanelComponent>(e).Id == id) found = e; });
            return found;
        }

        private static Entity ClonePanel(World world, Entity template, Entity target)
        {
            var tTrans = world.GetComponent<TransformComponent>(template);
            var tPanel = world.GetComponent<PanelComponent>(template);
            var tMat = world.GetComponent<MaterialComponent>(template);

            float w = _containerTransform.Scale.X - _paddingX * 2f;
            float h = tTrans.Scale.Y;

            int newId = StringRegistry.GetOrAdd($"_st_{target.Index}");
            Entity e = world.CreateEntity();
            world.AddComponent(e, new TransformComponent { Position = Vector3.Zero, Scale = new Vector3(w, h, 1) });
            world.AddComponent(e, new PanelComponent { Id = newId, Visible = true, Layer = tPanel.Layer, Clickable = tPanel.Clickable, TextId = tPanel.TextId });
            world.AddComponent(e, new MaterialComponent { PipelineId = tMat.PipelineId, Color = tMat.Color });

            if (world.HasComponent<TextComponent>(template))
            {
                var txt = world.GetComponent<TextComponent>(template);
                string name = GetDisplayName(target);
                world.AddComponent(e, new TextComponent
                {
                    Id = StringRegistry.GetOrAdd($"_st_txt_{target.Index}"),
                    ContentId = StringRegistry.GetOrAdd(name),
                    FontId = txt.FontId,
                    FontSize = txt.FontSize,
                    Color = txt.Color,
                    Align = txt.Align,
                    VAlign = txt.VAlign,
                    Layer = tPanel.Layer + 1,
                    PanelId = newId,
                    PadLeft = txt.PadLeft,
                    PadTop = txt.PadTop,
                    LineHeight = txt.LineHeight
                });
            }
            return e;
        }

        private static void UpdateRows(World world, Dictionary<Entity, int> hierarchy)
        {
            if (_containerEntity == null)
            {
                Console.WriteLine("[SceneTree] UpdateRows: Container entity is null.");
                return;
            }

            float left = _containerTransform.Position.X - _containerTransform.Scale.X * 0.5f;
            float top = _containerTransform.Position.Y - _containerTransform.Scale.Y * 0.5f;
            float y = 104 + _paddingY;

            Console.WriteLine($"[SceneTree] UpdateRows: container=({left:F0},{top:F0}) startY={y:F0}");

            foreach (var e in hierarchy.OrderBy(kv => kv.Value).ThenBy(kv => kv.Key.Index).Select(kv => kv.Key))
            {
                if (e == _sceneRoot || !_rows.TryGetValue(e, out var row)) continue;
                var trans = world.GetComponent<TransformComponent>(row.PanelEntity);
                float h = trans.Scale.Y;
                trans.Position = new Vector3(left + _paddingX + (_containerTransform.Scale.X - _paddingX * 2f) * 0.5f, y + h * 0.5f, 0);
                world.SetComponent(row.PanelEntity, trans);
                Console.WriteLine($"[SceneTree]   Row for '{GetDisplayName(e)}' at Y={y:F0}");
                y += h;
                if (y + h > top + _containerTransform.Scale.Y - _paddingY) break;
            }
        }

        private static string GetEntityTypeName(World world, Entity e)
        {
            if (world.HasComponent<EntityTypeComponent>(e))
                return StringRegistry.GetString(world.GetComponent<EntityTypeComponent>(e).TypeNameId);
            return "Object";
        }

        private static string GetDisplayName(Entity e)
        {
            var world = Object.ECSWorld;
            if (world.HasComponent<NameComponent>(e))
                return StringRegistry.GetString(world.GetComponent<NameComponent>(e).NameId);
            return $"Entity_{e.Index}";
        }

        // ---------------------------------------------------------------------
        // Context Menu
        // ---------------------------------------------------------------------
        public static void ShowContextMenu(World world, int clickedPanelId, Vector2 mousePos)
        {
            Console.WriteLine($"[SceneTree] ShowContextMenu: clicked={StringRegistry.GetString(clickedPanelId)} mouse=({mousePos.X:F0},{mousePos.Y:F0})");

            Entity? target = null;
            if (clickedPanelId == StringRegistry.GetOrAdd("_st_Scene"))
                target = _sceneRoot;
            else
                foreach (var kv in _rows)
                    if (world.GetComponent<PanelComponent>(kv.Value.PanelEntity).Id == clickedPanelId)
                        target = kv.Key;

            if (!target.HasValue) return;

            _currentContextEntity = target.Value;
            _selectedEntity = target.Value;

            string typeName = GetEntityTypeName(world, target.Value);
            Console.WriteLine($"[SceneTree] Target type: {typeName}");

            if (!_typeToConfig.TryGetValue(typeName, out var config))
            {
                Console.WriteLine($"[SceneTree] No config for type '{typeName}'");
                return;
            }

            string menuTemplateId = config.MenuTemplate;
            Console.WriteLine($"[SceneTree] Menu template ID from config: '{menuTemplateId}'");

            if (string.IsNullOrEmpty(menuTemplateId)) return;

            Entity? template = FindPanelById(world, StringRegistry.GetOrAdd(menuTemplateId));
            if (!template.HasValue) return;

            HideContextMenu(world);

            _activeMenuContainer = template.Value;
            int containerPanelId = world.GetComponent<PanelComponent>(_activeMenuContainer.Value).Id;

            _activeMenuItems.Clear();
            world.ForEach<PanelComponent>((Entity e) =>
            {
                if (world.HasComponent<DragComponent>(e))
                {
                    var drag = world.GetComponent<DragComponent>(e);
                    if (drag.ParentNameId == containerPanelId)
                        _activeMenuItems.Add(e);
                }
            });
            Console.WriteLine($"[SceneTree] Found {_activeMenuItems.Count} child menu items.");

            _originalPositions.Clear();
            var containerTrans = world.GetComponent<TransformComponent>(_activeMenuContainer.Value);
            _originalPositions[_activeMenuContainer.Value] = containerTrans.Position;
            foreach (var item in _activeMenuItems)
            {
                var itemTrans = world.GetComponent<TransformComponent>(item);
                _originalPositions[item] = itemTrans.Position;
            }

            float menuWidth = containerTrans.Scale.X;
            float menuHeight = containerTrans.Scale.Y;
            float desiredX, desiredY;

            if (_menuAnchor == "parent_bottom")
            {
                Entity? rowPanelEntity = null;
                if (target.Value == _sceneRoot)
                    rowPanelEntity = FindPanelById(world, StringRegistry.GetOrAdd("_st_Scene"));
                else if (_rows.TryGetValue(target.Value, out var rowData))
                    rowPanelEntity = rowData.PanelEntity;

                if (rowPanelEntity.HasValue)
                {
                    var rowTrans = world.GetComponent<TransformComponent>(rowPanelEntity.Value);
                    float rowLeft   = rowTrans.Position.X - rowTrans.Scale.X * 0.5f;
                    float rowBottom = rowTrans.Position.Y + rowTrans.Scale.Y * 0.5f;
                    desiredX = rowLeft + _menuOffsetX;
                    desiredY = rowBottom + _menuOffsetY;
                }
                else
                {
                    desiredX = mousePos.X + _menuOffsetX;
                    desiredY = mousePos.Y + _menuOffsetY;
                }
            }
            else
            {
                desiredX = mousePos.X + _menuOffsetX;
                desiredY = mousePos.Y + _menuOffsetY;
            }

            float sw = SwapExtent.Width;
            float sh = SwapExtent.Height;
            if (desiredX + menuWidth > sw) desiredX = sw - menuWidth;
            if (desiredY + menuHeight > sh) desiredY = sh - menuHeight;
            if (desiredX < 0) desiredX = 0;
            if (desiredY < 0) desiredY = 0;

            float currentLeft = containerTrans.Position.X - menuWidth * 0.5f;
            float currentTop = containerTrans.Position.Y - menuHeight * 0.5f;
            float offsetX = desiredX - currentLeft;
            float offsetY = desiredY - currentTop;

            containerTrans.Position += new Vector3(offsetX, offsetY, 0);
            world.SetComponent(_activeMenuContainer.Value, containerTrans);

            foreach (var item in _activeMenuItems)
            {
                var itemTrans = world.GetComponent<TransformComponent>(item);
                itemTrans.Position += new Vector3(offsetX, offsetY, 0);
                world.SetComponent(item, itemTrans);
            }

            var panel = world.GetComponent<PanelComponent>(_activeMenuContainer.Value);
            panel.Visible = true;
            world.SetComponent(_activeMenuContainer.Value, panel);

            foreach (var item in _activeMenuItems)
            {
                var childPanel = world.GetComponent<PanelComponent>(item);
                childPanel.Visible = true;
                world.SetComponent(item, childPanel);
            }

            world.ExecuteCommands();
            Console.WriteLine($"[SceneTree] Menu shown at ({desiredX:F0},{desiredY:F0}) anchor={_menuAnchor}");
        }

        public static void HideContextMenu(World world)
        {
            if (_activeMenuContainer.HasValue)
            {
                foreach (var kv in _originalPositions)
                {
                    if (world.HasComponent<TransformComponent>(kv.Key))
                    {
                        var trans = world.GetComponent<TransformComponent>(kv.Key);
                        trans.Position = kv.Value;
                        world.SetComponent(kv.Key, trans);
                    }
                }

                var panel = world.GetComponent<PanelComponent>(_activeMenuContainer.Value);
                panel.Visible = false;
                world.SetComponent(_activeMenuContainer.Value, panel);

                foreach (var item in _activeMenuItems)
                {
                    if (world.HasComponent<PanelComponent>(item))
                    {
                        var childPanel = world.GetComponent<PanelComponent>(item);
                        childPanel.Visible = false;
                        world.SetComponent(item, childPanel);
                    }
                }

                _activeMenuContainer = null;
                _activeMenuItems.Clear();
                _originalPositions.Clear();
                world.ExecuteCommands();
                Console.WriteLine("[SceneTree] Context menu hidden.");
            }
        }

        // ---------------------------------------------------------------------
        // Action Methods
        // ---------------------------------------------------------------------
        public static void RenameSelected(int panelId, Vector2 mousePos)
        {
            var world = Object.ECSWorld;
            Entity? target = _selectedEntity ?? _currentContextEntity;
            if (!target.HasValue) return;

            string curName = GetDisplayName(target.Value);
            Input.StartEdit(curName, $"Rename {curName}");
            _pendingRenameEntity = target;
            HideContextMenu(world);
        }

        public static void DeleteSelected(int panelId, Vector2 mousePos)
        {
            var world = Object.ECSWorld;
            Entity? target = _selectedEntity ?? _currentContextEntity;
            if (!target.HasValue || target == _sceneRoot) return;

            world.DestroyEntity(target.Value);
            world.ExecuteCommands();
            Console.WriteLine($"[SceneTree] Deleted entity {target.Value.Index}");
            HideContextMenu(world);
            _selectedEntity = null;
        }

        public static void CreateChild(int panelId, Vector2 mousePos)
        {
            Console.WriteLine($"[SceneTree] >>>>> CREATE CHILD CALLED panelId={StringRegistry.GetString(panelId)} <<<<<");
            var world = Object.ECSWorld;
            Entity? parent = _selectedEntity ?? _currentContextEntity ?? _sceneRoot;
            if (!parent.HasValue)
            {
                Console.WriteLine("[SceneTree] CreateChild: No parent entity available.");
                HideContextMenu(world);
                return;
            }
            Console.WriteLine($"[SceneTree] CreateChild: Parent entity = {GetDisplayName(parent.Value)} (type {GetEntityTypeName(world, parent.Value)})");

            if (!_menuItemIdToConfig.TryGetValue(panelId, out var config))
            {
                Console.WriteLine($"[SceneTree] CreateChild: No config found for menu item ID {panelId} ('{StringRegistry.GetString(panelId)}')");
                HideContextMenu(world);
                return;
            }
            Console.WriteLine($"[SceneTree] CreateChild: Found config for type '{config.TypeName}' with components: {string.Join(", ", config.CreateComponents)}");

            CreateEntity(world, parent.Value, config);
            HideContextMenu(world);
        }

        private static void CreateEntity(World world, Entity parent, RowConfig config)
        {
            Entity newEntity = world.CreateEntity();
            string newName = $"{config.TypeName}_{newEntity.Index}";
            Console.WriteLine($"[SceneTree] CreateEntity: Creating '{newName}' under parent '{GetDisplayName(parent)}'");

            world.AddComponent(newEntity, new TransformComponent { Position = Vector3.Zero, Scale = Vector3.One });
            world.AddComponent(newEntity, new NameComponent { NameId = StringRegistry.GetOrAdd(newName) });
            world.AddComponent(newEntity, new ParentComponent { Parent = parent });
            world.AddComponent(newEntity, new EntityTypeComponent { TypeNameId = StringRegistry.GetOrAdd(config.TypeName) });
            Console.WriteLine($"[SceneTree] CreateEntity: Added core components (Transform, Name, Parent, EntityType)");

            foreach (string compName in config.CreateComponents)
            {
                Type? compType = Type.GetType($"SETUE.ECS.{compName}") ?? Type.GetType(compName);
                if (compType != null && typeof(IComponent).IsAssignableFrom(compType))
                {
                    var instance = Activator.CreateInstance(compType);
                    if (instance != null)
                    {
                        world.GetType().GetMethod("AddComponent")?.MakeGenericMethod(compType).Invoke(world, new object[] { newEntity, instance });
                        Console.WriteLine($"[SceneTree] CreateEntity: Added component '{compName}'");
                    }
                }
                else
                {
                    Console.WriteLine($"[SceneTree] CreateEntity: WARNING - Could not resolve component type '{compName}'");
                }
            }

            world.ExecuteCommands();
            Console.WriteLine($"[SceneTree] CreateEntity: Entity created with index {newEntity.Index}, type '{config.TypeName}'");
        }

        public static void OnEditConfirmed()
        {
            if (!_pendingRenameEntity.HasValue) return;
            string newName = Input.EditBuffer;
            if (string.IsNullOrWhiteSpace(newName)) return;

            var world = Object.ECSWorld;
            if (world.HasComponent<NameComponent>(_pendingRenameEntity.Value))
            {
                var nameComp = world.GetComponent<NameComponent>(_pendingRenameEntity.Value);
                nameComp.NameId = StringRegistry.GetOrAdd(newName);
                world.SetComponent(_pendingRenameEntity.Value, nameComp);
            }
            else world.AddComponent(_pendingRenameEntity.Value, new NameComponent { NameId = StringRegistry.GetOrAdd(newName) });

            if (_rows.TryGetValue(_pendingRenameEntity.Value, out var row) && world.HasComponent<TextComponent>(row.PanelEntity))
            {
                var txt = world.GetComponent<TextComponent>(row.PanelEntity);
                txt.ContentId = StringRegistry.GetOrAdd(newName);
                world.SetComponent(row.PanelEntity, txt);
            }
            _pendingRenameEntity = null;
            Input.EndEdit();
            Console.WriteLine($"[SceneTree] Renamed to '{newName}'");
        }

        public static void OnEditCancelled()
        {
            _pendingRenameEntity = null;
            Input.EndEdit();
            Console.WriteLine("[SceneTree] Rename cancelled.");
        }
    }
}
