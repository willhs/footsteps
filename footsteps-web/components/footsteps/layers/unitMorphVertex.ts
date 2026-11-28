// Adapted from deck.gl 9.1 ScatterplotLayer, MIT, Copyright vis.gl contributors.
// Retains its projection and antialiasing; morph.progress blends the years and
// morph.brightness dims bands/villages (city glows keep full alpha).
// `#version` must be the first characters of the source: no leading newline.
import { CITY_PEOPLE_PER_M2, FOOTPRINT_M, TYPICAL_PEOPLE } from '../hooks/unitMorph';
import { LOOKS } from '@/lib/waysOfLife';
import { WayOfLife } from '@/lib/waysOfLife';

const f = (x: number) => x.toFixed(4);
// The kind is read from the mark's colour: only towns have red < 0.5, and the three warm kinds differ in green
// (LOOKS in lib/waysOfLife.ts; unitMorph.test.ts checks these cut points still separate them).
const green = (way: number) => LOOKS[way as keyof typeof LOOKS].rgb[1] / 255;
export const VILLAGE_GREEN_CUT = (green(WayOfLife.Farmer) + green(WayOfLife.Forager)) / 2;
export const BAND_GREEN_CUT = (green(WayOfLife.Forager) + green(WayOfLife.Herder)) / 2;
/** Below this many pixels of footprint a group is drawn as one sign (a fire, tent, house); above it, as its households. */
export const SIGN_PX = 7;
/** A 5′ HYDE cell's width in metres at the equator: the unit the crowding below is counted in. */
const CELL_M = 40_075_016.686 / 360 / 12;
/** Far out a dense cell holds dozens of groups in a few pixels, each drawn as a sprite of at least `halo` px: the GPU shaded every
 * pixel dozens of times (17 fps on the Ganges at zoom 5 on an M5 Pro). A cell keeps about one mark per this many square pixels of
 * its own area; the rest are not drawn and the kept ones are brightened to make up. From about zoom 8 every mark is drawn. */
export const CROWD_PX2 = 38;
/** People per household (households.ts, Hamilton et al. 2007). */
const HOUSEHOLD = 4.5;

const unitMorphVertex = /* glsl */ `#version 300 es
#define SHADER_NAME unit-morph-vertex-shader
in vec3 positions;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceRadius;
in float instanceTargetRadius;
in vec4 instanceFillColors;
in vec4 instanceTargetFillColors;
in vec2 instanceCrowd; // rank of the mark among its 5′ cell's marks, and their number
in vec3 instancePickingColors;
out vec4 vFillColor;
out vec4 vLineColor;
out vec2 unitPosition;
out float innerUnitRadius;
out float outerRadiusPixels;
out float vCore; // the mark's own radius as a share of the drawn sprite
out float vSeed; // per-mark phase for the flicker
out float vFire; // weight of the far-out look: a small flickering fire
out float vSign; // weight of the kind's sign (fire, tent, house) at middle zoom
out float vKind; // 0 band, 1 village, 2 town or city, 3 herding camp
out float vCorePx; // the group's footprint radius, pixels
out float vCellPx; // spacing of its household marks, pixels
out float vOuterPx; // the drawn sprite radius, pixels (the fragment hook can't see outerRadiusPixels)
void main(void) {
  vec4 kindColor = instanceTargetFillColors;
  bool isCity = kindColor.r < 0.5;
  float kind = isCity ? 2.0 : (kindColor.g > ${f(VILLAGE_GREEN_CUT)} ? 1.0 : (kindColor.g > ${f(BAND_GREEN_CUT)} ? 0.0 : 3.0));
  float h = fract(sin(dot(instancePositions.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = morph.time;
  geometry.worldPosition = instancePositions;
  float radius = mix(instanceRadius, instanceTargetRadius, morph.progress);
  float corePx = clamp(
    project_size_to_pixel(scatterplot.radiusScale * radius, scatterplot.radiusUnits),
    scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
  );
  // Head count, read back from the radius (unitMorph.ts radius(): footprint * sqrt(people / typical)).
  float base = kind < 0.5 ? ${f(FOOTPRINT_M.band)} : kind < 1.5 ? ${f(FOOTPRINT_M.village)} : ${f(FOOTPRINT_M.camp)};
  float typical = kind < 0.5 ? ${f(TYPICAL_PEOPLE.band)} : kind < 1.5 ? ${f(TYPICAL_PEOPLE.village)} : ${f(TYPICAL_PEOPLE.camp)};
  float people = isCity ? ${f(CITY_PEOPLE_PER_M2)} * 3.14159 * radius * radius : typical * pow(radius / base, 2.0);
  float homes = max(1.0, people / ${f(HOUSEHOLD)});
  // Household marks fill about 60% of the cells inside the footprint; never finer than 8 px (3 px for town roofs), so a
  // big village shows fewer houses than it has rather than a speckle: the sign of houses, at its real spread.
  vCellPx = max(isCity ? 3.0 : 8.0, corePx * sqrt(3.14159 * 0.6 / homes));
  // Far out a group is a flickering fire (like the firelight); from zoom ~7 the fire turns into the kind's sign;
  // once the footprint is bigger than the sign, its households show at their real spread.
  float households = smoothstep(${f(SIGN_PX)} * 0.9, ${f(SIGN_PX)} * 1.7, corePx);
  float far = morph.settle;
  vFire = isCity ? 0.0 : far * (1.0 - households);
  vSign = isCity ? 0.0 : (1.0 - far) * (1.0 - households);
  // Breathing only while it is a fire: a settled sign or a village's houses hold still.
  float breathe = 1.0 + vFire * 0.14 * sin(t * (0.9 + h) + h * 6.2832);
  float halo = max(morph.halo, 0.0);
  // A town glows out to well beyond its built-up area (at least a fire's size), so it still reads from afar.
  outerRadiusPixels = isCity
    ? max(corePx * 2.6, max(halo, 6.0) * 1.3)
    : max(corePx * 1.2, mix(max(halo, corePx * 1.6), halo * 1.15, vSign)) * breathe;
  outerRadiusPixels = max(outerRadiusPixels, corePx);
  vCore = corePx / outerRadiusPixels;
  vCorePx = corePx;
  vOuterPx = outerRadiusPixels;
  vKind = kind;
  vSeed = h;
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
  // Towns are the only marks with red < 0.5; both endpoints share a kind. The rest take the zoom dimming.
  vFillColor.a *= isCity ? 1.0 : morph.brightness;
  vFillColor.a *= layer.opacity;
  // Crowded cells far out: draw only the first few marks (stable across years: ranks follow the marks' ids) and brighten them.
  float cellPx = project_size_to_pixel(${f(CELL_M)}, scatterplot.radiusUnits);
  float keep = max(1.0, floor(cellPx * cellPx / ${f(CROWD_PX2)}));
  if (!isCity && instanceCrowd.x >= keep) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  float kept = min(instanceCrowd.y, keep) / max(instanceCrowd.y, 1.0);
  if (!isCity) vFillColor.a = min(1.0, vFillColor.a * mix(1.0, min(2.0, inversesqrt(kept)), vFire + vSign));
  DECKGL_FILTER_COLOR(vFillColor, geometry);
  vLineColor = vec4(0.0);
}
`;
export default unitMorphVertex;
