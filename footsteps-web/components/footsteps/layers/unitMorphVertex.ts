// Adapted from deck.gl 9.1 ScatterplotLayer, MIT, Copyright vis.gl contributors.
// Retains its projection and antialiasing; morph.progress blends the years and
// morph.brightness dims bands/villages (city glows keep full alpha).
// `#version` must be the first characters of the source: no leading newline.
const unitMorphVertex = /* glsl */ `#version 300 es
#define SHADER_NAME unit-morph-vertex-shader
in vec3 positions;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceRadius;
in float instanceTargetRadius;
in vec4 instanceFillColors;
in vec4 instanceTargetFillColors;
in vec3 instancePickingColors;
out vec4 vFillColor;
out vec4 vLineColor;
out vec2 unitPosition;
out float innerUnitRadius;
out float outerRadiusPixels;
void main(void) {
  // Life: bands (orange: green channel < 0.8) wander slowly around their
  // camp, villages sway a little, everything breathes. Seeded by position,
  // so each group keeps its own rhythm.
  vec4 kindColor = instanceTargetFillColors;
  bool isCity = kindColor.r < 0.5;
  bool isBand = !isCity && kindColor.g < 0.8;
  float h = fract(sin(dot(instancePositions.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = morph.time;
  float roam = isCity ? 0.0 : (isBand ? 0.014 : 0.003); // degrees (~1.5 km / 0.3 km)
  float w = isBand ? 0.18 + 0.12 * h : 0.35 + 0.2 * h;
  vec2 drift = roam * vec2(
    sin(t * w + h * 6.2832) + 0.4 * sin(t * w * 2.3 + h * 17.0),
    cos(t * w * 0.8 + h * 4.0) + 0.4 * cos(t * w * 1.9 + h * 11.0)
  );
  vec3 livePosition = instancePositions + vec3(drift, 0.0);
  float breathe = 1.0 + (isCity ? 0.05 : 0.14) * sin(t * (0.9 + h) + h * 6.2832);
  geometry.worldPosition = livePosition;
  float radius = mix(instanceRadius, instanceTargetRadius, morph.progress) * breathe;
  outerRadiusPixels = clamp(
    project_size_to_pixel(scatterplot.radiusScale * radius, scatterplot.radiusUnits),
    scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
  );
  float edgePadding = (outerRadiusPixels + SMOOTH_EDGE_RADIUS) / outerRadiusPixels;
  unitPosition = edgePadding * positions.xy;
  geometry.uv = unitPosition;
  geometry.pickingColor = instancePickingColors;
  innerUnitRadius = 1.0;
  if (scatterplot.billboard) {
    gl_Position = project_position_to_clipspace(livePosition, instancePositions64Low, vec3(0.0), geometry.position);
    DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
    vec3 offset = edgePadding * positions * outerRadiusPixels;
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  } else {
    vec3 offset = edgePadding * positions * project_pixel_size(outerRadiusPixels);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position = project_position_to_clipspace(livePosition, instancePositions64Low, offset, geometry.position);
    DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
  }
  vFillColor = mix(instanceFillColors, instanceTargetFillColors, morph.progress);
  // City glows are the only marks with red < 0.5 (unitMorph.ts color); both
  // endpoints share a kind. Bands and villages take the zoom dimming.
  vFillColor.a *= instanceTargetFillColors.r < 0.5 ? 1.0 : morph.brightness;
  vFillColor.a *= layer.opacity;
  DECKGL_FILTER_COLOR(vFillColor, geometry);
  vLineColor = vec4(0.0);
}
`;
export default unitMorphVertex;
