shader_type spatial;
render_mode diffuse_burley;
uniform vec4 floor_tint : source_color = vec4(0.09, 0.125, 0.135, 1.0);
varying vec3 world_position;
void vertex() { world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
 vec2 p = world_position.xz;
 vec2 cell = floor(p / 2.0);
 float variation = fract(sin(dot(cell,vec2(12.9898,78.233))) * 43758.5453);
 vec2 seam = abs(fract(p / 2.0)-0.5);
 float edge = smoothstep(0.482,0.495,max(seam.x,seam.y));
 vec3 base = mix(vec3(0.063,0.091,0.104),vec3(0.093,0.125,0.135),variation);
 ALBEDO = mix(base * (floor_tint.rgb * 5.0 + vec3(0.3)),vec3(0.018,0.031,0.037),edge);
 ROUGHNESS = 0.78;
 METALLIC = 0.23;
}
