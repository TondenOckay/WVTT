#version 450

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inColor;

layout(location = 0) out vec3 fragColor;

layout(push_constant) uniform PushConstants {
    mat4 MVP;
    mat4 Model;
    vec4 Color;
} push;

void main() {
    gl_Position = push.MVP * vec4(inPosition, 1.0);
    fragColor = inColor;
}
