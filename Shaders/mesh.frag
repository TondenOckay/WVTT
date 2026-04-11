#version 450

layout(location = 0) in vec3 fragNormal;
layout(location = 1) in vec4 fragColor;

layout(location = 0) out vec4 outColor;

void main() {
    vec3 lightDir = normalize(vec3(1.0, 2.0, 3.0));
    float ambient = 0.3;
    float diff = max(dot(normalize(fragNormal), lightDir), 0.0);
    float light = ambient + diff * 0.7;
    outColor = vec4(fragColor.rgb * light, fragColor.a);
}
