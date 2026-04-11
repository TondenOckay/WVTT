#version 450
layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inNormal;
layout(push_constant) uniform Push {
    mat4 mvp;
    mat4 model;
    vec4 color;
} push;
layout(location = 0) out vec2 fragUV;
layout(location = 1) out vec4 fragColor;
void main() {
    gl_Position = push.mvp * vec4(inPosition, 1.0);
    fragUV    = inNormal.xy;
    fragColor = push.color;
}
