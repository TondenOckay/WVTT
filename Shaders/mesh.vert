#version 450

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inNormal;

layout(push_constant) uniform Push {
    mat4 mvp;
    mat4 model;
    vec4 color;
} push;

layout(location = 0) out vec3 fragNormal;
layout(location = 1) out vec4 fragColor;

void main() {
    gl_Position = push.mvp * vec4(inPosition, 1.0);
    fragNormal = mat3(push.model) * inNormal;
    fragColor = push.color;
}
