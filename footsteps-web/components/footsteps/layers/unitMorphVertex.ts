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
in vec2 instanceMobility;
in vec3 instancePickingColors;
out vec4 vFillColor;
out vec4 vLineColor;
out vec2 unitPosition;
out float innerUnitRadius;
out float outerRadiusPixels;
out float vCore; // the mark's own radius as a share of the drawn sprite
out float vSeed; // per-mark phase for the flicker
out float vFire; // 1 = small, fire-like (halo, hot core, flicker); 0 = settled disc
void main(void) {
  // Life: the kind is read from the colour (lib/waysOfLife.ts keeps the palette
  // to this). Groups stay where they are placed: the screen runs in real time, and
  // a band walking a few km an hour does not move visibly at any zoom we draw it.
  // Everything breathes (the fire), seeded by position so each group has its own rhythm.
  vec4 kindColor = instanceTargetFillColors;
  bool isCity = kindColor.r < 0.5;
  float h = fract(sin(dot(instancePositions.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = morph.time;
  vec3 livePosition = instancePositions;
  float breathe = 1.0 + morph.settle * (isCity ? 0.05 : 0.14) * sin(t * (0.9 + h) + h * 6.2832);
  geometry.worldPosition = livePosition;
  float radius = mix(instanceRadius, instanceTargetRadius, morph.progress) * breathe;
  float coreRadiusPixels = clamp(
    project_size_to_pixel(scatterplot.radiusScale * radius, scatterplot.radiusUnits),
    scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
  );
  // Bands and villages are drawn as fires: a sprite at least morph.halo px
  // wide around the mark, so they read like the far-out firelight; as they
  // grow on screen the halo shrinks to a rim and the flicker calms.
  vFire = isCity ? 0.0 : 1.0 - smoothstep(3.0, 14.0, coreRadiusPixels);
  outerRadiusPixels = isCity ? coreRadiusPixels : max(coreRadiusPixels * (1.0 + 0.6 * vFire), morph.halo * vFire);
  outerRadiusPixels = max(outerRadiusPixels, coreRadiusPixels);
  vCore = coreRadiusPixels / outerRadiusPixels;
  vSeed = h;
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
