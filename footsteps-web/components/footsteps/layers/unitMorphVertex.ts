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
  geometry.worldPosition = instancePositions;
  float radius = mix(instanceRadius, instanceTargetRadius, morph.progress);
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
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
    DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
    vec3 offset = edgePadding * positions * outerRadiusPixels;
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  } else {
    vec3 offset = edgePadding * positions * project_pixel_size(outerRadiusPixels);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset, geometry.position);
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
