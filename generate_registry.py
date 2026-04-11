import os
import re

def should_skip(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    # Skip partial classes
    if re.search(r'partial\s+class', content):
        return True
    # Skip static classes
    if re.search(r'static\s+class', content):
        return True
    # Skip structs
    if re.search(r'struct\s+', content):
        return True
    return False

def extract_ns_and_class(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    ns_match = re.search(r'^\s*namespace\s+([A-Za-z0-9_.]+)', content, re.MULTILINE)
    ns = ns_match.group(1) if ns_match else None
    # Match first non-static, non-partial class
    class_match = re.search(r'^\s*(?:public|internal|private|protected)?\s*class\s+([A-Za-z_][A-Za-z0-9_]*)', content, re.MULTILINE)
    cls = class_match.group(1) if class_match else None
    return ns, cls

exclude_dirs = {'bin', 'obj'}
exclude_files = {'AutoRegistry.cs', 'Program.cs', 'Registry.cs'}

out = []
out.append("using SETUE.Core;")
out.append("")
out.append("namespace SETUE")
out.append("{")
out.append("    public static class AutoRegistry")
out.append("    {")
out.append("        public static void RegisterAll()")
out.append("        {")

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    for file in files:
        if not file.endswith('.cs'): continue
        if file in exclude_files: continue
        path = os.path.join(root, file)
        if should_skip(path): continue
        ns, cls = extract_ns_and_class(path)
        if cls is None: continue
        full = f"{ns}.{cls}" if ns else cls
        out.append(f"            Registry.Register(\"{cls}\", typeof({full}), null, null);")

out.append("        }")
out.append("    }")
out.append("}")

with open('AutoRegistry.cs', 'w') as f:
    f.write('\n'.join(out))
print("AutoRegistry.cs generated (data classes only).")
