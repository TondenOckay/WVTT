using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace SETUE.Core
{
    public interface IComponent { }

    public static class ECS
    {
        private static Dictionary<Type, Array> _componentArrays = new();
        private static List<Entity> _entities = new();
        private static int _nextEntityId = 1;

        public struct Entity
        {
            public int Id;
            public Entity(int id) => Id = id;
        }

        public static Entity CreateEntity()
        {
            var e = new Entity(_nextEntityId++);
            _entities.Add(e);
            return e;
        }

        public static void AddComponent<T>(Entity e, T component) where T : struct, IComponent
        {
            var type = typeof(T);
            if (!_componentArrays.TryGetValue(type, out var arr))
            {
                arr = new T[256];
                _componentArrays[type] = arr;
            }
            var typedArr = (T[])arr;
            if (e.Id >= typedArr.Length)
            {
                Array.Resize(ref typedArr, Math.Max(e.Id + 1, typedArr.Length * 2));
                _componentArrays[type] = typedArr;
            }
            typedArr[e.Id] = component;
        }

        public static ref T GetComponent<T>(Entity e) where T : struct, IComponent
        {
            var type = typeof(T);
            if (!_componentArrays.TryGetValue(type, out var arr))
                throw new Exception($"Component {type.Name} not found for entity {e.Id}");
            var typedArr = (T[])arr;
            return ref typedArr[e.Id];
        }

        public static bool HasComponent<T>(Entity e) where T : struct, IComponent
        {
            var type = typeof(T);
            if (!_componentArrays.TryGetValue(type, out var arr)) return false;
            var typedArr = (T[])arr;
            return e.Id < typedArr.Length && !EqualityComparer<T>.Default.Equals(typedArr[e.Id], default);
        }

        public static IEnumerable<Entity> Query<T>() where T : struct, IComponent
        {
            var type = typeof(T);
            if (!_componentArrays.TryGetValue(type, out var arr)) yield break;
            var typedArr = (T[])arr;
            for (int i = 0; i < typedArr.Length; i++)
                if (!EqualityComparer<T>.Default.Equals(typedArr[i], default))
                    yield return new Entity(i);
        }

        public static void RemoveComponent<T>(Entity e) where T : struct, IComponent
        {
            var type = typeof(T);
            if (!_componentArrays.TryGetValue(type, out var arr)) return;
            var typedArr = (T[])arr;
            if (e.Id < typedArr.Length) typedArr[e.Id] = default;
        }

        public static void DestroyEntity(Entity e)
        {
            _entities.RemoveAll(x => x.Id == e.Id);
        }

        public static void LoadFromCSV<T>(string path) where T : struct, IComponent
        {
            if (!File.Exists(path)) return;
            var lines = File.ReadAllLines(path);
            if (lines.Length < 2) return;
            var header = lines[0].Split(',');
            for (int i = 1; i < lines.Length; i++)
            {
                var parts = lines[i].Split(',');
                var entity = CreateEntity();
                var component = Activator.CreateInstance<T>();
                foreach (var field in typeof(T).GetFields())
                {
                    int idx = Array.IndexOf(header, field.Name);
                    if (idx >= 0 && idx < parts.Length)
                    {
                        var val = ConvertValue(parts[idx], field.FieldType);
                        field.SetValueDirect(__makeref(component), val);
                    }
                }
                AddComponent(entity, component);
            }
        }

        private static object ConvertValue(string str, Type t)
        {
            if (t == typeof(string)) return str;
            if (t == typeof(bool)) return bool.TryParse(str, out var b) ? b : false;
            if (t == typeof(int)) return int.TryParse(str, out var iv) ? iv : 0;
            if (t == typeof(uint)) return uint.TryParse(str, out var ui) ? ui : 0u;
            if (t == typeof(float)) return float.TryParse(str, out var f) ? f : 0f;
            if (t.IsEnum) return Enum.TryParse(t, str, true, out var e) ? e : 0;
            return null;
        }

        public static void LoadAll()
        {
            Console.WriteLine("[ECS] Loading all components...");
            string ecsCsvPath = "Core/ECS.csv";
            if (!File.Exists(ecsCsvPath))
            {
                Console.WriteLine($"[ECS] Missing {ecsCsvPath}");
                return;
            }
            var lines = File.ReadAllLines(ecsCsvPath);
            if (lines.Length < 2) return;
            var header = lines[0].Split(',');
            int idxComp = Array.IndexOf(header, "ComponentName");
            int idxPath = Array.IndexOf(header, "CSVPath");
            int idxEnabled = Array.IndexOf(header, "Enabled");
            for (int i = 1; i < lines.Length; i++)
            {
                var parts = lines[i].Split(',');
                if (parts.Length <= idxEnabled) continue;
                if (parts[idxEnabled].Trim().ToLower() != "true") continue;
                var compName = parts[idxComp].Trim();
                var path = parts[idxPath].Trim();
                var type = Type.GetType($"SETUE.Components.{compName}");
                if (type != null)
                {
                    var method = typeof(ECS).GetMethod("LoadFromCSV").MakeGenericMethod(type);
                    method.Invoke(null, new object[] { path });
                    Console.WriteLine($"[ECS] Loaded {compName} from {path}");
                }
                else
                {
                    Console.WriteLine($"[ECS] Component type not found: SETUE.Components.{compName}");
                }
            }
        }
    }
}
