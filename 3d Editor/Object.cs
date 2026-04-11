using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace SETUE.Objects3D;

public class Object
{
    public string Id      { get; set; } = "";
    public string Shape   { get; set; } = "";
    public float  X       { get; set; }
    public float  Y       { get; set; }
    public float  Z       { get; set; }
    public float  Size    { get; set; }
    public float  PivotX  { get; set; }
    public float  PivotY  { get; set; }
    public float  PivotZ  { get; set; }
    public float  RotX    { get; set; }
    public float  RotY    { get; set; }
    public float  RotZ    { get; set; }
    public float  R       { get; set; }
    public float  G       { get; set; }
    public float  B       { get; set; }
    public bool   Visible { get; set; }
    public int    Layer   { get; set; }
    public string Pipeline { get; set; } = "mesh_pipeline_back";
    public string Parent   { get; set; } = "";

    public void SetProperty(string col, float val)
    {
        switch (col)
        {
            case "x":     X    = val; break;
            case "y":     Y    = val; break;
            case "z":     Z    = val; break;
            case "rot_x": RotX = val; break;
            case "rot_y": RotY = val; break;
            case "rot_z": RotZ = val; break;
            case "size":  Size = val; break;
        }
    }

    public float GetProperty(string col) => col switch
    {
        "x"     => X,
        "y"     => Y,
        "z"     => Z,
        "rot_x" => RotX,
        "rot_y" => RotY,
        "rot_z" => RotZ,
        "size"  => Size,
        _       => 0f
    };

    public Vector3 WorldPosition =>
        new Vector3(X, Y, Z) + new Vector3(PivotX, PivotY, PivotZ);
}

public static class Objects
{
    private static Dictionary<string, Object> _objects = new();
    public static IReadOnlyDictionary<string, Object> All => _objects;

    private static Vector3 _camPos  = new(0, 5, 10);
    private static Vector3 _camLook = new(0, 0, 0);
    private static float   _fov     = 60f;
    private static float   _near    = 0.1f;
    private static float   _far     = 1000f;

    private static float _vpX = 220f;
    private static float _vpY = 75f;
    private static float _vpW = 840f;
    private static float _vpH = 570f;

    public static void Load()
    {
        LoadCamera();

        string path = "3d Editor/Object.csv";
        if (!File.Exists(path)) { Console.WriteLine($"[Objects] File not found: {path}"); return; }

        var lines = File.ReadAllLines(path);
        if (lines.Length < 2) return;

        _objects.Clear();

        for (int i = 1; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
            var p = line.Split(',');
            if (p.Length < 17) continue;

            _objects[p[0].Trim()] = new Object
            {
                Id      = p[0].Trim(),
                Shape   = p[1].Trim(),
                X       = float.Parse(p[2].Trim()),
                Y       = float.Parse(p[3].Trim()),
                Z       = float.Parse(p[4].Trim()),
                Size    = float.Parse(p[5].Trim()),
                PivotX  = float.Parse(p[6].Trim()),
                PivotY  = float.Parse(p[7].Trim()),
                PivotZ  = float.Parse(p[8].Trim()),
                RotX    = float.Parse(p[9].Trim()),
                RotY    = float.Parse(p[10].Trim()),
                RotZ    = float.Parse(p[11].Trim()),
                R       = float.Parse(p[12].Trim()),
                G       = float.Parse(p[13].Trim()),
                B       = float.Parse(p[14].Trim()),
                Visible = bool.Parse(p[15].Trim()),
                Layer   = int.Parse(p[16].Trim()),
                Pipeline = p.Length > 17 ? p[17].Trim() : "mesh_pipeline_back",
                Parent   = p.Length > 18 ? p[18].Trim() : ""
            };
        }

        Console.WriteLine($"[Objects] Loaded {_objects.Count} objects");
    }

    private static void LoadCamera()
    {
        string path = "camera.csv";
        if (!File.Exists(path)) return;
        var lines = File.ReadAllLines(path);
        if (lines.Length < 2) return;
        var p = lines[1].Split(',');
        if (p.Length < 10) return;
        _camPos  = new Vector3(float.Parse(p[1].Trim()), float.Parse(p[2].Trim()), float.Parse(p[3].Trim()));
        _camLook = new Vector3(float.Parse(p[4].Trim()), float.Parse(p[5].Trim()), float.Parse(p[6].Trim()));
        _fov     = float.Parse(p[7].Trim());
        _near    = float.Parse(p[8].Trim());
        _far     = float.Parse(p[9].Trim());
    }

