using System;
using System.IO;
using System.Numerics;
using SETUE.Core;
using SETUE.Objects3D;

namespace SETUE.Controls;

public static class Camera
{
    private static Vector3 _pivot    = Vector3.Zero;
    private static float   _distance = 10f;
    private static float   _yaw      = 0f;
    private static float   _pitch    = 20f;
    private static float   _fov      = 60f;
    private static float   _near     = 0.1f;
    private static float   _far      = 1000f;
    private static bool    _ortho    = false;
    private static string?  _lastSelId = null;

    private static float _orbitSpeed = 0.4f;
    private static float _panSpeed   = 0.01f;
    private static float _zoomSpeed  = 0.5f;
    private static float _snapDeg    = 15f;
    private static float _frontYaw   = 0f;
    private static float _frontPitch = 0f;
    private static float _rightYaw   = 90f;
    private static float _rightPitch = 0f;
    private static float _topYaw     = 0f;
    private static float _topPitch   = 89f;
    private static float _minPitch   = -89f;
    private static float _maxPitch   = 89f;

    private static bool _invertX = true;
    private static bool _invertY = true;

    public static Vector3 Position { get; private set; }
    public static Vector3 Target   => _pivot;
    public static float   Fov      => _fov;
    public static float   Near     => _near;
    public static float   Far      => _far;
    public static bool    Ortho    => _ortho;

    public static void Load()
    {
        string path = "3d Editor/Camera.csv";
        if (!File.Exists(path)) return;
        var lines = File.ReadAllLines(path);
        if (lines.Length < 2) return;
        var p = lines[1].Split(',');
        if (p.Length < 10) return;

        var pos    = new Vector3(float.Parse(p[1].Trim()), float.Parse(p[2].Trim()), float.Parse(p[3].Trim()));
        _pivot     = new Vector3(float.Parse(p[4].Trim()), float.Parse(p[5].Trim()), float.Parse(p[6].Trim()));
        _fov       = float.Parse(p[7].Trim());
        _near      = float.Parse(p[8].Trim());
        _far       = float.Parse(p[9].Trim());
        _orbitSpeed = p.Length > 10 ? float.Parse(p[10].Trim()) : 0.4f;
        _panSpeed   = p.Length > 11 ? float.Parse(p[11].Trim()) : 0.01f;
        _zoomSpeed  = p.Length > 12 ? float.Parse(p[12].Trim()) : 0.5f;
        _snapDeg    = p.Length > 13 ? float.Parse(p[13].Trim()) : 15f;
        _frontYaw   = p.Length > 14 ? float.Parse(p[14].Trim()) : 0f;
        _frontPitch = p.Length > 15 ? float.Parse(p[15].Trim()) : 0f;
        _rightYaw   = p.Length > 16 ? float.Parse(p[16].Trim()) : 90f;
        _rightPitch = p.Length > 17 ? float.Parse(p[17].Trim()) : 0f;
        _topYaw     = p.Length > 18 ? float.Parse(p[18].Trim()) : 0f;
        _topPitch   = p.Length > 19 ? float.Parse(p[19].Trim()) : 89f;
        _minPitch   = p.Length > 20 ? float.Parse(p[20].Trim()) : -89f;
        _maxPitch   = p.Length > 21 ? float.Parse(p[21].Trim()) : 89f;

        _invertX = p.Length > 22 ? p[22].Trim().ToLower() == "true" : true;
        _invertY = p.Length > 23 ? p[23].Trim().ToLower() == "true" : true;

        _distance   = Vector3.Distance(pos, _pivot);
        var dir    = Vector3.Normalize(pos - _pivot);
        _pitch     = MathF.Asin(dir.Y) * 180f / MathF.PI;
        _yaw       = MathF.Atan2(dir.X, dir.Z) * 180f / MathF.PI;
        UpdatePosition();
        Console.WriteLine($"[Camera] Loaded: pos={Position} pivot={_pivot} dist={_distance:F1} invX={_invertX} invY={_invertY}");
    }

    public static void Update()
    {
        var sel   = SETUE.Objects3D.Objects.SelectedObject;
        var selId = sel?.Id;
        if (selId != _lastSelId)
        {
            if (!SETUE.Controls.Selection.LastHitWasPanel)
                _pivot = sel != null ? new Vector3(sel.X, sel.Y, sel.Z) : Vector3.Zero;
            _lastSelId = selId;
        }

        var delta  = Input.MouseDelta;
        var scroll = Input.ScrollDelta;

        if (Input.IsActionHeld("camera_orbit"))
        {
            float deltaX = delta.X * _orbitSpeed;
            float deltaY = delta.Y * _orbitSpeed;

            if (_invertX) deltaX = -deltaX;
            if (_invertY) deltaY = -deltaY;

            _yaw   += deltaX;
            _pitch -= deltaY;
            _pitch  = Math.Clamp(_pitch, _minPitch, _maxPitch);
        }

        if (Input.IsActionHeld("camera_pan"))
        {
            float yawR   = _yaw   * MathF.PI / 180f;
            float pitchR = _pitch * MathF.PI / 180f;

            var forward = Vector3.Normalize(new Vector3(
                MathF.Cos(pitchR) * MathF.Sin(yawR),
                MathF.Sin(pitchR),
                MathF.Cos(pitchR) * MathF.Cos(yawR)
            ));

            var right = Vector3.Normalize(Vector3.Cross(forward, Vector3.UnitY));
            var up    = Vector3.Normalize(Vector3.Cross(right, forward));

            _pivot -= right * delta.X * _panSpeed * _distance;
            _pivot += up    * delta.Y * _panSpeed * _distance;
        }

        if (scroll != 0f)
        {
            _distance -= scroll * _zoomSpeed;
            _distance  = Math.Max(0.1f, _distance);
        }

        if (Input.IsActionPressed("view_front"))  { _yaw = _frontYaw; _pitch = _frontPitch; }
        if (Input.IsActionPressed("view_right"))  { _yaw = _rightYaw; _pitch = _rightPitch; }
        if (Input.IsActionPressed("view_top"))    { _yaw = _topYaw; _pitch = _topPitch; }
        if (Input.IsActionPressed("toggle_ortho")) _ortho = !_ortho;

        if (Input.IsActionPressed("rotate_left"))  _yaw   -= _snapDeg;
        if (Input.IsActionPressed("rotate_right")) _yaw   += _snapDeg;
        if (Input.IsActionPressed("rotate_up"))    _pitch  = Math.Min(_pitch + _snapDeg, _maxPitch);
        if (Input.IsActionPressed("rotate_down"))  _pitch  = Math.Max(_pitch - _snapDeg, _minPitch);

        UpdatePosition();
        Objects.SetCamera(Position, _pivot, _fov, _near, _far);
    }

    private static void UpdatePosition()
    {
        float yawR   = _yaw   * MathF.PI / 180f;
        float pitchR = _pitch * MathF.PI / 180f;
        Position = _pivot + new Vector3(
            _distance * MathF.Cos(pitchR) * MathF.Sin(yawR),
            _distance * MathF.Sin(pitchR),
            _distance * MathF.Cos(pitchR) * MathF.Cos(yawR));
    }
}
