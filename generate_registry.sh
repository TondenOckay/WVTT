#!/bin/bash
cd "$(dirname "$0")"
cat > AutoRegistry.cs << 'EOC'
using SETUE.Core;

namespace SETUE
{
    public static class AutoRegistry
    {
        public static void RegisterAll()
        {
            Registry.Register("Text", typeof(SETUE.Systems.Text), null, null);
            Registry.Register("Panel", typeof(SETUE.Systems.Panel), null, null);
            Registry.Register("Selection", typeof(SETUE.Controls.Selection), null, null);
            Registry.Register("Scheduler", typeof(SETUE.Core.Scheduler), null, null);
            Registry.Register("Object", typeof(SETUE.Objects3D.Object), null, null);
            Registry.Register("Shader", typeof(SETUE.RenderEngine.Shader), null, null);
            Registry.Register("Font", typeof(SETUE.UI.Font), null, null);
        }
    }
}
EOC
echo "AutoRegistry.cs generated."