    public static (float sx, float sy, float sw, float sh, bool visible) Project(Object obj)
    {
        Vector3 pivot = new Vector3(obj.X + obj.PivotX, obj.Y + obj.PivotY, obj.Z + obj.PivotZ);
        Vector3 pos   = new Vector3(obj.X, obj.Y, obj.Z);

        Matrix4x4 rot = Matrix4x4.CreateFromYawPitchRoll(
            obj.RotY * MathF.PI / 180f,
            obj.RotX * MathF.PI / 180f,
            obj.RotZ * MathF.PI / 180f);

        Vector3 rotated = Vector3.Transform(pos - pivot, rot) + pivot;

        Vector3 forward = Vector3.Normalize(_camLook - _camPos);
        Vector3 right   = Vector3.Normalize(Vector3.Cross(Vector3.UnitY, forward));
        Vector3 up      = Vector3.Cross(forward, right);

        Vector3 toObj = rotated - _camPos;
        float   vx    = Vector3.Dot(toObj, right);
        float   vy    = Vector3.Dot(toObj, up);
        float   vz    = Vector3.Dot(toObj, forward);

        if (vz <= _near || vz >= _far) return (0, 0, 0, 0, false);

        float fovRad = _fov * MathF.PI / 180f;
        float halfH  = MathF.Tan(fovRad / 2f);
        float aspect = _vpW / _vpH;

        float px = (vx / (vz * halfH * aspect)) * 0.5f + 0.5f;
        float py = 1f - ((vy / (vz * halfH)) * 0.5f + 0.5f);
        float ps = (obj.Size / (vz * halfH)) * 0.5f;

        float sx = _vpX + px * _vpW - ps * _vpW;
        float sy = _vpY + py * _vpH - ps * _vpH;
        float sw = ps * _vpW * 2f;
        float sh = ps * _vpH * 2f;

        return (sx, sy, sw, sh, sw > 1f);
    }

    public static Matrix4x4 GetMVP(Object obj)
    {
        Vector3 pivot = new Vector3(obj.X + obj.PivotX, obj.Y + obj.PivotY, obj.Z + obj.PivotZ);
        Vector3 pos   = new Vector3(obj.X, obj.Y, obj.Z);

        Matrix4x4 rot = Matrix4x4.CreateFromYawPitchRoll(
            obj.RotY * MathF.PI / 180f,
            obj.RotX * MathF.PI / 180f,
            obj.RotZ * MathF.PI / 180f);

        Matrix4x4 model =
            Matrix4x4.CreateTranslation(-pivot) *
            rot *
            Matrix4x4.CreateTranslation(pivot) *
            Matrix4x4.CreateScale(obj.Size);

        Matrix4x4 view = Matrix4x4.CreateLookAt(_camPos, _camLook, Vector3.UnitY);

        float aspect = _vpW / _vpH;
        float fovRad = _fov * MathF.PI / 180f;
        Matrix4x4 proj = Matrix4x4.CreatePerspectiveFieldOfView(fovRad, aspect, _near, _far);
        proj.M22 *= -1f;

        return model * view * proj;
    }

    public static Matrix4x4 GetModel(Object obj)
    {
        Vector3 pivot = new Vector3(obj.X + obj.PivotX, obj.Y + obj.PivotY, obj.Z + obj.PivotZ);
        Matrix4x4 rot = Matrix4x4.CreateFromYawPitchRoll(
            obj.RotY * MathF.PI / 180f,
            obj.RotX * MathF.PI / 180f,
            obj.RotZ * MathF.PI / 180f);
        return Matrix4x4.CreateTranslation(-pivot) * rot * Matrix4x4.CreateTranslation(pivot) * Matrix4x4.CreateScale(obj.Size);
    }

    public static void SetCamera(Vector3 pos, Vector3 look, float fov, float near, float far)
    {
        _camPos  = pos;
        _camLook = look;
        _fov     = fov;
        _near    = near;
        _far     = far;
    }

    private static string? _selectedId = null;
    public  static Object? SelectedObject =>
        _selectedId != null && _objects.TryGetValue(_selectedId, out var o) ? o : null;

    public static void Select(string id)
    {
        if (_objects.ContainsKey(id)) { _selectedId = id; Console.WriteLine($"[Objects] Selected: {id}"); }
    }

    public static void Deselect()
    {
        _selectedId = null;
        Console.WriteLine("[Objects] Deselected");
    }

    public static string? Raycast(Vector2 mousePos)
    {
        float ndcX = ((mousePos.X - _vpX) / _vpW) * 2f - 1f;
        float ndcY = ((mousePos.Y - _vpY) / _vpH) * 2f - 1f;

        float fovRad  = _fov * MathF.PI / 180f;
        float aspect  = _vpW / _vpH;
        float tanHalf = MathF.Tan(fovRad / 2f);

        var rayDir = Vector3.Normalize(new Vector3(
            ndcX * tanHalf * aspect,
           -ndcY * tanHalf,
           -1f));

        Matrix4x4 view = Matrix4x4.CreateLookAt(_camPos, _camLook, Vector3.UnitY);
        Matrix4x4.Invert(view, out var invView);
        rayDir = Vector3.Normalize(Vector3.TransformNormal(rayDir, invView));

        string? bestId   = null;
        float   bestDist = float.MaxValue;
        foreach (var (id, obj) in _objects)
        {
            var  center = new Vector3(obj.X, obj.Y, obj.Z);
            var  oc     = _camPos - center;
            float radius = obj.Size * 0.5f;
            float b = Vector3.Dot(oc, rayDir);
            float c = Vector3.Dot(oc, oc) - radius * radius;
            float disc = b * b - c;
            if (disc < 0f) continue;
            float t = -b - MathF.Sqrt(disc);
            if (t > 0f && t < bestDist) { bestDist = t; bestId = id; }
        }
        return bestId;
    }
}
