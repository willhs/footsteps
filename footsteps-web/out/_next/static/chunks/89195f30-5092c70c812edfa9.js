"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[824],{878:(e,t,i)=>{var o=Object.create,s=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,a=Object.getPrototypeOf,l=Object.prototype.hasOwnProperty,c=(e,t,i,o)=>{if(t&&"object"==typeof t||"function"==typeof t)for(let a of r(t))l.call(e,a)||a===i||s(e,a,{get:()=>t[a],enumerable:!(o=n(t,a))||o.enumerable});return e},d=(e,t,i)=>(i=null!=e?o(a(e)):{},c(!t&&e&&e.__esModule?i:s(i,"default",{value:e,enumerable:!0}),e)),u={};((e,t)=>{for(var i in t)s(e,i,{get:t[i],enumerable:!0})})(u,{ArcLayer:()=>_,BitmapLayer:()=>F,ColumnLayer:()=>eH,GeoJsonLayer:()=>iS,GridCellLayer:()=>eJ,IconLayer:()=>Q,LineLayer:()=>ec,PathLayer:()=>te,PointCloudLayer:()=>eP,PolygonLayer:()=>tF,ScatterplotLayer:()=>eE,SolidPolygonLayer:()=>tE,TextLayer:()=>ia,_MultiIconLayer:()=>tV,_TextBackgroundLayer:()=>ie}),e.exports=c(s({},"__esModule",{value:!0}),u);var g=i(7673),p=i(6463),f=`uniform arcUniforms {
  bool greatCircle;
  bool useShortestPath;
  float numSegments;
  float widthScale;
  float widthMinPixels;
  float widthMaxPixels;
  highp int widthUnits;
} arc;
`,h={name:"arc",vs:f,fs:f,uniformTypes:{greatCircle:"f32",useShortestPath:"f32",numSegments:"f32",widthScale:"f32",widthMinPixels:"f32",widthMaxPixels:"f32",widthUnits:"i32"}},v=`#version 300 es
#define SHADER_NAME arc-layer-vertex-shader
in vec4 instanceSourceColors;
in vec4 instanceTargetColors;
in vec3 instanceSourcePositions;
in vec3 instanceSourcePositions64Low;
in vec3 instanceTargetPositions;
in vec3 instanceTargetPositions64Low;
in vec3 instancePickingColors;
in float instanceWidths;
in float instanceHeights;
in float instanceTilts;
out vec4 vColor;
out vec2 uv;
out float isValid;
float paraboloid(float distance, float sourceZ, float targetZ, float ratio) {
float deltaZ = targetZ - sourceZ;
float dh = distance * instanceHeights;
if (dh == 0.0) {
return sourceZ + deltaZ * ratio;
}
float unitZ = deltaZ / dh;
float p2 = unitZ * unitZ + 1.0;
float dir = step(deltaZ, 0.0);
float z0 = mix(sourceZ, targetZ, dir);
float r = mix(ratio, 1.0 - ratio, dir);
return sqrt(r * (p2 - r)) * dh + z0;
}
vec2 getExtrusionOffset(vec2 line_clipspace, float offset_direction, float width) {
vec2 dir_screenspace = normalize(line_clipspace * project.viewportSize);
dir_screenspace = vec2(-dir_screenspace.y, dir_screenspace.x);
return dir_screenspace * offset_direction * width / 2.0;
}
float getSegmentRatio(float index) {
return smoothstep(0.0, 1.0, index / (arc.numSegments - 1.0));
}
vec3 interpolateFlat(vec3 source, vec3 target, float segmentRatio) {
float distance = length(source.xy - target.xy);
float z = paraboloid(distance, source.z, target.z, segmentRatio);
float tiltAngle = radians(instanceTilts);
vec2 tiltDirection = normalize(target.xy - source.xy);
vec2 tilt = vec2(-tiltDirection.y, tiltDirection.x) * z * sin(tiltAngle);
return vec3(
mix(source.xy, target.xy, segmentRatio) + tilt,
z * cos(tiltAngle)
);
}
float getAngularDist (vec2 source, vec2 target) {
vec2 sourceRadians = radians(source);
vec2 targetRadians = radians(target);
vec2 sin_half_delta = sin((sourceRadians - targetRadians) / 2.0);
vec2 shd_sq = sin_half_delta * sin_half_delta;
float a = shd_sq.y + cos(sourceRadians.y) * cos(targetRadians.y) * shd_sq.x;
return 2.0 * asin(sqrt(a));
}
vec3 interpolateGreatCircle(vec3 source, vec3 target, vec3 source3D, vec3 target3D, float angularDist, float t) {
vec2 lngLat;
if(abs(angularDist - PI) < 0.001) {
lngLat = (1.0 - t) * source.xy + t * target.xy;
} else {
float a = sin((1.0 - t) * angularDist);
float b = sin(t * angularDist);
vec3 p = source3D.yxz * a + target3D.yxz * b;
lngLat = degrees(vec2(atan(p.y, -p.x), atan(p.z, length(p.xy))));
}
float z = paraboloid(angularDist * EARTH_RADIUS, source.z, target.z, t);
return vec3(lngLat, z);
}
void main(void) {
geometry.worldPosition = instanceSourcePositions;
geometry.worldPositionAlt = instanceTargetPositions;
float segmentIndex = float(gl_VertexID / 2);
float segmentSide = mod(float(gl_VertexID), 2.) == 0. ? -1. : 1.;
float segmentRatio = getSegmentRatio(segmentIndex);
float prevSegmentRatio = getSegmentRatio(max(0.0, segmentIndex - 1.0));
float nextSegmentRatio = getSegmentRatio(min(arc.numSegments - 1.0, segmentIndex + 1.0));
float indexDir = mix(-1.0, 1.0, step(segmentIndex, 0.0));
isValid = 1.0;
uv = vec2(segmentRatio, segmentSide);
geometry.uv = uv;
geometry.pickingColor = instancePickingColors;
vec4 curr;
vec4 next;
vec3 source;
vec3 target;
if ((arc.greatCircle || project.projectionMode == PROJECTION_MODE_GLOBE) && project.coordinateSystem == COORDINATE_SYSTEM_LNGLAT) {
source = project_globe_(vec3(instanceSourcePositions.xy, 0.0));
target = project_globe_(vec3(instanceTargetPositions.xy, 0.0));
float angularDist = getAngularDist(instanceSourcePositions.xy, instanceTargetPositions.xy);
vec3 prevPos = interpolateGreatCircle(instanceSourcePositions, instanceTargetPositions, source, target, angularDist, prevSegmentRatio);
vec3 currPos = interpolateGreatCircle(instanceSourcePositions, instanceTargetPositions, source, target, angularDist, segmentRatio);
vec3 nextPos = interpolateGreatCircle(instanceSourcePositions, instanceTargetPositions, source, target, angularDist, nextSegmentRatio);
if (abs(currPos.x - prevPos.x) > 180.0) {
indexDir = -1.0;
isValid = 0.0;
} else if (abs(currPos.x - nextPos.x) > 180.0) {
indexDir = 1.0;
isValid = 0.0;
}
nextPos = indexDir < 0.0 ? prevPos : nextPos;
nextSegmentRatio = indexDir < 0.0 ? prevSegmentRatio : nextSegmentRatio;
if (isValid == 0.0) {
nextPos.x += nextPos.x > 0.0 ? -360.0 : 360.0;
float t = ((currPos.x > 0.0 ? 180.0 : -180.0) - currPos.x) / (nextPos.x - currPos.x);
currPos = mix(currPos, nextPos, t);
segmentRatio = mix(segmentRatio, nextSegmentRatio, t);
}
vec3 currPos64Low = mix(instanceSourcePositions64Low, instanceTargetPositions64Low, segmentRatio);
vec3 nextPos64Low = mix(instanceSourcePositions64Low, instanceTargetPositions64Low, nextSegmentRatio);
curr = project_position_to_clipspace(currPos, currPos64Low, vec3(0.0), geometry.position);
next = project_position_to_clipspace(nextPos, nextPos64Low, vec3(0.0));
} else {
vec3 source_world = instanceSourcePositions;
vec3 target_world = instanceTargetPositions;
if (arc.useShortestPath) {
source_world.x = mod(source_world.x + 180., 360.0) - 180.;
target_world.x = mod(target_world.x + 180., 360.0) - 180.;
float deltaLng = target_world.x - source_world.x;
if (deltaLng > 180.) target_world.x -= 360.;
if (deltaLng < -180.) source_world.x -= 360.;
}
source = project_position(source_world, instanceSourcePositions64Low);
target = project_position(target_world, instanceTargetPositions64Low);
float antiMeridianX = 0.0;
if (arc.useShortestPath) {
if (project.projectionMode == PROJECTION_MODE_WEB_MERCATOR_AUTO_OFFSET) {
antiMeridianX = -(project.coordinateOrigin.x + 180.) / 360. * TILE_SIZE;
}
float thresholdRatio = (antiMeridianX - source.x) / (target.x - source.x);
if (prevSegmentRatio <= thresholdRatio && nextSegmentRatio > thresholdRatio) {
isValid = 0.0;
indexDir = sign(segmentRatio - thresholdRatio);
segmentRatio = thresholdRatio;
}
}
nextSegmentRatio = indexDir < 0.0 ? prevSegmentRatio : nextSegmentRatio;
vec3 currPos = interpolateFlat(source, target, segmentRatio);
vec3 nextPos = interpolateFlat(source, target, nextSegmentRatio);
if (arc.useShortestPath) {
if (nextPos.x < antiMeridianX) {
currPos.x += TILE_SIZE;
nextPos.x += TILE_SIZE;
}
}
curr = project_common_position_to_clipspace(vec4(currPos, 1.0));
next = project_common_position_to_clipspace(vec4(nextPos, 1.0));
geometry.position = vec4(currPos, 1.0);
}
float widthPixels = clamp(
project_size_to_pixel(instanceWidths * arc.widthScale, arc.widthUnits),
arc.widthMinPixels, arc.widthMaxPixels
);
vec3 offset = vec3(
getExtrusionOffset((next.xy - curr.xy) * indexDir, segmentSide, widthPixels),
0.0);
DECKGL_FILTER_SIZE(offset, geometry);
DECKGL_FILTER_GL_POSITION(curr, geometry);
gl_Position = curr + vec4(project_pixel_size_to_clipspace(offset.xy), 0.0, 0.0);
vec4 color = mix(instanceSourceColors, instanceTargetColors, segmentRatio);
vColor = vec4(color.rgb, color.a * layer.opacity);
DECKGL_FILTER_COLOR(vColor, geometry);
}
`,m=`#version 300 es
#define SHADER_NAME arc-layer-fragment-shader
precision highp float;
in vec4 vColor;
in vec2 uv;
in float isValid;
out vec4 fragColor;
void main(void) {
if (isValid == 0.0) {
discard;
}
fragColor = vColor;
geometry.uv = uv;
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,y=[0,0,0,255],x={getSourcePosition:{type:"accessor",value:e=>e.sourcePosition},getTargetPosition:{type:"accessor",value:e=>e.targetPosition},getSourceColor:{type:"accessor",value:y},getTargetColor:{type:"accessor",value:y},getWidth:{type:"accessor",value:1},getHeight:{type:"accessor",value:1},getTilt:{type:"accessor",value:0},greatCircle:!1,numSegments:{type:"number",value:50,min:1},widthUnits:"pixels",widthScale:{type:"number",value:1,min:0},widthMinPixels:{type:"number",value:0,min:0},widthMaxPixels:{type:"number",value:Number.MAX_SAFE_INTEGER,min:0}},P=class extends g.Layer{getBounds(){var e;return null==(e=this.getAttributeManager())?void 0:e.getBounds(["instanceSourcePositions","instanceTargetPositions"])}getShaders(){return super.getShaders({vs:v,fs:m,modules:[g.project32,g.picking,h]})}get wrapLongitude(){return!1}initializeState(){this.getAttributeManager().addInstanced({instanceSourcePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getSourcePosition"},instanceTargetPositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getTargetPosition"},instanceSourceColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getSourceColor",defaultValue:y},instanceTargetColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getTargetColor",defaultValue:y},instanceWidths:{size:1,transition:!0,accessor:"getWidth",defaultValue:1},instanceHeights:{size:1,transition:!0,accessor:"getHeight",defaultValue:1},instanceTilts:{size:1,transition:!0,accessor:"getTilt",defaultValue:0}})}updateState(e){var t;super.updateState(e),e.changeFlags.extensionsChanged&&(null==(t=this.state.model)||t.destroy(),this.state.model=this._getModel(),this.getAttributeManager().invalidateAll())}draw({uniforms:e}){let{widthUnits:t,widthScale:i,widthMinPixels:o,widthMaxPixels:s,greatCircle:n,wrapLongitude:r,numSegments:a}=this.props,l={numSegments:a,widthUnits:g.UNIT[t],widthScale:i,widthMinPixels:o,widthMaxPixels:s,greatCircle:n,useShortestPath:r},c=this.state.model;c.shaderInputs.setProps({arc:l}),c.setVertexCount(2*a),c.draw(this.context.renderPass)}_getModel(){return new p.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),topology:"triangle-strip",isInstanced:!0})}};P.layerName="ArcLayer",P.defaultProps=x;var _=P,C=i(7673),S=i(6463),L=i(261),b=i(5595),w=new Uint32Array([0,2,1,0,3,2]),I=new Float32Array([0,1,0,0,1,0,1,1]),T=`uniform bitmapUniforms {
  vec4 bounds;
  float coordinateConversion;
  float desaturate;
  vec3 tintColor;
  vec4 transparentColor;
} bitmap;
`,M={name:"bitmap",vs:T,fs:T,uniformTypes:{bounds:"vec4<f32>",coordinateConversion:"f32",desaturate:"f32",tintColor:"vec3<f32>",transparentColor:"vec4<f32>"}},E=`#version 300 es
#define SHADER_NAME bitmap-layer-vertex-shader

in vec2 texCoords;
in vec3 positions;
in vec3 positions64Low;

out vec2 vTexCoord;
out vec2 vTexPos;

const vec3 pickingColor = vec3(1.0, 0.0, 0.0);

void main(void) {
  geometry.worldPosition = positions;
  geometry.uv = texCoords;
  geometry.pickingColor = pickingColor;

  gl_Position = project_position_to_clipspace(positions, positions64Low, vec3(0.0), geometry.position);
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  vTexCoord = texCoords;

  if (bitmap.coordinateConversion < -0.5) {
    vTexPos = geometry.position.xy + project.commonOrigin.xy;
  } else if (bitmap.coordinateConversion > 0.5) {
    vTexPos = geometry.worldPosition.xy;
  }

  vec4 color = vec4(0.0);
  DECKGL_FILTER_COLOR(color, geometry);
}
`,A=`
vec3 packUVsIntoRGB(vec2 uv) {
  // Extract the top 8 bits. We want values to be truncated down so we can add a fraction
  vec2 uv8bit = floor(uv * 256.);

  // Calculate the normalized remainders of u and v parts that do not fit into 8 bits
  // Scale and clamp to 0-1 range
  vec2 uvFraction = fract(uv * 256.);
  vec2 uvFraction4bit = floor(uvFraction * 16.);

  // Remainder can be encoded in blue channel, encode as 4 bits for pixel coordinates
  float fractions = uvFraction4bit.x + uvFraction4bit.y * 16.;

  return vec3(uv8bit, fractions) / 255.;
}
`,z=`#version 300 es
#define SHADER_NAME bitmap-layer-fragment-shader

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D bitmapTexture;

in vec2 vTexCoord;
in vec2 vTexPos;

out vec4 fragColor;

/* projection utils */
const float TILE_SIZE = 512.0;
const float PI = 3.1415926536;
const float WORLD_SCALE = TILE_SIZE / PI / 2.0;

// from degrees to Web Mercator
vec2 lnglat_to_mercator(vec2 lnglat) {
  float x = lnglat.x;
  float y = clamp(lnglat.y, -89.9, 89.9);
  return vec2(
    radians(x) + PI,
    PI + log(tan(PI * 0.25 + radians(y) * 0.5))
  ) * WORLD_SCALE;
}

// from Web Mercator to degrees
vec2 mercator_to_lnglat(vec2 xy) {
  xy /= WORLD_SCALE;
  return degrees(vec2(
    xy.x - PI,
    atan(exp(xy.y - PI)) * 2.0 - PI * 0.5
  ));
}
/* End projection utils */

// apply desaturation
vec3 color_desaturate(vec3 color) {
  float luminance = (color.r + color.g + color.b) * 0.333333333;
  return mix(color, vec3(luminance), bitmap.desaturate);
}

// apply tint
vec3 color_tint(vec3 color) {
  return color * bitmap.tintColor;
}

// blend with background color
vec4 apply_opacity(vec3 color, float alpha) {
  if (bitmap.transparentColor.a == 0.0) {
    return vec4(color, alpha);
  }
  float blendedAlpha = alpha + bitmap.transparentColor.a * (1.0 - alpha);
  float highLightRatio = alpha / blendedAlpha;
  vec3 blendedRGB = mix(bitmap.transparentColor.rgb, color, highLightRatio);
  return vec4(blendedRGB, blendedAlpha);
}

vec2 getUV(vec2 pos) {
  return vec2(
    (pos.x - bitmap.bounds[0]) / (bitmap.bounds[2] - bitmap.bounds[0]),
    (pos.y - bitmap.bounds[3]) / (bitmap.bounds[1] - bitmap.bounds[3])
  );
}

${A}

void main(void) {
  vec2 uv = vTexCoord;
  if (bitmap.coordinateConversion < -0.5) {
    vec2 lnglat = mercator_to_lnglat(vTexPos);
    uv = getUV(lnglat);
  } else if (bitmap.coordinateConversion > 0.5) {
    vec2 commonPos = lnglat_to_mercator(vTexPos);
    uv = getUV(commonPos);
  }
  vec4 bitmapColor = texture(bitmapTexture, uv);

  fragColor = apply_opacity(color_tint(color_desaturate(bitmapColor.rgb)), bitmapColor.a * layer.opacity);

  geometry.uv = uv;
  DECKGL_FILTER_COLOR(fragColor, geometry);

  if (bool(picking.isActive) && !bool(picking.isAttribute)) {
    // Since instance information is not used, we can use picking color for pixel index
    fragColor.rgb = packUVsIntoRGB(uv);
  }
}
`,R={image:{type:"image",value:null,async:!0},bounds:{type:"array",value:[1,0,0,1],compare:!0},_imageCoordinateSystem:C.COORDINATE_SYSTEM.DEFAULT,desaturate:{type:"number",min:0,max:1,value:0},transparentColor:{type:"color",value:[0,0,0,0]},tintColor:{type:"color",value:[255,255,255]},textureParameters:{type:"object",ignore:!0,value:null}},O=class extends C.Layer{getShaders(){return super.getShaders({vs:E,fs:z,modules:[C.project32,C.picking,M]})}initializeState(){let e=this.getAttributeManager();e.remove(["instancePickingColors"]),e.add({indices:{size:1,isIndexed:!0,update:e=>e.value=this.state.mesh.indices,noAlloc:!0},positions:{size:3,type:"float64",fp64:this.use64bitPositions(),update:e=>e.value=this.state.mesh.positions,noAlloc:!0},texCoords:{size:2,update:e=>e.value=this.state.mesh.texCoords,noAlloc:!0}})}updateState({props:e,oldProps:t,changeFlags:i}){var o;let s=this.getAttributeManager();if(i.extensionsChanged&&(null==(o=this.state.model)||o.destroy(),this.state.model=this._getModel(),s.invalidateAll()),e.bounds!==t.bounds){let e=this.state.mesh,t=this._createMesh();for(let i in this.state.model.setVertexCount(t.vertexCount),t)e&&e[i]!==t[i]&&s.invalidate(i);this.setState({mesh:t,...this._getCoordinateUniforms()})}else e._imageCoordinateSystem!==t._imageCoordinateSystem&&this.setState(this._getCoordinateUniforms())}getPickingInfo(e){let{image:t}=this.props,i=e.info;if(!i.color||!t)return i.bitmap=null,i;let{width:o,height:s}=t;i.index=0;let n=function(e){let[t,i,o]=e;return[(t+(15&o)/16)/256,(i+(240&o)/256)/256]}(i.color);return i.bitmap={size:{width:o,height:s},uv:n,pixel:[Math.floor(n[0]*o),Math.floor(n[1]*s)]},i}disablePickingIndex(){this.setState({disablePicking:!0})}restorePickingColors(){this.setState({disablePicking:!1})}_updateAutoHighlight(e){super._updateAutoHighlight({...e,color:this.encodePickingColor(0)})}_createMesh(){let{bounds:e}=this.props,t=e;return k(e)&&(t=[[e[0],e[1]],[e[0],e[3]],[e[2],e[3]],[e[2],e[1]]]),function(e,t){if(!t){var i,o,s,n=e;let t=new Float64Array(12);for(let e=0;e<n.length;e++)t[3*e+0]=n[e][0],t[3*e+1]=n[e][1],t[3*e+2]=n[e][2]||0;return{vertexCount:6,positions:t,indices:w,texCoords:I}}let r=Math.max(Math.abs(e[0][0]-e[3][0]),Math.abs(e[1][0]-e[2][0])),a=Math.max(Math.abs(e[1][1]-e[0][1]),Math.abs(e[2][1]-e[3][1])),l=Math.ceil(r/t)+1,c=Math.ceil(a/t)+1,d=(l-1)*(c-1)*6,u=new Uint32Array(d),g=new Float32Array(l*c*2),p=new Float64Array(l*c*3),f=0,h=0;for(let t=0;t<l;t++){let n=t/(l-1);for(let r=0;r<c;r++){let a=r/(c-1),l=(i=e,o=n,s=a,(0,b.lerp)((0,b.lerp)(i[0],i[1],s),(0,b.lerp)(i[3],i[2],s),o));p[3*f+0]=l[0],p[3*f+1]=l[1],p[3*f+2]=l[2]||0,g[2*f+0]=n,g[2*f+1]=1-a,t>0&&r>0&&(u[h++]=f-c,u[h++]=f-c-1,u[h++]=f-1,u[h++]=f-c,u[h++]=f-1,u[h++]=f),f++}}return{vertexCount:d,positions:p,indices:u,texCoords:g}}(t,this.context.viewport.resolution)}_getModel(){return new S.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),topology:"triangle-list",isInstanced:!1})}draw(e){let{shaderModuleProps:t}=e,{model:i,coordinateConversion:o,bounds:s,disablePicking:n}=this.state,{image:r,desaturate:a,transparentColor:l,tintColor:c}=this.props;if((!t.picking.isActive||!n)&&r&&i){let e={bitmapTexture:r,bounds:s,coordinateConversion:o,desaturate:a,tintColor:c.slice(0,3).map(e=>e/255),transparentColor:l.map(e=>e/255)};i.shaderInputs.setProps({bitmap:e}),i.draw(this.context.renderPass)}}_getCoordinateUniforms(){let{LNGLAT:e,CARTESIAN:t,DEFAULT:i}=C.COORDINATE_SYSTEM,{_imageCoordinateSystem:o}=this.props;if(o!==i){let{bounds:i}=this.props;if(!k(i))throw Error("_imageCoordinateSystem only supports rectangular bounds");let s=this.context.viewport.resolution?e:t;if((o=o===e?e:t)===e&&s===t)return{coordinateConversion:-1,bounds:i};if(o===t&&s===e){let e=(0,L.lngLatToWorld)([i[0],i[1]]),t=(0,L.lngLatToWorld)([i[2],i[3]]);return{coordinateConversion:1,bounds:[e[0],e[1],t[0],t[1]]}}}return{coordinateConversion:0,bounds:[0,0,0,0]}}};O.layerName="BitmapLayer",O.defaultProps=R;var F=O;function k(e){return Number.isFinite(e[0])}var D=i(7673),W=i(6463),G=`uniform iconUniforms {
  float sizeScale;
  vec2 iconsTextureDim;
  float sizeMinPixels;
  float sizeMaxPixels;
  bool billboard;
  highp int sizeUnits;
  float alphaCutoff;
} icon;
`,N={name:"icon",vs:G,fs:G,uniformTypes:{sizeScale:"f32",iconsTextureDim:"vec2<f32>",sizeMinPixels:"f32",sizeMaxPixels:"f32",billboard:"f32",sizeUnits:"i32",alphaCutoff:"f32"}},U=`#version 300 es
#define SHADER_NAME icon-layer-vertex-shader
in vec2 positions;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceSizes;
in float instanceAngles;
in vec4 instanceColors;
in vec3 instancePickingColors;
in vec4 instanceIconFrames;
in float instanceColorModes;
in vec2 instanceOffsets;
in vec2 instancePixelOffset;
out float vColorMode;
out vec4 vColor;
out vec2 vTextureCoords;
out vec2 uv;
vec2 rotate_by_angle(vec2 vertex, float angle) {
float angle_radian = angle * PI / 180.0;
float cos_angle = cos(angle_radian);
float sin_angle = sin(angle_radian);
mat2 rotationMatrix = mat2(cos_angle, -sin_angle, sin_angle, cos_angle);
return rotationMatrix * vertex;
}
void main(void) {
geometry.worldPosition = instancePositions;
geometry.uv = positions;
geometry.pickingColor = instancePickingColors;
uv = positions;
vec2 iconSize = instanceIconFrames.zw;
float sizePixels = clamp(
project_size_to_pixel(instanceSizes * icon.sizeScale, icon.sizeUnits),
icon.sizeMinPixels, icon.sizeMaxPixels
);
float instanceScale = iconSize.y == 0.0 ? 0.0 : sizePixels / iconSize.y;
vec2 pixelOffset = positions / 2.0 * iconSize + instanceOffsets;
pixelOffset = rotate_by_angle(pixelOffset, instanceAngles) * instanceScale;
pixelOffset += instancePixelOffset;
pixelOffset.y *= -1.0;
if (icon.billboard)  {
gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
vec3 offset = vec3(pixelOffset, 0.0);
DECKGL_FILTER_SIZE(offset, geometry);
gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
} else {
vec3 offset_common = vec3(project_pixel_size(pixelOffset), 0.0);
DECKGL_FILTER_SIZE(offset_common, geometry);
gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset_common, geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
}
vTextureCoords = mix(
instanceIconFrames.xy,
instanceIconFrames.xy + iconSize,
(positions.xy + 1.0) / 2.0
) / icon.iconsTextureDim;
vColor = instanceColors;
DECKGL_FILTER_COLOR(vColor, geometry);
vColorMode = instanceColorModes;
}
`,B=`#version 300 es
#define SHADER_NAME icon-layer-fragment-shader
precision highp float;
uniform sampler2D iconsTexture;
in float vColorMode;
in vec4 vColor;
in vec2 vTextureCoords;
in vec2 uv;
out vec4 fragColor;
void main(void) {
geometry.uv = uv;
vec4 texColor = texture(iconsTexture, vTextureCoords);
vec3 color = mix(texColor.rgb, vColor.rgb, vColorMode);
float a = texColor.a * layer.opacity * vColor.a;
if (a < icon.alphaCutoff) {
discard;
}
fragColor = vec4(color, a);
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,j=i(2489),V=i(7673),H=()=>{},K={minFilter:"linear",mipmapFilter:"linear",magFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Z={x:0,y:0,width:0,height:0};function $(e){return e&&(e.id||e.url)}function J(e,t,i){for(let o=0;o<t.length;o++){let{icon:s,xOffset:n}=t[o];e[$(s)]={...s,x:n,y:i}}}var X=class{constructor(e,{onUpdate:t=H,onError:i=H}){this._loadOptions=null,this._texture=null,this._externalTexture=null,this._mapping={},this._samplerParameters=null,this._pendingCount=0,this._autoPacking=!1,this._xOffset=0,this._yOffset=0,this._rowHeight=0,this._buffer=4,this._canvasWidth=1024,this._canvasHeight=0,this._canvas=null,this.device=e,this.onUpdate=t,this.onError=i}finalize(){var e;null==(e=this._texture)||e.delete()}getTexture(){return this._texture||this._externalTexture}getIconMapping(e){let t=this._autoPacking?$(e):e;return this._mapping[t]||Z}setProps({loadOptions:e,autoPacking:t,iconAtlas:i,iconMapping:o,textureParameters:s}){var n;e&&(this._loadOptions=e),void 0!==t&&(this._autoPacking=t),o&&(this._mapping=o),i&&(null==(n=this._texture)||n.delete(),this._texture=null,this._externalTexture=i),s&&(this._samplerParameters=s)}get isLoaded(){return 0===this._pendingCount}packIcons(e,t){if(!this._autoPacking||"undefined"==typeof document)return;let i=Object.values(function(e,t,i){if(!e||!t)return null;i=i||{};let o={},{iterable:s,objectInfo:n}=(0,V.createIterable)(e);for(let e of s){n.index++;let s=t(e,n),r=$(s);if(!s)throw Error("Icon is missing.");if(!s.url)throw Error("Icon url is missing.");o[r]||i[r]&&s.url===i[r].url||(o[r]={...s,source:e,sourceIndex:n.index})}return o}(e,t,this._mapping)||{});if(i.length>0){let{mapping:e,xOffset:t,yOffset:o,rowHeight:s,canvasHeight:n}=function({icons:e,buffer:t,mapping:i={},xOffset:o=0,yOffset:s=0,rowHeight:n=0,canvasWidth:r}){let a=[];for(let l=0;l<e.length;l++){let c=e[l];if(!i[$(c)]){let{height:e,width:l}=c;o+l+t>r&&(J(i,a,s),o=0,s=n+s+t,n=0,a=[]),a.push({icon:c,xOffset:o}),o=o+l+t,n=Math.max(n,e)}}return a.length>0&&J(i,a,s),{mapping:i,rowHeight:n,xOffset:o,yOffset:s,canvasWidth:r,canvasHeight:Math.pow(2,Math.ceil(Math.log2(n+s+t)))}}({icons:i,buffer:this._buffer,canvasWidth:this._canvasWidth,mapping:this._mapping,rowHeight:this._rowHeight,xOffset:this._xOffset,yOffset:this._yOffset});this._rowHeight=s,this._mapping=e,this._xOffset=t,this._yOffset=o,this._canvasHeight=n,this._texture||(this._texture=this.device.createTexture({format:"rgba8unorm",width:this._canvasWidth,height:this._canvasHeight,sampler:this._samplerParameters||K,mipmaps:!0})),this._texture.height!==this._canvasHeight&&(this._texture=function(e,t,i,o){let{width:s,height:n,device:r}=e,a=r.createTexture({format:"rgba8unorm",width:t,height:i,sampler:o,mipmaps:!0}),l=r.createCommandEncoder();return l.copyTextureToTexture({sourceTexture:e,destinationTexture:a,width:s,height:n}),l.finish(),e.destroy(),a}(this._texture,this._canvasWidth,this._canvasHeight,this._samplerParameters||K)),this.onUpdate(),this._canvas=this._canvas||document.createElement("canvas"),this._loadIcons(i)}}_loadIcons(e){let t=this._canvas.getContext("2d",{willReadFrequently:!0});for(let i of e)this._pendingCount++,(0,j.load)(i.url,this._loadOptions).then(e=>{var o;let s=$(i),n=this._mapping[s],{x:r,y:a,width:l,height:c}=n,{image:d,width:u,height:g}=function(e,t,i,o){let s=Math.min(i/t.width,o/t.height),n=Math.floor(t.width*s),r=Math.floor(t.height*s);return 1===s?{image:t,width:n,height:r}:(e.canvas.height=r,e.canvas.width=n,e.clearRect(0,0,n,r),e.drawImage(t,0,0,t.width,t.height,0,0,n,r),{image:e.canvas,width:n,height:r})}(t,e,l,c);null==(o=this._texture)||o.copyExternalImage({image:d,x:r+(l-u)/2,y:a+(c-g)/2,width:u,height:g}),n.width=u,n.height=g,this._texture.generateMipmap(),this.onUpdate()}).catch(e=>{this.onError({url:i.url,source:i.source,sourceIndex:i.sourceIndex,loadOptions:this._loadOptions,error:e})}).finally(()=>{this._pendingCount--})}},q=[0,0,0,255],Y=class extends D.Layer{getShaders(){return super.getShaders({vs:U,fs:B,modules:[D.project32,D.picking,N]})}initializeState(){this.state={iconManager:new X(this.context.device,{onUpdate:this._onUpdate.bind(this),onError:this._onError.bind(this)})},this.getAttributeManager().addInstanced({instancePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceSizes:{size:1,transition:!0,accessor:"getSize",defaultValue:1},instanceOffsets:{size:2,accessor:"getIcon",transform:this.getInstanceOffset},instanceIconFrames:{size:4,accessor:"getIcon",transform:this.getInstanceIconFrame},instanceColorModes:{size:1,type:"uint8",accessor:"getIcon",transform:this.getInstanceColorMode},instanceColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getColor",defaultValue:q},instanceAngles:{size:1,transition:!0,accessor:"getAngle"},instancePixelOffset:{size:2,transition:!0,accessor:"getPixelOffset"}})}updateState(e){var t;super.updateState(e);let{props:i,oldProps:o,changeFlags:s}=e,n=this.getAttributeManager(),{iconAtlas:r,iconMapping:a,data:l,getIcon:c,textureParameters:d}=i,{iconManager:u}=this.state;if("string"==typeof r)return;let g=r||this.internalState.isAsyncPropLoading("iconAtlas");u.setProps({loadOptions:i.loadOptions,autoPacking:!g,iconAtlas:r,iconMapping:g?a:null,textureParameters:d}),g?o.iconMapping!==i.iconMapping&&n.invalidate("getIcon"):(s.dataChanged||s.updateTriggersChanged&&(s.updateTriggersChanged.all||s.updateTriggersChanged.getIcon))&&u.packIcons(l,c),s.extensionsChanged&&(null==(t=this.state.model)||t.destroy(),this.state.model=this._getModel(),n.invalidateAll())}get isLoaded(){return super.isLoaded&&this.state.iconManager.isLoaded}finalizeState(e){super.finalizeState(e),this.state.iconManager.finalize()}draw({uniforms:e}){let{sizeScale:t,sizeMinPixels:i,sizeMaxPixels:o,sizeUnits:s,billboard:n,alphaCutoff:r}=this.props,{iconManager:a}=this.state,l=a.getTexture();if(l){let e=this.state.model,a={iconsTexture:l,iconsTextureDim:[l.width,l.height],sizeUnits:D.UNIT[s],sizeScale:t,sizeMinPixels:i,sizeMaxPixels:o,billboard:n,alphaCutoff:r};e.shaderInputs.setProps({icon:a}),e.draw(this.context.renderPass)}}_getModel(){return new W.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new W.Geometry({topology:"triangle-strip",attributes:{positions:{size:2,value:new Float32Array([-1,-1,1,-1,-1,1,1,1])}}}),isInstanced:!0})}_onUpdate(){this.setNeedsRedraw()}_onError(e){var t;let i=null==(t=this.getCurrentLayer())?void 0:t.props.onIconError;i?i(e):D.log.error(e.error.message)()}getInstanceOffset(e){let{width:t,height:i,anchorX:o=t/2,anchorY:s=i/2}=this.state.iconManager.getIconMapping(e);return[t/2-o,i/2-s]}getInstanceColorMode(e){return+!!this.state.iconManager.getIconMapping(e).mask}getInstanceIconFrame(e){let{x:t,y:i,width:o,height:s}=this.state.iconManager.getIconMapping(e);return[t,i,o,s]}};Y.defaultProps={iconAtlas:{type:"image",value:null,async:!0},iconMapping:{type:"object",value:{},async:!0},sizeScale:{type:"number",value:1,min:0},billboard:!0,sizeUnits:"pixels",sizeMinPixels:{type:"number",min:0,value:0},sizeMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},alphaCutoff:{type:"number",value:.05,min:0,max:1},getPosition:{type:"accessor",value:e=>e.position},getIcon:{type:"accessor",value:e=>e.icon},getColor:{type:"accessor",value:q},getSize:{type:"accessor",value:1},getAngle:{type:"accessor",value:0},getPixelOffset:{type:"accessor",value:[0,0]},onIconError:{type:"function",value:null,optional:!0},textureParameters:{type:"object",ignore:!0,value:null}},Y.layerName="IconLayer";var Q=Y,ee=i(7673),et=i(6463),ei=`uniform lineUniforms {
  float widthScale;
  float widthMinPixels;
  float widthMaxPixels;
  float useShortestPath;
  highp int widthUnits;
} line;
`,eo={name:"line",source:`struct LineUniforms {
  widthScale: f32,
  widthMinPixels: f32,
  widthMaxPixels: f32,
  useShortestPath: f32,
  widthUnits: i32,
};

@group(0) @binding(1)
var<uniform> line: LineUniforms;
`,vs:ei,fs:ei,uniformTypes:{widthScale:"f32",widthMinPixels:"f32",widthMaxPixels:"f32",useShortestPath:"f32",widthUnits:"i32"}},es=`// TODO(ibgreen): Hack for Layer uniforms (move to new "color" module?)
struct LayerUniforms {
  opacity: f32,
};
var<private> layer: LayerUniforms = LayerUniforms(1.0);
// @group(0) @binding(1) var<uniform> layer: LayerUniforms;

// ---------- Helper Structures & Functions ----------

// Placeholder filter functions.
fn deckgl_filter_size(offset: vec3<f32>, geometry: Geometry) -> vec3<f32> {
  return offset;
}
fn deckgl_filter_gl_position(p: vec4<f32>, geometry: Geometry) -> vec4<f32> {
  return p;
}
fn deckgl_filter_color(color: vec4<f32>, geometry: Geometry) -> vec4<f32> {
  return color;
}

// Compute an extrusion offset given a line direction (in clipspace),
// an offset direction (-1 or 1), and a width in pixels.
// Assumes a uniform "project" with a viewportSize field is available.
fn getExtrusionOffset(line_clipspace: vec2<f32>, offset_direction: f32, width: f32) -> vec2<f32> {
  // project.viewportSize should be provided as a uniform (not shown here)
  let dir_screenspace = normalize(line_clipspace * project.viewportSize);
  // Rotate by 90\xb0: (x,y) becomes (-y,x)
  let rotated = vec2<f32>(-dir_screenspace.y, dir_screenspace.x);
  return rotated * offset_direction * width / 2.0;
}

// Splits the line between two points at a given x coordinate.
// Interpolates the y and z components.
fn splitLine(a: vec3<f32>, b: vec3<f32>, x: f32) -> vec3<f32> {
  let t: f32 = (x - a.x) / (b.x - a.x);
  return vec3<f32>(x, a.yz + t * (b.yz - a.yz));
}

// ---------- Uniforms & Global Structures ----------

// Uniforms for line, layer, and project are assumed to be defined elsewhere.
// For example:
//
// @group(0) @binding(0)
// var<uniform> line: LineUniform;
//
// struct LayerUniform {
//   opacity: f32,
// };
// @group(0) @binding(1)
// var<uniform> layer: LayerUniform;
//
// struct ProjectUniform {
//   viewportSize: vec2<f32>,
// };
// @group(0) @binding(2)
// var<uniform> project: ProjectUniform;



// ---------- Vertex Output Structure ----------

struct Varyings {
  @builtin(position) gl_Position: vec4<f32>,
  @location(0) vColor: vec4<f32>,
  @location(1) uv: vec2<f32>,
};

// ---------- Vertex Shader Entry Point ----------

@vertex
fn vertexMain(
  @location(0) positions: vec3<f32>,
  @location(1) instanceSourcePositions: vec3<f32>,
  @location(2) instanceTargetPositions: vec3<f32>,
  @location(3) instanceSourcePositions64Low: vec3<f32>,
  @location(4) instanceTargetPositions64Low: vec3<f32>,
  @location(5) instanceColors: vec4<f32>,
  @location(6) instancePickingColors: vec3<f32>,
  @location(7) instanceWidths: f32
) -> Varyings {
  var geometry: Geometry;
  geometry.worldPosition = instanceSourcePositions;
  geometry.worldPositionAlt = instanceTargetPositions;

  var source_world: vec3<f32> = instanceSourcePositions;
  var target_world: vec3<f32> = instanceTargetPositions;
  var source_world_64low: vec3<f32> = instanceSourcePositions64Low;
  var target_world_64low: vec3<f32> = instanceTargetPositions64Low;

  // Apply shortest-path adjustments if needed.
  if (line.useShortestPath > 0.5 || line.useShortestPath < -0.5) {
    source_world.x = (source_world.x + 180.0 % 360.0) - 180.0;
    target_world.x = (target_world.x + 180.0 % 360.0) - 180.0;
    let deltaLng: f32 = target_world.x - source_world.x;

    if (deltaLng * line.useShortestPath > 180.0) {
      source_world.x = source_world.x + 360.0 * line.useShortestPath;
      source_world = splitLine(source_world, target_world, 180.0 * line.useShortestPath);
      source_world_64low = vec3<f32>(0.0, 0.0, 0.0);
    } else if (deltaLng * line.useShortestPath < -180.0) {
      target_world.x = target_world.x + 360.0 * line.useShortestPath;
      target_world = splitLine(source_world, target_world, 180.0 * line.useShortestPath);
      target_world_64low = vec3<f32>(0.0, 0.0, 0.0);
    } else if (line.useShortestPath < 0.0) {
      var abortOut: Varyings;
      abortOut.gl_Position = vec4<f32>(0.0);
      abortOut.vColor = vec4<f32>(0.0);
      abortOut.uv = vec2<f32>(0.0);
      return abortOut;
    }
  }

  // Project Pos and target positions to clip space.
  let sourceResult = project_position_to_clipspace_and_commonspace(source_world, source_world_64low, vec3<f32>(0.0));
  let targetResult = project_position_to_clipspace_and_commonspace(target_world, target_world_64low, vec3<f32>(0.0));
  let sourcePos: vec4<f32> = sourceResult.clipPosition;
  let targetPos: vec4<f32> = targetResult.clipPosition;
  let source_commonspace: vec4<f32> = sourceResult.commonPosition;
  let target_commonspace: vec4<f32> = targetResult.commonPosition;

  // Interpolate along the line segment.
  let segmentIndex: f32 = positions.x;
  let p: vec4<f32> = sourcePos + segmentIndex * (targetPos - sourcePos);
  geometry.position = source_commonspace + segmentIndex * (target_commonspace - source_commonspace);
  let uv: vec2<f32> = positions.xy;
  geometry.uv = uv;
  geometry.pickingColor = instancePickingColors;

  // Determine width in pixels.
  let widthPixels: f32 = clamp(
    project_unit_size_to_pixel(instanceWidths * line.widthScale, line.widthUnits),
    line.widthMinPixels, line.widthMaxPixels
  );

  // Compute extrusion offset.
  let extrusion: vec2<f32> = getExtrusionOffset(targetPos.xy - sourcePos.xy, positions.y, widthPixels);
  let offset: vec3<f32> = vec3<f32>(extrusion, 0.0);

  // Apply deck.gl filter functions.
  let filteredOffset = deckgl_filter_size(offset, geometry);
  let filteredP = deckgl_filter_gl_position(p, geometry);

  let clipOffset: vec2<f32> = project_pixel_size_to_clipspace(filteredOffset.xy);
  let finalPosition: vec4<f32> = filteredP + vec4<f32>(clipOffset, 0.0, 0.0);

  // Compute color.
  var vColor: vec4<f32> = vec4<f32>(instanceColors.rgb, instanceColors.a * layer.opacity);
  // vColor = deckgl_filter_color(vColor, geometry);

  var output: Varyings;
  output.gl_Position = finalPosition;
  output.vColor = vColor;
  output.uv = uv;
  return output;
}

@fragment
fn fragmentMain(
  @location(0) vColor: vec4<f32>,
  @location(1) uv: vec2<f32>
) -> @location(0) vec4<f32> {
  // Create and initialize geometry with the provided uv.
  var geometry: Geometry;
  geometry.uv = uv;

  // Start with the input color.
  var fragColor: vec4<f32> = vColor;

  // Apply the deck.gl filter to the color.
  fragColor = deckgl_filter_color(fragColor, geometry);

  return fragColor;
}
`,en=`#version 300 es
#define SHADER_NAME line-layer-vertex-shader
in vec3 positions;
in vec3 instanceSourcePositions;
in vec3 instanceTargetPositions;
in vec3 instanceSourcePositions64Low;
in vec3 instanceTargetPositions64Low;
in vec4 instanceColors;
in vec3 instancePickingColors;
in float instanceWidths;
out vec4 vColor;
out vec2 uv;
vec2 getExtrusionOffset(vec2 line_clipspace, float offset_direction, float width) {
vec2 dir_screenspace = normalize(line_clipspace * project.viewportSize);
dir_screenspace = vec2(-dir_screenspace.y, dir_screenspace.x);
return dir_screenspace * offset_direction * width / 2.0;
}
vec3 splitLine(vec3 a, vec3 b, float x) {
float t = (x - a.x) / (b.x - a.x);
return vec3(x, mix(a.yz, b.yz, t));
}
void main(void) {
geometry.worldPosition = instanceSourcePositions;
geometry.worldPositionAlt = instanceTargetPositions;
vec3 source_world = instanceSourcePositions;
vec3 target_world = instanceTargetPositions;
vec3 source_world_64low = instanceSourcePositions64Low;
vec3 target_world_64low = instanceTargetPositions64Low;
if (line.useShortestPath > 0.5 || line.useShortestPath < -0.5) {
source_world.x = mod(source_world.x + 180., 360.0) - 180.;
target_world.x = mod(target_world.x + 180., 360.0) - 180.;
float deltaLng = target_world.x - source_world.x;
if (deltaLng * line.useShortestPath > 180.) {
source_world.x += 360. * line.useShortestPath;
source_world = splitLine(source_world, target_world, 180. * line.useShortestPath);
source_world_64low = vec3(0.0);
} else if (deltaLng * line.useShortestPath < -180.) {
target_world.x += 360. * line.useShortestPath;
target_world = splitLine(source_world, target_world, 180. * line.useShortestPath);
target_world_64low = vec3(0.0);
} else if (line.useShortestPath < 0.) {
gl_Position = vec4(0.);
return;
}
}
vec4 source_commonspace;
vec4 target_commonspace;
vec4 source = project_position_to_clipspace(source_world, source_world_64low, vec3(0.), source_commonspace);
vec4 target = project_position_to_clipspace(target_world, target_world_64low, vec3(0.), target_commonspace);
float segmentIndex = positions.x;
vec4 p = mix(source, target, segmentIndex);
geometry.position = mix(source_commonspace, target_commonspace, segmentIndex);
uv = positions.xy;
geometry.uv = uv;
geometry.pickingColor = instancePickingColors;
float widthPixels = clamp(
project_size_to_pixel(instanceWidths * line.widthScale, line.widthUnits),
line.widthMinPixels, line.widthMaxPixels
);
vec3 offset = vec3(
getExtrusionOffset(target.xy - source.xy, positions.y, widthPixels),
0.0);
DECKGL_FILTER_SIZE(offset, geometry);
DECKGL_FILTER_GL_POSITION(p, geometry);
gl_Position = p + vec4(project_pixel_size_to_clipspace(offset.xy), 0.0, 0.0);
vColor = vec4(instanceColors.rgb, instanceColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vColor, geometry);
}
`,er=`#version 300 es
#define SHADER_NAME line-layer-fragment-shader
precision highp float;
in vec4 vColor;
in vec2 uv;
out vec4 fragColor;
void main(void) {
geometry.uv = uv;
fragColor = vColor;
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,ea={getSourcePosition:{type:"accessor",value:e=>e.sourcePosition},getTargetPosition:{type:"accessor",value:e=>e.targetPosition},getColor:{type:"accessor",value:[0,0,0,255]},getWidth:{type:"accessor",value:1},widthUnits:"pixels",widthScale:{type:"number",value:1,min:0},widthMinPixels:{type:"number",value:0,min:0},widthMaxPixels:{type:"number",value:Number.MAX_SAFE_INTEGER,min:0}},el=class extends ee.Layer{getBounds(){var e;return null==(e=this.getAttributeManager())?void 0:e.getBounds(["instanceSourcePositions","instanceTargetPositions"])}getShaders(){return super.getShaders({vs:en,fs:er,source:es,modules:[ee.project32,ee.picking,eo]})}get wrapLongitude(){return!1}initializeState(){this.getAttributeManager().addInstanced({instanceSourcePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getSourcePosition"},instanceTargetPositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getTargetPosition"},instanceColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getColor",defaultValue:[0,0,0,255]},instanceWidths:{size:1,transition:!0,accessor:"getWidth",defaultValue:1}})}updateState(e){var t;super.updateState(e),e.changeFlags.extensionsChanged&&(null==(t=this.state.model)||t.destroy(),this.state.model=this._getModel(),this.getAttributeManager().invalidateAll())}draw({uniforms:e}){let{widthUnits:t,widthScale:i,widthMinPixels:o,widthMaxPixels:s,wrapLongitude:n}=this.props,r=this.state.model,a={widthUnits:ee.UNIT[t],widthScale:i,widthMinPixels:o,widthMaxPixels:s,useShortestPath:+!!n};r.shaderInputs.setProps({line:a}),r.draw(this.context.renderPass),n&&(r.shaderInputs.setProps({line:{...a,useShortestPath:-1}}),r.draw(this.context.renderPass))}_getModel(){return new et.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new et.Geometry({topology:"triangle-strip",attributes:{positions:{size:3,value:new Float32Array([0,-1,0,0,1,0,1,-1,0,1,1,0])}}}),isInstanced:!0})}};el.layerName="LineLayer",el.defaultProps=ea;var ec=el,ed=i(7673),eu=i(6463),eg=i(2763),ep=`uniform pointCloudUniforms {
  float radiusPixels;
  highp int sizeUnits;
} pointCloud;
`,ef={name:"pointCloud",vs:ep,fs:ep,uniformTypes:{radiusPixels:"f32",sizeUnits:"i32"}},eh=`#version 300 es
#define SHADER_NAME point-cloud-layer-vertex-shader
in vec3 positions;
in vec3 instanceNormals;
in vec4 instanceColors;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in vec3 instancePickingColors;
out vec4 vColor;
out vec2 unitPosition;
void main(void) {
geometry.worldPosition = instancePositions;
geometry.normal = project_normal(instanceNormals);
unitPosition = positions.xy;
geometry.uv = unitPosition;
geometry.pickingColor = instancePickingColors;
vec3 offset = vec3(positions.xy * project_size_to_pixel(pointCloud.radiusPixels, pointCloud.sizeUnits), 0.0);
DECKGL_FILTER_SIZE(offset, geometry);
gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.), geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
vec3 lightColor = lighting_getLightColor(instanceColors.rgb, project.cameraPosition, geometry.position.xyz, geometry.normal);
vColor = vec4(lightColor, instanceColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vColor, geometry);
}
`,ev=`#version 300 es
#define SHADER_NAME point-cloud-layer-fragment-shader
precision highp float;
in vec4 vColor;
in vec2 unitPosition;
out vec4 fragColor;
void main(void) {
geometry.uv = unitPosition.xy;
float distToCenter = length(unitPosition);
if (distToCenter > 1.0) {
discard;
}
fragColor = vColor;
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,em=[0,0,0,255],ey=[0,0,1],ex=class extends ed.Layer{getShaders(){return super.getShaders({vs:eh,fs:ev,modules:[ed.project32,eg.gouraudMaterial,ed.picking,ef]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceNormals:{size:3,transition:!0,accessor:"getNormal",defaultValue:ey},instanceColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getColor",defaultValue:em}})}updateState(e){var t;let{changeFlags:i,props:o}=e;super.updateState(e),i.extensionsChanged&&(null==(t=this.state.model)||t.destroy(),this.state.model=this._getModel(),this.getAttributeManager().invalidateAll()),i.dataChanged&&function(e){let{header:t,attributes:i}=e;if(t&&i&&(e.length=t.vertexCount,i.POSITION&&(i.instancePositions=i.POSITION),i.NORMAL&&(i.instanceNormals=i.NORMAL),i.COLOR_0)){let{size:e,value:t}=i.COLOR_0;i.instanceColors={size:e,type:"unorm8",value:t}}}(o.data)}draw({uniforms:e}){let{pointSize:t,sizeUnits:i}=this.props,o=this.state.model,s={sizeUnits:ed.UNIT[i],radiusPixels:t};o.shaderInputs.setProps({pointCloud:s}),o.draw(this.context.renderPass)}_getModel(){let e=[];for(let t=0;t<3;t++){let i=t/3*Math.PI*2;e.push(2*Math.cos(i),2*Math.sin(i),0)}return new eu.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new eu.Geometry({topology:"triangle-list",attributes:{positions:new Float32Array(e)}}),isInstanced:!0})}};ex.layerName="PointCloudLayer",ex.defaultProps={sizeUnits:"pixels",pointSize:{type:"number",min:0,value:10},getPosition:{type:"accessor",value:e=>e.position},getNormal:{type:"accessor",value:ey},getColor:{type:"accessor",value:em},material:!0,radiusPixels:{deprecatedFor:"pointSize"}};var eP=ex,e_=i(7673),eC=i(6463),eS=`uniform scatterplotUniforms {
  float radiusScale;
  float radiusMinPixels;
  float radiusMaxPixels;
  float lineWidthScale;
  float lineWidthMinPixels;
  float lineWidthMaxPixels;
  float stroked;
  float filled;
  bool antialiasing;
  bool billboard;
  highp int radiusUnits;
  highp int lineWidthUnits;
} scatterplot;
`,eL={name:"scatterplot",vs:eS,fs:eS,source:"",uniformTypes:{radiusScale:"f32",radiusMinPixels:"f32",radiusMaxPixels:"f32",lineWidthScale:"f32",lineWidthMinPixels:"f32",lineWidthMaxPixels:"f32",stroked:"f32",filled:"f32",antialiasing:"f32",billboard:"f32",radiusUnits:"i32",lineWidthUnits:"i32"}},eb=`#version 300 es
#define SHADER_NAME scatterplot-layer-vertex-shader
in vec3 positions;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceRadius;
in float instanceLineWidths;
in vec4 instanceFillColors;
in vec4 instanceLineColors;
in vec3 instancePickingColors;
out vec4 vFillColor;
out vec4 vLineColor;
out vec2 unitPosition;
out float innerUnitRadius;
out float outerRadiusPixels;
void main(void) {
geometry.worldPosition = instancePositions;
outerRadiusPixels = clamp(
project_size_to_pixel(scatterplot.radiusScale * instanceRadius, scatterplot.radiusUnits),
scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
);
float lineWidthPixels = clamp(
project_size_to_pixel(scatterplot.lineWidthScale * instanceLineWidths, scatterplot.lineWidthUnits),
scatterplot.lineWidthMinPixels, scatterplot.lineWidthMaxPixels
);
outerRadiusPixels += scatterplot.stroked * lineWidthPixels / 2.0;
float edgePadding = scatterplot.antialiasing ? (outerRadiusPixels + SMOOTH_EDGE_RADIUS) / outerRadiusPixels : 1.0;
unitPosition = edgePadding * positions.xy;
geometry.uv = unitPosition;
geometry.pickingColor = instancePickingColors;
innerUnitRadius = 1.0 - scatterplot.stroked * lineWidthPixels / outerRadiusPixels;
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
vFillColor = vec4(instanceFillColors.rgb, instanceFillColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vFillColor, geometry);
vLineColor = vec4(instanceLineColors.rgb, instanceLineColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vLineColor, geometry);
}
`,ew=`#version 300 es
#define SHADER_NAME scatterplot-layer-fragment-shader
precision highp float;
in vec4 vFillColor;
in vec4 vLineColor;
in vec2 unitPosition;
in float innerUnitRadius;
in float outerRadiusPixels;
out vec4 fragColor;
void main(void) {
geometry.uv = unitPosition;
float distToCenter = length(unitPosition) * outerRadiusPixels;
float inCircle = scatterplot.antialiasing ?
smoothedge(distToCenter, outerRadiusPixels) :
step(distToCenter, outerRadiusPixels);
if (inCircle == 0.0) {
discard;
}
if (scatterplot.stroked > 0.5) {
float isLine = scatterplot.antialiasing ?
smoothedge(innerUnitRadius * outerRadiusPixels, distToCenter) :
step(innerUnitRadius * outerRadiusPixels, distToCenter);
if (scatterplot.filled > 0.5) {
fragColor = mix(vFillColor, vLineColor, isLine);
} else {
if (isLine == 0.0) {
discard;
}
fragColor = vec4(vLineColor.rgb, vLineColor.a * isLine);
}
} else if (scatterplot.filled < 0.5) {
discard;
} else {
fragColor = vFillColor;
}
fragColor.a *= inCircle;
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,eI=`// TODO(ibgreen): Hack for Layer uniforms (move to new "color" module?)

struct LayerUniforms {
  opacity: f32,
};

var<private> layer: LayerUniforms = LayerUniforms(1.0);
// @group(0) @binding(1) var<uniform> layer: LayerUniforms;

// Main shaders

struct ScatterplotUniforms {
  radiusScale: f32,
  radiusMinPixels: f32,
  radiusMaxPixels: f32,
  lineWidthScale: f32,
  lineWidthMinPixels: f32,
  lineWidthMaxPixels: f32,
  stroked: f32,
  filled: i32,
  antialiasing: i32,
  billboard: i32,
  radiusUnits: i32,
  lineWidthUnits: i32,
};

struct ConstantAttributeUniforms {
 instancePositions: vec3<f32>,
 instancePositions64Low: vec3<f32>,
 instanceRadius: f32,
 instanceLineWidths: f32,
 instanceFillColors: vec4<f32>,
 instanceLineColors: vec4<f32>,
 instancePickingColors: vec3<f32>,

 instancePositionsConstant: i32,
 instancePositions64LowConstant: i32,
 instanceRadiusConstant: i32,
 instanceLineWidthsConstant: i32,
 instanceFillColorsConstant: i32,
 instanceLineColorsConstant: i32,
 instancePickingColorsConstant: i32
};

@group(0) @binding(2) var<uniform> scatterplot: ScatterplotUniforms;

struct ConstantAttributes {
  instancePositions: vec3<f32>,
  instancePositions64Low: vec3<f32>,
  instanceRadius: f32,
  instanceLineWidths: f32,
  instanceFillColors: vec4<f32>,
  instanceLineColors: vec4<f32>,
  instancePickingColors: vec3<f32>
};

const constants = ConstantAttributes(
  vec3<f32>(0.0),
  vec3<f32>(0.0),
  0.0,
  0.0,
  vec4<f32>(0.0, 0.0, 0.0, 1.0),
  vec4<f32>(0.0, 0.0, 0.0, 1.0),
  vec3<f32>(0.0)
);

struct Attributes {
  @builtin(instance_index) instanceIndex : u32,
  @builtin(vertex_index) vertexIndex : u32,
  @location(0) positions: vec3<f32>,
  @location(1) instancePositions: vec3<f32>,
  @location(2) instancePositions64Low: vec3<f32>,
  @location(3) instanceRadius: f32,
  @location(4) instanceLineWidths: f32,
  @location(5) instanceFillColors: vec4<f32>,
  @location(6) instanceLineColors: vec4<f32>,
  @location(7) instancePickingColors: vec3<f32>
};

struct Varyings {
  @builtin(position) position: vec4<f32>,
  @location(0) vFillColor: vec4<f32>,
  @location(1) vLineColor: vec4<f32>,
  @location(2) unitPosition: vec2<f32>,
  @location(3) innerUnitRadius: f32,
  @location(4) outerRadiusPixels: f32,
};

@vertex
fn vertexMain(attributes: Attributes) -> Varyings {
  var varyings: Varyings;

  // Draw an inline geometry constant array clip space triangle to verify that rendering works.
  // var positions = array<vec2<f32>, 3>(vec2(0.0, 0.5), vec2(-0.5, -0.5), vec2(0.5, -0.5));
  // if (attributes.instanceIndex == 0) {
  //   varyings.position = vec4<f32>(positions[attributes.vertexIndex], 0.0, 1.0);
  //   return varyings;
  // }

  // var geometry: Geometry;
  // geometry.worldPosition = instancePositions;

  // Multiply out radius and clamp to limits
  varyings.outerRadiusPixels = clamp(
    project_unit_size_to_pixel(scatterplot.radiusScale * attributes.instanceRadius, scatterplot.radiusUnits),
    scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
  );

  // Multiply out line width and clamp to limits
  let lineWidthPixels = clamp(
    project_unit_size_to_pixel(scatterplot.lineWidthScale * attributes.instanceLineWidths, scatterplot.lineWidthUnits),
    scatterplot.lineWidthMinPixels, scatterplot.lineWidthMaxPixels
  );

  // outer radius needs to offset by half stroke width
  varyings.outerRadiusPixels += scatterplot.stroked * lineWidthPixels / 2.0;
  // Expand geometry to accommodate edge smoothing
  let edgePadding = select(
    (varyings.outerRadiusPixels + SMOOTH_EDGE_RADIUS) / varyings.outerRadiusPixels,
    1.0,
    scatterplot.antialiasing != 0
  );

  // position on the containing square in [-1, 1] space
  varyings.unitPosition = edgePadding * attributes.positions.xy;
  geometry.uv = varyings.unitPosition;
  geometry.pickingColor = attributes.instancePickingColors;

  varyings.innerUnitRadius = 1.0 - scatterplot.stroked * lineWidthPixels / varyings.outerRadiusPixels;

  if (scatterplot.billboard != 0) {
    varyings.position = project_position_to_clipspace(attributes.instancePositions, attributes.instancePositions64Low, vec3<f32>(0.0)); // TODO , geometry.position);
    // DECKGL_FILTER_GL_POSITION(varyings.position, geometry);
    let offset = attributes.positions; // * edgePadding * varyings.outerRadiusPixels;
    // DECKGL_FILTER_SIZE(offset, geometry);
    let clipPixels = project_pixel_size_to_clipspace(offset.xy);
    varyings.position.x = clipPixels.x;
    varyings.position.y = clipPixels.y;
  } else {
    let offset = edgePadding * attributes.positions * project_pixel_size_float(varyings.outerRadiusPixels);
    // DECKGL_FILTER_SIZE(offset, geometry);
    varyings.position = project_position_to_clipspace(attributes.instancePositions, attributes.instancePositions64Low, offset); // TODO , geometry.position);
    // DECKGL_FILTER_GL_POSITION(varyings.position, geometry);
  }

  // Apply opacity to instance color, or return instance picking color
  varyings.vFillColor = vec4<f32>(attributes.instanceFillColors.rgb, attributes.instanceFillColors.a * layer.opacity);
  // DECKGL_FILTER_COLOR(varyings.vFillColor, geometry);
  varyings.vLineColor = vec4<f32>(attributes.instanceLineColors.rgb, attributes.instanceLineColors.a * layer.opacity);
  // DECKGL_FILTER_COLOR(varyings.vLineColor, geometry);

  return varyings;
}

@fragment
fn fragmentMain(varyings: Varyings) -> @location(0) vec4<f32> {
  // var geometry: Geometry;
  // geometry.uv = unitPosition;

  let distToCenter = length(varyings.unitPosition) * varyings.outerRadiusPixels;
  let inCircle = select(
    smoothedge(distToCenter, varyings.outerRadiusPixels),
    step(distToCenter, varyings.outerRadiusPixels),
    scatterplot.antialiasing != 0
  );

  if (inCircle == 0.0) {
    // discard;
  }

  var fragColor: vec4<f32>;

  if (scatterplot.stroked != 0) {
    let isLine = select(
      smoothedge(varyings.innerUnitRadius * varyings.outerRadiusPixels, distToCenter),
      step(varyings.innerUnitRadius * varyings.outerRadiusPixels, distToCenter),
      scatterplot.antialiasing != 0
    );

    if (scatterplot.filled != 0) {
      fragColor = mix(varyings.vFillColor, varyings.vLineColor, isLine);
    } else {
      if (isLine == 0.0) {
        // discard;
      }
      fragColor = vec4<f32>(varyings.vLineColor.rgb, varyings.vLineColor.a * isLine);
    }
  } else if (scatterplot.filled == 0) {
    // discard;
  } else {
    fragColor = varyings.vFillColor;
  }

  fragColor.a *= inCircle;
  // DECKGL_FILTER_COLOR(fragColor, geometry);

  return fragColor;
  // return vec4<f32>(0, 0, 1, 1);
}
`,eT=[0,0,0,255],eM=class extends e_.Layer{getShaders(){return super.getShaders({vs:eb,fs:ew,source:eI,modules:[e_.project32,e_.picking,eL]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceRadius:{size:1,transition:!0,accessor:"getRadius",defaultValue:1},instanceFillColors:{size:this.props.colorFormat.length,transition:!0,type:"unorm8",accessor:"getFillColor",defaultValue:[0,0,0,255]},instanceLineColors:{size:this.props.colorFormat.length,transition:!0,type:"unorm8",accessor:"getLineColor",defaultValue:[0,0,0,255]},instanceLineWidths:{size:1,transition:!0,accessor:"getLineWidth",defaultValue:1}})}updateState(e){var t;super.updateState(e),e.changeFlags.extensionsChanged&&(null==(t=this.state.model)||t.destroy(),this.state.model=this._getModel(),this.getAttributeManager().invalidateAll())}draw({uniforms:e}){let{radiusUnits:t,radiusScale:i,radiusMinPixels:o,radiusMaxPixels:s,stroked:n,filled:r,billboard:a,antialiasing:l,lineWidthUnits:c,lineWidthScale:d,lineWidthMinPixels:u,lineWidthMaxPixels:g}=this.props,p={stroked:n,filled:r,billboard:a,antialiasing:l,radiusUnits:e_.UNIT[t],radiusScale:i,radiusMinPixels:o,radiusMaxPixels:s,lineWidthUnits:e_.UNIT[c],lineWidthScale:d,lineWidthMinPixels:u,lineWidthMaxPixels:g},f=this.state.model;f.shaderInputs.setProps({scatterplot:p}),f.draw(this.context.renderPass)}_getModel(){return new eC.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new eC.Geometry({topology:"triangle-strip",attributes:{positions:{size:3,value:new Float32Array([-1,-1,0,1,-1,0,-1,1,0,1,1,0])}}}),isInstanced:!0})}};eM.defaultProps={radiusUnits:"meters",radiusScale:{type:"number",min:0,value:1},radiusMinPixels:{type:"number",min:0,value:0},radiusMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},lineWidthUnits:"meters",lineWidthScale:{type:"number",min:0,value:1},lineWidthMinPixels:{type:"number",min:0,value:0},lineWidthMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},stroked:!1,filled:!0,billboard:!1,antialiasing:!0,getPosition:{type:"accessor",value:e=>e.position},getRadius:{type:"accessor",value:1},getFillColor:{type:"accessor",value:eT},getLineColor:{type:"accessor",value:eT},getLineWidth:{type:"accessor",value:1},strokeWidth:{deprecatedFor:"getLineWidth"},outline:{deprecatedFor:"stroked"},getColor:{deprecatedFor:["getFillColor","getLineColor"]}},eM.layerName="ScatterplotLayer";var eE=eM,eA=i(7673),ez=i(2763),eR=i(6463),eO=i(7673),eF=i(6463),ek=i(3307),eD=class extends eF.Geometry{constructor(e){let{indices:t,attributes:i}=function(e){let{radius:t,height:i=1,nradial:o=10}=e,{vertices:s}=e;s&&(eO.log.assert(s.length>=o),s=s.flatMap(e=>[e[0],e[1]]),(0,ek.modifyPolygonWindingDirection)(s,ek.WINDING.COUNTER_CLOCKWISE));let n=i>0,r=o+1,a=n?3*r+1:o,l=2*Math.PI/o,c=new Uint16Array(n?3*o*2:0),d=new Float32Array(3*a),u=new Float32Array(3*a),g=0;if(n){for(let e=0;e<r;e++){let n=e*l,r=e%o,a=Math.sin(n),c=Math.cos(n);for(let e=0;e<2;e++)d[g+0]=s?s[2*r]:c*t,d[g+1]=s?s[2*r+1]:a*t,d[g+2]=(.5-e)*i,u[g+0]=s?s[2*r]:c,u[g+1]=s?s[2*r+1]:a,g+=3}d[g+0]=d[g-3],d[g+1]=d[g-2],d[g+2]=d[g-1],g+=3}for(let e=+!n;e<r;e++){let n=Math.floor(e/2)*Math.sign(.5-e%2),r=n*l,a=(n+o)%o,c=Math.sin(r),p=Math.cos(r);d[g+0]=s?s[2*a]:p*t,d[g+1]=s?s[2*a+1]:c*t,d[g+2]=i/2,u[g+2]=1,g+=3}if(n){let e=0;for(let t=0;t<o;t++)c[e++]=2*t+0,c[e++]=2*t+2,c[e++]=2*t+0,c[e++]=2*t+1,c[e++]=2*t+1,c[e++]=2*t+3}return{indices:c,attributes:{POSITION:{size:3,value:d},NORMAL:{size:3,value:u}}}}(e);super({...e,indices:t,attributes:i})}},eW=`uniform columnUniforms {
  float radius;
  float angle;
  vec2 offset;
  bool extruded;
  bool stroked;
  bool isStroke;
  float coverage;
  float elevationScale;
  float edgeDistance;
  float widthScale;
  float widthMinPixels;
  float widthMaxPixels;
  highp int radiusUnits;
  highp int widthUnits;
} column;
`,eG={name:"column",vs:eW,fs:eW,uniformTypes:{radius:"f32",angle:"f32",offset:"vec2<f32>",extruded:"f32",stroked:"f32",isStroke:"f32",coverage:"f32",elevationScale:"f32",edgeDistance:"f32",widthScale:"f32",widthMinPixels:"f32",widthMaxPixels:"f32",radiusUnits:"i32",widthUnits:"i32"}},eN=`#version 300 es
#define SHADER_NAME column-layer-vertex-shader
in vec3 positions;
in vec3 normals;
in vec3 instancePositions;
in float instanceElevations;
in vec3 instancePositions64Low;
in vec4 instanceFillColors;
in vec4 instanceLineColors;
in float instanceStrokeWidths;
in vec3 instancePickingColors;
out vec4 vColor;
#ifdef FLAT_SHADING
out vec3 cameraPosition;
out vec4 position_commonspace;
#endif
void main(void) {
geometry.worldPosition = instancePositions;
vec4 color = column.isStroke ? instanceLineColors : instanceFillColors;
mat2 rotationMatrix = mat2(cos(column.angle), sin(column.angle), -sin(column.angle), cos(column.angle));
float elevation = 0.0;
float strokeOffsetRatio = 1.0;
if (column.extruded) {
elevation = instanceElevations * (positions.z + 1.0) / 2.0 * column.elevationScale;
} else if (column.stroked) {
float widthPixels = clamp(
project_size_to_pixel(instanceStrokeWidths * column.widthScale, column.widthUnits),
column.widthMinPixels, column.widthMaxPixels) / 2.0;
float halfOffset = project_pixel_size(widthPixels) / project_size(column.edgeDistance * column.coverage * column.radius);
if (column.isStroke) {
strokeOffsetRatio -= sign(positions.z) * halfOffset;
} else {
strokeOffsetRatio -= halfOffset;
}
}
float shouldRender = float(color.a > 0.0 && instanceElevations >= 0.0);
float dotRadius = column.radius * column.coverage * shouldRender;
geometry.pickingColor = instancePickingColors;
vec3 centroidPosition = vec3(instancePositions.xy, instancePositions.z + elevation);
vec3 centroidPosition64Low = instancePositions64Low;
vec2 offset = (rotationMatrix * positions.xy * strokeOffsetRatio + column.offset) * dotRadius;
if (column.radiusUnits == UNIT_METERS) {
offset = project_size(offset);
}
vec3 pos = vec3(offset, 0.);
DECKGL_FILTER_SIZE(pos, geometry);
gl_Position = project_position_to_clipspace(centroidPosition, centroidPosition64Low, pos, geometry.position);
geometry.normal = project_normal(vec3(rotationMatrix * normals.xy, normals.z));
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
if (column.extruded && !column.isStroke) {
#ifdef FLAT_SHADING
cameraPosition = project.cameraPosition;
position_commonspace = geometry.position;
vColor = vec4(color.rgb, color.a * layer.opacity);
#else
vec3 lightColor = lighting_getLightColor(color.rgb, project.cameraPosition, geometry.position.xyz, geometry.normal);
vColor = vec4(lightColor, color.a * layer.opacity);
#endif
} else {
vColor = vec4(color.rgb, color.a * layer.opacity);
}
DECKGL_FILTER_COLOR(vColor, geometry);
}
`,eU=`#version 300 es
#define SHADER_NAME column-layer-fragment-shader
precision highp float;
out vec4 fragColor;
in vec4 vColor;
#ifdef FLAT_SHADING
in vec3 cameraPosition;
in vec4 position_commonspace;
#endif
void main(void) {
fragColor = vColor;
geometry.uv = vec2(0.);
#ifdef FLAT_SHADING
if (column.extruded && !column.isStroke && !bool(picking.isActive)) {
vec3 normal = normalize(cross(dFdx(position_commonspace.xyz), dFdy(position_commonspace.xyz)));
fragColor.rgb = lighting_getLightColor(vColor.rgb, cameraPosition, position_commonspace.xyz, normal);
}
#endif
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,eB=[0,0,0,255],ej={diskResolution:{type:"number",min:4,value:20},vertices:null,radius:{type:"number",min:0,value:1e3},angle:{type:"number",value:0},offset:{type:"array",value:[0,0]},coverage:{type:"number",min:0,max:1,value:1},elevationScale:{type:"number",min:0,value:1},radiusUnits:"meters",lineWidthUnits:"meters",lineWidthScale:1,lineWidthMinPixels:0,lineWidthMaxPixels:Number.MAX_SAFE_INTEGER,extruded:!0,wireframe:!1,filled:!0,stroked:!1,flatShading:!1,getPosition:{type:"accessor",value:e=>e.position},getFillColor:{type:"accessor",value:eB},getLineColor:{type:"accessor",value:eB},getLineWidth:{type:"accessor",value:1},getElevation:{type:"accessor",value:1e3},material:!0,getColor:{deprecatedFor:["getFillColor","getLineColor"]}},eV=class extends eA.Layer{getShaders(){let e={},{flatShading:t}=this.props;return t&&(e.FLAT_SHADING=1),super.getShaders({vs:eN,fs:eU,defines:e,modules:[eA.project32,t?ez.phongMaterial:ez.gouraudMaterial,eA.picking,eG]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceElevations:{size:1,transition:!0,accessor:"getElevation"},instanceFillColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getFillColor",defaultValue:eB},instanceLineColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getLineColor",defaultValue:eB},instanceStrokeWidths:{size:1,accessor:"getLineWidth",transition:!0}})}updateState(e){var t;super.updateState(e);let{props:i,oldProps:o,changeFlags:s}=e,n=s.extensionsChanged||i.flatShading!==o.flatShading;n&&(null==(t=this.state.models)||t.forEach(e=>e.destroy()),this.setState(this._getModels()),this.getAttributeManager().invalidateAll());let r=this.getNumInstances();this.state.fillModel.setInstanceCount(r),this.state.wireframeModel.setInstanceCount(r),(n||i.diskResolution!==o.diskResolution||i.vertices!==o.vertices||(i.extruded||i.stroked)!==(o.extruded||o.stroked))&&this._updateGeometry(i)}getGeometry(e,t,i){let o=new eD({radius:1,height:2*!!i,vertices:t,nradial:e}),s=0;if(t)for(let i=0;i<e;i++){let o=t[i];s+=Math.sqrt(o[0]*o[0]+o[1]*o[1])/e}else s=1;return this.setState({edgeDistance:Math.cos(Math.PI/e)*s}),o}_getModels(){let e=this.getShaders(),t=this.getAttributeManager().getBufferLayouts(),i=new eR.Model(this.context.device,{...e,id:`${this.props.id}-fill`,bufferLayout:t,isInstanced:!0}),o=new eR.Model(this.context.device,{...e,id:`${this.props.id}-wireframe`,bufferLayout:t,isInstanced:!0});return{fillModel:i,wireframeModel:o,models:[o,i]}}_updateGeometry({diskResolution:e,vertices:t,extruded:i,stroked:o}){let s=this.getGeometry(e,t,i||o);this.setState({fillVertexCount:s.attributes.POSITION.value.length/3});let n=this.state.fillModel,r=this.state.wireframeModel;n.setGeometry(s),n.setTopology("triangle-strip"),n.setIndexBuffer(null),r.setGeometry(s),r.setTopology("line-list")}draw({uniforms:e}){let{lineWidthUnits:t,lineWidthScale:i,lineWidthMinPixels:o,lineWidthMaxPixels:s,radiusUnits:n,elevationScale:r,extruded:a,filled:l,stroked:c,wireframe:d,offset:u,coverage:g,radius:p,angle:f}=this.props,h=this.state.fillModel,v=this.state.wireframeModel,{fillVertexCount:m,edgeDistance:y}=this.state,x={radius:p,angle:f/180*Math.PI,offset:u,extruded:a,stroked:c,coverage:g,elevationScale:r,edgeDistance:y,radiusUnits:eA.UNIT[n],widthUnits:eA.UNIT[t],widthScale:i,widthMinPixels:o,widthMaxPixels:s};a&&d&&(v.shaderInputs.setProps({column:{...x,isStroke:!0}}),v.draw(this.context.renderPass)),l&&(h.setVertexCount(m),h.shaderInputs.setProps({column:{...x,isStroke:!1}}),h.draw(this.context.renderPass)),!a&&c&&(h.setVertexCount(2*m/3),h.shaderInputs.setProps({column:{...x,isStroke:!0}}),h.draw(this.context.renderPass))}};eV.layerName="ColumnLayer",eV.defaultProps=ej;var eH=eV,eK=i(7673),eZ=i(6463),e$=class extends eH{_updateGeometry(){let e=new eZ.CubeGeometry;this.state.fillModel.setGeometry(e)}draw({uniforms:e}){let{elevationScale:t,extruded:i,offset:o,coverage:s,cellSize:n,angle:r,radiusUnits:a}=this.props,l=this.state.fillModel,c={radius:n/2,radiusUnits:eK.UNIT[a],angle:r,offset:o,extruded:i,stroked:!1,coverage:s,elevationScale:t,edgeDistance:1,isStroke:!1,widthUnits:0,widthScale:0,widthMinPixels:0,widthMaxPixels:0};l.shaderInputs.setProps({column:c}),l.draw(this.context.renderPass)}};e$.layerName="GridCellLayer",e$.defaultProps={cellSize:{type:"number",min:0,value:1e3},offset:{type:"array",value:[1,1]}};var eJ=e$,eX=i(7673),eq=i(6463),eY=i(6463),eQ=i(7673),e0=i(3307),e3=class extends eQ.Tesselator{constructor(e){super({...e,attributes:{positions:{size:3,padding:18,initialize:!0,type:e.fp64?Float64Array:Float32Array},segmentTypes:{size:1,type:Uint8ClampedArray}}})}get(e){return this.attributes[e]}getGeometryFromBuffer(e){return this.normalize?super.getGeometryFromBuffer(e):null}normalizeGeometry(e){return this.normalize?function(e,t,i,o){let s;if(Array.isArray(e[0])){s=Array(e.length*t);for(let i=0;i<e.length;i++)for(let o=0;o<t;o++)s[i*t+o]=e[i][o]||0}else s=e;return i?(0,e0.cutPolylineByGrid)(s,{size:t,gridResolution:i}):o?(0,e0.cutPolylineByMercatorBounds)(s,{size:t}):s}(e,this.positionSize,this.opts.resolution,this.opts.wrapLongitude):e}getGeometrySize(e){if(e2(e)){let t=0;for(let i of e)t+=this.getGeometrySize(i);return t}let t=this.getPathLength(e);return t<2?0:this.isClosed(e)?t<3?0:t+2:t}updateGeometryAttributes(e,t){if(0!==t.geometrySize)if(e&&e2(e))for(let i of e){let e=this.getGeometrySize(i);t.geometrySize=e,this.updateGeometryAttributes(i,t),t.vertexStart+=e}else this._updateSegmentTypes(e,t),this._updatePositions(e,t)}_updateSegmentTypes(e,t){let i=this.attributes.segmentTypes,o=!!e&&this.isClosed(e),{vertexStart:s,geometrySize:n}=t;i.fill(0,s,s+n),o?(i[s]=4,i[s+n-2]=4):(i[s]+=1,i[s+n-2]+=2),i[s+n-1]=4}_updatePositions(e,t){let{positions:i}=this.attributes;if(!i||!e)return;let{vertexStart:o,geometrySize:s}=t,n=[,,,];for(let t=o,r=0;r<s;t++,r++)this.getPointOnPath(e,r,n),i[3*t]=n[0],i[3*t+1]=n[1],i[3*t+2]=n[2]}getPathLength(e){return e.length/this.positionSize}getPointOnPath(e,t,i=[]){let{positionSize:o}=this;t*o>=e.length&&(t+=1-e.length/o);let s=t*o;return i[0]=e[s],i[1]=e[s+1],i[2]=3===o&&e[s+2]||0,i}isClosed(e){if(!this.normalize)return!!this.opts.loop;let{positionSize:t}=this,i=e.length-t;return e[0]===e[i]&&e[1]===e[i+1]&&(2===t||e[2]===e[i+2])}};function e2(e){return Array.isArray(e[0])}var e1=`uniform pathUniforms {
  float widthScale;
  float widthMinPixels;
  float widthMaxPixels;
  float jointType;
  float capType;
  float miterLimit;
  bool billboard;
  highp int widthUnits;
} path;
`,e4={name:"path",vs:e1,fs:e1,uniformTypes:{widthScale:"f32",widthMinPixels:"f32",widthMaxPixels:"f32",jointType:"f32",capType:"f32",miterLimit:"f32",billboard:"f32",widthUnits:"i32"}},e6=`#version 300 es
#define SHADER_NAME path-layer-vertex-shader
in vec2 positions;
in float instanceTypes;
in vec3 instanceStartPositions;
in vec3 instanceEndPositions;
in vec3 instanceLeftPositions;
in vec3 instanceRightPositions;
in vec3 instanceLeftPositions64Low;
in vec3 instanceStartPositions64Low;
in vec3 instanceEndPositions64Low;
in vec3 instanceRightPositions64Low;
in float instanceStrokeWidths;
in vec4 instanceColors;
in vec3 instancePickingColors;
uniform float opacity;
out vec4 vColor;
out vec2 vCornerOffset;
out float vMiterLength;
out vec2 vPathPosition;
out float vPathLength;
out float vJointType;
const float EPSILON = 0.001;
const vec3 ZERO_OFFSET = vec3(0.0);
float flipIfTrue(bool flag) {
return -(float(flag) * 2. - 1.);
}
vec3 getLineJoinOffset(
vec3 prevPoint, vec3 currPoint, vec3 nextPoint,
vec2 width
) {
bool isEnd = positions.x > 0.0;
float sideOfPath = positions.y;
float isJoint = float(sideOfPath == 0.0);
vec3 deltaA3 = (currPoint - prevPoint);
vec3 deltaB3 = (nextPoint - currPoint);
mat3 rotationMatrix;
bool needsRotation = !path.billboard && project_needs_rotation(currPoint, rotationMatrix);
if (needsRotation) {
deltaA3 = deltaA3 * rotationMatrix;
deltaB3 = deltaB3 * rotationMatrix;
}
vec2 deltaA = deltaA3.xy / width;
vec2 deltaB = deltaB3.xy / width;
float lenA = length(deltaA);
float lenB = length(deltaB);
vec2 dirA = lenA > 0. ? normalize(deltaA) : vec2(0.0, 0.0);
vec2 dirB = lenB > 0. ? normalize(deltaB) : vec2(0.0, 0.0);
vec2 perpA = vec2(-dirA.y, dirA.x);
vec2 perpB = vec2(-dirB.y, dirB.x);
vec2 tangent = dirA + dirB;
tangent = length(tangent) > 0. ? normalize(tangent) : perpA;
vec2 miterVec = vec2(-tangent.y, tangent.x);
vec2 dir = isEnd ? dirA : dirB;
vec2 perp = isEnd ? perpA : perpB;
float L = isEnd ? lenA : lenB;
float sinHalfA = abs(dot(miterVec, perp));
float cosHalfA = abs(dot(dirA, miterVec));
float turnDirection = flipIfTrue(dirA.x * dirB.y >= dirA.y * dirB.x);
float cornerPosition = sideOfPath * turnDirection;
float miterSize = 1.0 / max(sinHalfA, EPSILON);
miterSize = mix(
min(miterSize, max(lenA, lenB) / max(cosHalfA, EPSILON)),
miterSize,
step(0.0, cornerPosition)
);
vec2 offsetVec = mix(miterVec * miterSize, perp, step(0.5, cornerPosition))
* (sideOfPath + isJoint * turnDirection);
bool isStartCap = lenA == 0.0 || (!isEnd && (instanceTypes == 1.0 || instanceTypes == 3.0));
bool isEndCap = lenB == 0.0 || (isEnd && (instanceTypes == 2.0 || instanceTypes == 3.0));
bool isCap = isStartCap || isEndCap;
if (isCap) {
offsetVec = mix(perp * sideOfPath, dir * path.capType * 4.0 * flipIfTrue(isStartCap), isJoint);
vJointType = path.capType;
} else {
vJointType = path.jointType;
}
vPathLength = L;
vCornerOffset = offsetVec;
vMiterLength = dot(vCornerOffset, miterVec * turnDirection);
vMiterLength = isCap ? isJoint : vMiterLength;
vec2 offsetFromStartOfPath = vCornerOffset + deltaA * float(isEnd);
vPathPosition = vec2(
dot(offsetFromStartOfPath, perp),
dot(offsetFromStartOfPath, dir)
);
geometry.uv = vPathPosition;
float isValid = step(instanceTypes, 3.5);
vec3 offset = vec3(offsetVec * width * isValid, 0.0);
if (needsRotation) {
offset = rotationMatrix * offset;
}
return offset;
}
void clipLine(inout vec4 position, vec4 refPosition) {
if (position.w < EPSILON) {
float r = (EPSILON - refPosition.w) / (position.w - refPosition.w);
position = refPosition + (position - refPosition) * r;
}
}
void main() {
geometry.pickingColor = instancePickingColors;
vColor = vec4(instanceColors.rgb, instanceColors.a * layer.opacity);
float isEnd = positions.x;
vec3 prevPosition = mix(instanceLeftPositions, instanceStartPositions, isEnd);
vec3 prevPosition64Low = mix(instanceLeftPositions64Low, instanceStartPositions64Low, isEnd);
vec3 currPosition = mix(instanceStartPositions, instanceEndPositions, isEnd);
vec3 currPosition64Low = mix(instanceStartPositions64Low, instanceEndPositions64Low, isEnd);
vec3 nextPosition = mix(instanceEndPositions, instanceRightPositions, isEnd);
vec3 nextPosition64Low = mix(instanceEndPositions64Low, instanceRightPositions64Low, isEnd);
geometry.worldPosition = currPosition;
vec2 widthPixels = vec2(clamp(
project_size_to_pixel(instanceStrokeWidths * path.widthScale, path.widthUnits),
path.widthMinPixels, path.widthMaxPixels) / 2.0);
vec3 width;
if (path.billboard) {
vec4 prevPositionScreen = project_position_to_clipspace(prevPosition, prevPosition64Low, ZERO_OFFSET);
vec4 currPositionScreen = project_position_to_clipspace(currPosition, currPosition64Low, ZERO_OFFSET, geometry.position);
vec4 nextPositionScreen = project_position_to_clipspace(nextPosition, nextPosition64Low, ZERO_OFFSET);
clipLine(prevPositionScreen, currPositionScreen);
clipLine(nextPositionScreen, currPositionScreen);
clipLine(currPositionScreen, mix(nextPositionScreen, prevPositionScreen, isEnd));
width = vec3(widthPixels, 0.0);
DECKGL_FILTER_SIZE(width, geometry);
vec3 offset = getLineJoinOffset(
prevPositionScreen.xyz / prevPositionScreen.w,
currPositionScreen.xyz / currPositionScreen.w,
nextPositionScreen.xyz / nextPositionScreen.w,
project_pixel_size_to_clipspace(width.xy)
);
DECKGL_FILTER_GL_POSITION(currPositionScreen, geometry);
gl_Position = vec4(currPositionScreen.xyz + offset * currPositionScreen.w, currPositionScreen.w);
} else {
prevPosition = project_position(prevPosition, prevPosition64Low);
currPosition = project_position(currPosition, currPosition64Low);
nextPosition = project_position(nextPosition, nextPosition64Low);
width = vec3(project_pixel_size(widthPixels), 0.0);
DECKGL_FILTER_SIZE(width, geometry);
vec3 offset = getLineJoinOffset(prevPosition, currPosition, nextPosition, width.xy);
geometry.position = vec4(currPosition + offset, 1.0);
gl_Position = project_common_position_to_clipspace(geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
}
DECKGL_FILTER_COLOR(vColor, geometry);
}
`,e5=`#version 300 es
#define SHADER_NAME path-layer-fragment-shader
precision highp float;
in vec4 vColor;
in vec2 vCornerOffset;
in float vMiterLength;
in vec2 vPathPosition;
in float vPathLength;
in float vJointType;
out vec4 fragColor;
void main(void) {
geometry.uv = vPathPosition;
if (vPathPosition.y < 0.0 || vPathPosition.y > vPathLength) {
if (vJointType > 0.5 && length(vCornerOffset) > 1.0) {
discard;
}
if (vJointType < 0.5 && vMiterLength > path.miterLimit + 1.0) {
discard;
}
}
fragColor = vColor;
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,e8=[0,0,0,255],e7={enter:(e,t)=>t.length?t.subarray(t.length-e.length):e},e9=class extends eX.Layer{getShaders(){return super.getShaders({vs:e6,fs:e5,modules:[eX.project32,eX.picking,e4]})}get wrapLongitude(){return!1}getBounds(){var e;return null==(e=this.getAttributeManager())?void 0:e.getBounds(["vertexPositions"])}initializeState(){this.getAttributeManager().addInstanced({vertexPositions:{size:3,vertexOffset:1,type:"float64",fp64:this.use64bitPositions(),transition:e7,accessor:"getPath",update:this.calculatePositions,noAlloc:!0,shaderAttributes:{instanceLeftPositions:{vertexOffset:0},instanceStartPositions:{vertexOffset:1},instanceEndPositions:{vertexOffset:2},instanceRightPositions:{vertexOffset:3}}},instanceTypes:{size:1,type:"uint8",update:this.calculateSegmentTypes,noAlloc:!0},instanceStrokeWidths:{size:1,accessor:"getWidth",transition:e7,defaultValue:1},instanceColors:{size:this.props.colorFormat.length,type:"unorm8",accessor:"getColor",transition:e7,defaultValue:e8},instancePickingColors:{size:4,type:"uint8",accessor:(e,{index:t,target:i})=>this.encodePickingColor(e&&e.__source?e.__source.index:t,i)}}),this.setState({pathTesselator:new e3({fp64:this.use64bitPositions()})})}updateState(e){var t;super.updateState(e);let{props:i,changeFlags:o}=e,s=this.getAttributeManager();if(o.dataChanged||o.updateTriggersChanged&&(o.updateTriggersChanged.all||o.updateTriggersChanged.getPath)){let{pathTesselator:e}=this.state,t=i.data.attributes||{};e.updateGeometry({data:i.data,geometryBuffer:t.getPath,buffers:t,normalize:!i._pathType,loop:"loop"===i._pathType,getGeometry:i.getPath,positionFormat:i.positionFormat,wrapLongitude:i.wrapLongitude,resolution:this.context.viewport.resolution,dataChanged:o.dataChanged}),this.setState({numInstances:e.instanceCount,startIndices:e.vertexStarts}),o.dataChanged||s.invalidateAll()}o.extensionsChanged&&(null==(t=this.state.model)||t.destroy(),this.state.model=this._getModel(),s.invalidateAll())}getPickingInfo(e){let t=super.getPickingInfo(e),{index:i}=t,o=this.props.data;return o[0]&&o[0].__source&&(t.object=o.find(e=>e.__source.index===i)),t}disablePickingIndex(e){let t=this.props.data;if(t[0]&&t[0].__source)for(let i=0;i<t.length;i++)t[i].__source.index===e&&this._disablePickingIndex(i);else super.disablePickingIndex(e)}draw({uniforms:e}){let{jointRounded:t,capRounded:i,billboard:o,miterLimit:s,widthUnits:n,widthScale:r,widthMinPixels:a,widthMaxPixels:l}=this.props,c=this.state.model,d={jointType:Number(t),capType:Number(i),billboard:o,widthUnits:eX.UNIT[n],widthScale:r,miterLimit:s,widthMinPixels:a,widthMaxPixels:l};c.shaderInputs.setProps({path:d}),c.draw(this.context.renderPass)}_getModel(){return new eY.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new eq.Geometry({topology:"triangle-list",attributes:{indices:new Uint16Array([0,1,2,1,4,2,1,3,4,3,5,4]),positions:{value:new Float32Array([0,0,0,-1,0,1,1,-1,1,1,1,0]),size:2}}}),isInstanced:!0})}calculatePositions(e){let{pathTesselator:t}=this.state;e.startIndices=t.vertexStarts,e.value=t.get("positions")}calculateSegmentTypes(e){let{pathTesselator:t}=this.state;e.startIndices=t.vertexStarts,e.value=t.get("segmentTypes")}};e9.defaultProps={widthUnits:"meters",widthScale:{type:"number",min:0,value:1},widthMinPixels:{type:"number",min:0,value:0},widthMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},jointRounded:!1,capRounded:!1,miterLimit:{type:"number",min:0,value:4},billboard:!1,_pathType:null,getPath:{type:"accessor",value:e=>e.path},getColor:{type:"accessor",value:e8},getWidth:{type:"accessor",value:1},rounded:{deprecatedFor:["jointRounded","capRounded"]}},e9.layerName="PathLayer";var te=e9,tt=i(7673),ti=i(7673),to=i(6463),ts=i(2763),tn=d(i(8425),1),tr=i(3307),ta=tr.WINDING.CLOCKWISE,tl=tr.WINDING.COUNTER_CLOCKWISE,tc={isClosed:!0};function td(e){return"positions"in e?e.positions:e}function tu(e){return"holeIndices"in e?e.holeIndices:null}function tg(e,t,i,o,s){let n=t,r=i.length;for(let t=0;t<r;t++)for(let s=0;s<o;s++)e[n++]=i[t][s]||0;if(!function(e){let t=e[0],i=e[e.length-1];return t[0]===i[0]&&t[1]===i[1]&&t[2]===i[2]}(i))for(let t=0;t<o;t++)e[n++]=i[0][t]||0;return tc.start=t,tc.end=n,tc.size=o,(0,tr.modifyPolygonWindingDirection)(e,s,tc),n}function tp(e,t,i,o,s=0,n,r){let a=(n=n||i.length)-s;if(a<=0)return t;let l=t;for(let t=0;t<a;t++)e[l++]=i[s+t];if(!function(e,t,i,o){for(let s=0;s<t;s++)if(e[i+s]!==e[o-t+s])return!1;return!0}(i,o,s,n))for(let t=0;t<o;t++)e[l++]=i[s+t];return tc.start=t,tc.end=l,tc.size=o,(0,tr.modifyPolygonWindingDirection)(e,r,tc),l}function tf(e,t){var i,o=e;if(!Array.isArray(o=o&&o.positions||o)&&!ArrayBuffer.isView(o))throw Error("invalid polygon");let s=[],n=[];if("positions"in e){let{positions:i,holeIndices:o}=e;if(o){let e=0;for(let r=0;r<=o.length;r++)e=tp(s,e,i,t,o[r-1],o[r],0===r?ta:tl),n.push(e);return n.pop(),{positions:s,holeIndices:n}}e=i}if(!Array.isArray(e[0]))return tp(s,0,e,t,0,s.length,ta),s;if(!((i=e).length>=1&&i[0].length>=2&&Number.isFinite(i[0][0]))){let i=0;for(let[o,r]of e.entries())i=tg(s,i,r,t,0===o?ta:tl),n.push(i);return n.pop(),{positions:s,holeIndices:n}}return tg(s,0,e,t,ta),s}function th(e,t,i){let o=e.length/3,s=0;for(let n=0;n<o;n++){let r=(n+1)%o;s+=e[3*n+t]*e[3*r+i],s-=e[3*r+t]*e[3*n+i]}return Math.abs(s/2)}function tv(e,t,i,o){let s=e.length/3;for(let n=0;n<s;n++){let s=3*n,r=e[s+0],a=e[s+1],l=e[s+2];e[s+t]=r,e[s+i]=a,e[s+o]=l}}var tm=i(7673),ty=i(3307),tx=class extends tm.Tesselator{constructor(e){let{fp64:t,IndexType:i=Uint32Array}=e;super({...e,attributes:{positions:{size:3,type:t?Float64Array:Float32Array},vertexValid:{type:Uint16Array,size:1},indices:{type:i,size:1}}})}get(e){let{attributes:t}=this;return"indices"===e?t.indices&&t.indices.subarray(0,this.vertexCount):t[e]}updateGeometry(e){super.updateGeometry(e);let t=this.buffers.indices;if(t)this.vertexCount=(t.value||t).length;else if(this.data&&!this.getGeometry)throw Error("missing indices buffer")}normalizeGeometry(e){if(this.normalize){let t=tf(e,this.positionSize);return this.opts.resolution?(0,ty.cutPolygonByGrid)(td(t),tu(t),{size:this.positionSize,gridResolution:this.opts.resolution,edgeTypes:!0}):this.opts.wrapLongitude?(0,ty.cutPolygonByMercatorBounds)(td(t),tu(t),{size:this.positionSize,maxLatitude:86,edgeTypes:!0}):t}return e}getGeometrySize(e){if(tP(e)){let t=0;for(let i of e)t+=this.getGeometrySize(i);return t}return td(e).length/this.positionSize}getGeometryFromBuffer(e){return this.normalize||!this.buffers.indices?super.getGeometryFromBuffer(e):null}updateGeometryAttributes(e,t){if(e&&tP(e))for(let i of e){let e=this.getGeometrySize(i);t.geometrySize=e,this.updateGeometryAttributes(i,t),t.vertexStart+=e,t.indexStart=this.indexStarts[t.geometryIndex+1]}else this._updateIndices(e,t),this._updatePositions(e,t),this._updateVertexValid(e,t)}_updateIndices(e,{geometryIndex:t,vertexStart:i,indexStart:o}){let{attributes:s,indexStarts:n,typedArrayManager:r}=this,a=s.indices;if(!a||!e)return;let l=o,c=function(e,t,i,o){let s=tu(e);s&&(s=s.map(e=>e/t));let n=td(e),r=o&&3===t;if(i){let e=n.length;n=n.slice();let o=[];for(let s=0;s<e;s+=t){o[0]=n[s],o[1]=n[s+1],r&&(o[2]=n[s+2]);let e=i(o);n[s]=e[0],n[s+1]=e[1],r&&(n[s+2]=e[2])}}if(r){let e=th(n,0,1),t=th(n,0,2),o=th(n,1,2);if(!e&&!t&&!o)return[];e>t&&e>o||(t>o?(i||(n=n.slice()),tv(n,0,2,1)):(i||(n=n.slice()),tv(n,2,0,1)))}return(0,tn.default)(n,s,t)}(e,this.positionSize,this.opts.preproject,this.opts.full3d);a=r.allocate(a,o+c.length,{copy:!0});for(let e=0;e<c.length;e++)a[l++]=c[e]+i;n[t+1]=o+c.length,s.indices=a}_updatePositions(e,{vertexStart:t,geometrySize:i}){let{attributes:{positions:o},positionSize:s}=this;if(!o||!e)return;let n=td(e);for(let e=t,r=0;r<i;e++,r++){let t=n[r*s],i=n[r*s+1],a=s>2?n[r*s+2]:0;o[3*e]=t,o[3*e+1]=i,o[3*e+2]=a}}_updateVertexValid(e,{vertexStart:t,geometrySize:i}){let{positionSize:o}=this,s=this.attributes.vertexValid,n=e&&tu(e);if(e&&e.edgeTypes?s.set(e.edgeTypes,t):s.fill(1,t,t+i),n)for(let e=0;e<n.length;e++)s[t+n[e]/o-1]=0;s[t+i-1]=0}};function tP(e){return Array.isArray(e)&&e.length>0&&!Number.isFinite(e[0])}var t_=`uniform solidPolygonUniforms {
  bool extruded;
  bool isWireframe;
  float elevationScale;
} solidPolygon;
`,tC={name:"solidPolygon",vs:t_,fs:t_,uniformTypes:{extruded:"f32",isWireframe:"f32",elevationScale:"f32"}},tS=`in vec4 fillColors;
in vec4 lineColors;
in vec3 pickingColors;
out vec4 vColor;
struct PolygonProps {
vec3 positions;
vec3 positions64Low;
vec3 normal;
float elevations;
};
vec3 project_offset_normal(vec3 vector) {
if (project.coordinateSystem == COORDINATE_SYSTEM_LNGLAT ||
project.coordinateSystem == COORDINATE_SYSTEM_LNGLAT_OFFSETS) {
return normalize(vector * project.commonUnitsPerWorldUnit);
}
return project_normal(vector);
}
void calculatePosition(PolygonProps props) {
vec3 pos = props.positions;
vec3 pos64Low = props.positions64Low;
vec3 normal = props.normal;
vec4 colors = solidPolygon.isWireframe ? lineColors : fillColors;
geometry.worldPosition = props.positions;
geometry.pickingColor = pickingColors;
if (solidPolygon.extruded) {
pos.z += props.elevations * solidPolygon.elevationScale;
}
gl_Position = project_position_to_clipspace(pos, pos64Low, vec3(0.), geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
if (solidPolygon.extruded) {
#ifdef IS_SIDE_VERTEX
normal = project_offset_normal(normal);
#else
normal = project_normal(normal);
#endif
geometry.normal = normal;
vec3 lightColor = lighting_getLightColor(colors.rgb, project.cameraPosition, geometry.position.xyz, geometry.normal);
vColor = vec4(lightColor, colors.a * layer.opacity);
} else {
vColor = vec4(colors.rgb, colors.a * layer.opacity);
}
DECKGL_FILTER_COLOR(vColor, geometry);
}
`,tL=`#version 300 es
#define SHADER_NAME solid-polygon-layer-vertex-shader
in vec3 vertexPositions;
in vec3 vertexPositions64Low;
in float elevations;
${tS}
void main(void) {
PolygonProps props;
props.positions = vertexPositions;
props.positions64Low = vertexPositions64Low;
props.elevations = elevations;
props.normal = vec3(0.0, 0.0, 1.0);
calculatePosition(props);
}
`,tb=`#version 300 es
#define SHADER_NAME solid-polygon-layer-vertex-shader-side
#define IS_SIDE_VERTEX
in vec2 positions;
in vec3 vertexPositions;
in vec3 nextVertexPositions;
in vec3 vertexPositions64Low;
in vec3 nextVertexPositions64Low;
in float elevations;
in float instanceVertexValid;
${tS}
void main(void) {
if(instanceVertexValid < 0.5){
gl_Position = vec4(0.);
return;
}
PolygonProps props;
vec3 pos;
vec3 pos64Low;
vec3 nextPos;
vec3 nextPos64Low;
#if RING_WINDING_ORDER_CW == 1
pos = vertexPositions;
pos64Low = vertexPositions64Low;
nextPos = nextVertexPositions;
nextPos64Low = nextVertexPositions64Low;
#else
pos = nextVertexPositions;
pos64Low = nextVertexPositions64Low;
nextPos = vertexPositions;
nextPos64Low = vertexPositions64Low;
#endif
props.positions = mix(pos, nextPos, positions.x);
props.positions64Low = mix(pos64Low, nextPos64Low, positions.x);
props.normal = vec3(
pos.y - nextPos.y + (pos64Low.y - nextPos64Low.y),
nextPos.x - pos.x + (nextPos64Low.x - pos64Low.x),
0.0);
props.elevations = elevations * positions.y;
calculatePosition(props);
}
`,tw=`#version 300 es
#define SHADER_NAME solid-polygon-layer-fragment-shader
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main(void) {
fragColor = vColor;
geometry.uv = vec2(0.);
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,tI=[0,0,0,255],tT={enter:(e,t)=>t.length?t.subarray(t.length-e.length):e},tM=class extends ti.Layer{getShaders(e){return super.getShaders({vs:"top"===e?tL:tb,fs:tw,defines:{RING_WINDING_ORDER_CW:this.props._normalize||"CCW"!==this.props._windingOrder?1:0},modules:[ti.project32,ts.gouraudMaterial,ti.picking,tC]})}get wrapLongitude(){return!1}getBounds(){var e;return null==(e=this.getAttributeManager())?void 0:e.getBounds(["vertexPositions"])}initializeState(){let e,{viewport:t}=this.context,{coordinateSystem:i}=this.props,{_full3d:o}=this.props;t.isGeospatial&&i===ti.COORDINATE_SYSTEM.DEFAULT&&(i=ti.COORDINATE_SYSTEM.LNGLAT),i===ti.COORDINATE_SYSTEM.LNGLAT&&(e=o?t.projectPosition.bind(t):t.projectFlat.bind(t)),this.setState({numInstances:0,polygonTesselator:new tx({preproject:e,fp64:this.use64bitPositions(),IndexType:Uint32Array})});let s=this.getAttributeManager();s.remove(["instancePickingColors"]),s.add({indices:{size:1,isIndexed:!0,update:this.calculateIndices,noAlloc:!0},vertexPositions:{size:3,type:"float64",stepMode:"dynamic",fp64:this.use64bitPositions(),transition:tT,accessor:"getPolygon",update:this.calculatePositions,noAlloc:!0,shaderAttributes:{nextVertexPositions:{vertexOffset:1}}},instanceVertexValid:{size:1,type:"uint16",stepMode:"instance",update:this.calculateVertexValid,noAlloc:!0},elevations:{size:1,stepMode:"dynamic",transition:tT,accessor:"getElevation"},fillColors:{size:this.props.colorFormat.length,type:"unorm8",stepMode:"dynamic",transition:tT,accessor:"getFillColor",defaultValue:tI},lineColors:{size:this.props.colorFormat.length,type:"unorm8",stepMode:"dynamic",transition:tT,accessor:"getLineColor",defaultValue:tI},pickingColors:{size:4,type:"uint8",stepMode:"dynamic",accessor:(e,{index:t,target:i})=>this.encodePickingColor(e&&e.__source?e.__source.index:t,i)}})}getPickingInfo(e){let t=super.getPickingInfo(e),{index:i}=t,o=this.props.data;return o[0]&&o[0].__source&&(t.object=o.find(e=>e.__source.index===i)),t}disablePickingIndex(e){let t=this.props.data;if(t[0]&&t[0].__source)for(let i=0;i<t.length;i++)t[i].__source.index===e&&this._disablePickingIndex(i);else super.disablePickingIndex(e)}draw({uniforms:e}){let{extruded:t,filled:i,wireframe:o,elevationScale:s}=this.props,{topModel:n,sideModel:r,wireframeModel:a,polygonTesselator:l}=this.state,c={extruded:!!t,elevationScale:s,isWireframe:!1};a&&o&&(a.setInstanceCount(l.instanceCount-1),a.shaderInputs.setProps({solidPolygon:{...c,isWireframe:!0}}),a.draw(this.context.renderPass)),r&&i&&(r.setInstanceCount(l.instanceCount-1),r.shaderInputs.setProps({solidPolygon:c}),r.draw(this.context.renderPass)),n&&i&&(n.setVertexCount(l.vertexCount),n.shaderInputs.setProps({solidPolygon:c}),n.draw(this.context.renderPass))}updateState(e){var t;super.updateState(e),this.updateGeometry(e);let{props:i,oldProps:o,changeFlags:s}=e,n=this.getAttributeManager();(s.extensionsChanged||i.filled!==o.filled||i.extruded!==o.extruded)&&(null==(t=this.state.models)||t.forEach(e=>e.destroy()),this.setState(this._getModels()),n.invalidateAll())}updateGeometry({props:e,oldProps:t,changeFlags:i}){if(i.dataChanged||i.updateTriggersChanged&&(i.updateTriggersChanged.all||i.updateTriggersChanged.getPolygon)){let{polygonTesselator:t}=this.state,o=e.data.attributes||{};t.updateGeometry({data:e.data,normalize:e._normalize,geometryBuffer:o.getPolygon,buffers:o,getGeometry:e.getPolygon,positionFormat:e.positionFormat,wrapLongitude:e.wrapLongitude,resolution:this.context.viewport.resolution,fp64:this.use64bitPositions(),dataChanged:i.dataChanged,full3d:e._full3d}),this.setState({numInstances:t.instanceCount,startIndices:t.vertexStarts}),i.dataChanged||this.getAttributeManager().invalidateAll()}}_getModels(){let e,t,i,{id:o,filled:s,extruded:n}=this.props;if(s){let t=this.getShaders("top");t.defines.NON_INSTANCED_MODEL=1;let i=this.getAttributeManager().getBufferLayouts({isInstanced:!1});e=new to.Model(this.context.device,{...t,id:`${o}-top`,topology:"triangle-list",bufferLayout:i,isIndexed:!0,userData:{excludeAttributes:{instanceVertexValid:!0}}})}if(n){let e=this.getAttributeManager().getBufferLayouts({isInstanced:!0});t=new to.Model(this.context.device,{...this.getShaders("side"),id:`${o}-side`,bufferLayout:e,geometry:new to.Geometry({topology:"triangle-strip",attributes:{positions:{size:2,value:new Float32Array([1,0,0,0,1,1,0,1])}}}),isInstanced:!0,userData:{excludeAttributes:{indices:!0}}}),i=new to.Model(this.context.device,{...this.getShaders("side"),id:`${o}-wireframe`,bufferLayout:e,geometry:new to.Geometry({topology:"line-strip",attributes:{positions:{size:2,value:new Float32Array([1,0,0,0,0,1,1,1])}}}),isInstanced:!0,userData:{excludeAttributes:{indices:!0}}})}return{models:[t,i,e].filter(Boolean),topModel:e,sideModel:t,wireframeModel:i}}calculateIndices(e){let{polygonTesselator:t}=this.state;e.startIndices=t.indexStarts,e.value=t.get("indices")}calculatePositions(e){let{polygonTesselator:t}=this.state;e.startIndices=t.vertexStarts,e.value=t.get("positions")}calculateVertexValid(e){e.value=this.state.polygonTesselator.get("vertexValid")}};tM.defaultProps={filled:!0,extruded:!1,wireframe:!1,_normalize:!0,_windingOrder:"CW",_full3d:!1,elevationScale:{type:"number",min:0,value:1},getPolygon:{type:"accessor",value:e=>e.polygon},getElevation:{type:"accessor",value:1e3},getFillColor:{type:"accessor",value:tI},getLineColor:{type:"accessor",value:tI},material:!0},tM.layerName="SolidPolygonLayer";var tE=tM;function tA({data:e,getIndex:t,dataRange:i,replace:o}){let{startRow:s=0,endRow:n=1/0}=i,r=e.length,a=r,l=r;for(let i=0;i<r;i++){let o=t(e[i]);if(a>i&&o>=s&&(a=i),o>=n){l=i;break}}let c=a,d=l-a!==o.length?e.slice(l):void 0;for(let t=0;t<o.length;t++)e[c++]=o[t];if(d){for(let t=0;t<d.length;t++)e[c++]=d[t];e.length=c}return{startRow:a,endRow:a+o.length}}var tz=[0,0,0,255],tR={stroked:!0,filled:!0,extruded:!1,elevationScale:1,wireframe:!1,_normalize:!0,_windingOrder:"CW",lineWidthUnits:"meters",lineWidthScale:1,lineWidthMinPixels:0,lineWidthMaxPixels:Number.MAX_SAFE_INTEGER,lineJointRounded:!1,lineMiterLimit:4,getPolygon:{type:"accessor",value:e=>e.polygon},getFillColor:{type:"accessor",value:[0,0,0,255]},getLineColor:{type:"accessor",value:tz},getLineWidth:{type:"accessor",value:1},getElevation:{type:"accessor",value:1e3},material:!0},tO=class extends tt.CompositeLayer{initializeState(){this.state={paths:[],pathsDiff:null},this.props.getLineDashArray&&tt.log.removed("getLineDashArray","PathStyleExtension")()}updateState({changeFlags:e}){let t=e.dataChanged||e.updateTriggersChanged&&(e.updateTriggersChanged.all||e.updateTriggersChanged.getPolygon);if(t&&Array.isArray(e.dataChanged)){let t=this.state.paths.slice(),i=e.dataChanged.map(e=>tA({data:t,getIndex:e=>e.__source.index,dataRange:e,replace:this._getPaths(e)}));this.setState({paths:t,pathsDiff:i})}else t&&this.setState({paths:this._getPaths(),pathsDiff:null})}_getPaths(e={}){let{data:t,getPolygon:i,positionFormat:o,_normalize:s}=this.props,n=[],r="XY"===o?2:3,{startRow:a,endRow:l}=e,{iterable:c,objectInfo:d}=(0,tt.createIterable)(t,a,l);for(let e of c){d.index++;let t=i(e,d);s&&(t=tf(t,r));let{holeIndices:o}=t,a=t.positions||t;if(o)for(let t=0;t<=o.length;t++){let i=a.slice(o[t-1]||0,o[t]||a.length);n.push(this.getSubLayerRow({path:i},e,d.index))}else n.push(this.getSubLayerRow({path:a},e,d.index))}return n}renderLayers(){let{data:e,_dataDiff:t,stroked:i,filled:o,extruded:s,wireframe:n,_normalize:r,_windingOrder:a,elevationScale:l,transitions:c,positionFormat:d}=this.props,{lineWidthUnits:u,lineWidthScale:g,lineWidthMinPixels:p,lineWidthMaxPixels:f,lineJointRounded:h,lineMiterLimit:v,lineDashJustified:m}=this.props,{getFillColor:y,getLineColor:x,getLineWidth:P,getLineDashArray:_,getElevation:C,getPolygon:S,updateTriggers:L,material:b}=this.props,{paths:w,pathsDiff:I}=this.state,T=this.getSubLayerClass("fill",tE),M=this.getSubLayerClass("stroke",te),E=this.shouldRenderSubLayer("fill",w)&&new T({_dataDiff:t,extruded:s,elevationScale:l,filled:o,wireframe:n,_normalize:r,_windingOrder:a,getElevation:C,getFillColor:y,getLineColor:s&&n?x:tz,material:b,transitions:c},this.getSubLayerProps({id:"fill",updateTriggers:L&&{getPolygon:L.getPolygon,getElevation:L.getElevation,getFillColor:L.getFillColor,lineColors:s&&n,getLineColor:L.getLineColor}}),{data:e,positionFormat:d,getPolygon:S}),A=!s&&i&&this.shouldRenderSubLayer("stroke",w)&&new M({_dataDiff:I&&(()=>I),widthUnits:u,widthScale:g,widthMinPixels:p,widthMaxPixels:f,jointRounded:h,miterLimit:v,dashJustified:m,_pathType:"loop",transitions:c&&{getWidth:c.getLineWidth,getColor:c.getLineColor,getPath:c.getPolygon},getColor:this.getSubLayerAccessor(x),getWidth:this.getSubLayerAccessor(P),getDashArray:this.getSubLayerAccessor(_)},this.getSubLayerProps({id:"stroke",updateTriggers:L&&{getWidth:L.getLineWidth,getColor:L.getLineColor,getDashArray:L.getLineDashArray}}),{data:w,positionFormat:d,getPath:e=>e.path});return[!s&&E,A,s&&E]}};tO.layerName="PolygonLayer",tO.defaultProps=tR;var tF=tO,tk=i(7673),tD=i(7673),tW=i(7673),tG=`uniform sdfUniforms {
  float gamma;
  bool enabled;
  float buffer;
  float outlineBuffer;
  vec4 outlineColor;
} sdf;
`,tN={name:"sdf",vs:tG,fs:tG,uniformTypes:{gamma:"f32",enabled:"f32",buffer:"f32",outlineBuffer:"f32",outlineColor:"vec4<f32>"}},tU=`#version 300 es
#define SHADER_NAME multi-icon-layer-fragment-shader
precision highp float;
uniform sampler2D iconsTexture;
in vec4 vColor;
in vec2 vTextureCoords;
in vec2 uv;
out vec4 fragColor;
void main(void) {
geometry.uv = uv;
if (!bool(picking.isActive)) {
float alpha = texture(iconsTexture, vTextureCoords).a;
vec4 color = vColor;
if (sdf.enabled) {
float distance = alpha;
alpha = smoothstep(sdf.buffer - sdf.gamma, sdf.buffer + sdf.gamma, distance);
if (sdf.outlineBuffer > 0.0) {
float inFill = alpha;
float inBorder = smoothstep(sdf.outlineBuffer - sdf.gamma, sdf.outlineBuffer + sdf.gamma, distance);
color = mix(sdf.outlineColor, vColor, inFill);
alpha = inBorder;
}
}
float a = alpha * color.a;
if (a < icon.alphaCutoff) {
discard;
}
fragColor = vec4(color.rgb, a * layer.opacity);
}
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,tB=[],tj=class extends Q{getShaders(){let e=super.getShaders();return{...e,modules:[...e.modules,tN],fs:tU}}initializeState(){super.initializeState(),this.getAttributeManager().addInstanced({instanceOffsets:{size:2,accessor:"getIconOffsets"},instancePickingColors:{type:"uint8",size:3,accessor:(e,{index:t,target:i})=>this.encodePickingColor(t,i)}})}updateState(e){super.updateState(e);let{props:t,oldProps:i}=e,{outlineColor:o}=t;o!==i.outlineColor&&((o=o.map(e=>e/255))[3]=Number.isFinite(o[3])?o[3]:1,this.setState({outlineColor:o})),!t.sdf&&t.outlineWidth&&tW.log.warn(`${this.id}: fontSettings.sdf is required to render outline`)()}draw(e){let{sdf:t,smoothing:i,outlineWidth:o}=this.props,{outlineColor:s}=this.state,n=o?Math.max(i,.75*(1-o)):-1,r=this.state.model,a={buffer:.75,outlineBuffer:n,gamma:i,enabled:!!t,outlineColor:s};if(r.shaderInputs.setProps({sdf:a}),super.draw(e),t&&o){let{iconManager:e}=this.state;e.getTexture()&&(r.shaderInputs.setProps({sdf:{...a,outlineBuffer:.75}}),r.draw(this.context.renderPass))}}getInstanceOffset(e){return e?Array.from(e).flatMap(e=>super.getInstanceOffset(e)):tB}getInstanceColorMode(e){return 1}getInstanceIconFrame(e){return e?Array.from(e).flatMap(e=>super.getInstanceIconFrame(e)):tB}};tj.defaultProps={getIconOffsets:{type:"accessor",value:e=>e.offsets},alphaCutoff:.001,smoothing:.1,outlineWidth:0,outlineColor:{type:"color",value:[0,0,0,255]}},tj.layerName="MultiIconLayer";var tV=tj,tH=d(i(5768),1),tK=i(7673),tZ=i(7673),t$=[];function tJ(e,t,i,o){var s;let n=0;for(let r=t;r<i;r++)n+=(null==(s=o[e[r]])?void 0:s.layoutWidth)||0;return n}function tX(e,t,i,o,s,n){let r=t,a=0;for(let l=t;l<i;l++){let t=tJ(e,l,l+1,s);a+t>o&&(r<l&&n.push(l),r=l,a=0),a+=t}return a}var tq=class{constructor(e=5){this._cache={},this._order=[],this.limit=e}get(e){let t=this._cache[e];return t&&(this._deleteOrder(e),this._appendOrder(e)),t}set(e,t){this._cache[e]?this.delete(e):Object.keys(this._cache).length===this.limit&&this.delete(this._order[0]),this._cache[e]=t,this._appendOrder(e)}delete(e){this._cache[e]&&(delete this._cache[e],this._deleteOrder(e))}_deleteOrder(e){let t=this._order.indexOf(e);t>=0&&this._order.splice(t,1)}_appendOrder(e){this._order.push(e)}},tY={fontFamily:"Monaco, monospace",fontWeight:"normal",characterSet:function(){let e=[];for(let t=32;t<128;t++)e.push(String.fromCharCode(t));return e}(),fontSize:64,buffer:4,sdf:!1,cutoff:.25,radius:12,smoothing:.1},tQ=new tq(3);function t0(e,t,i,o){e.font=`${o} ${i}px ${t}`,e.fillStyle="#000",e.textBaseline="alphabetic",e.textAlign="left"}var t3=class{constructor(){this.props={...tY}}get atlas(){return this._atlas}get mapping(){return this._atlas&&this._atlas.mapping}get scale(){let{fontSize:e,buffer:t}=this.props;return(1.2*e+2*t)/e}setProps(e={}){Object.assign(this.props,e),this._key=this._getKey();let t=function(e,t){let i;i=new Set("string"==typeof t?Array.from(t):t);let o=tQ.get(e);if(!o)return i;for(let e in o.mapping)i.has(e)&&i.delete(e);return i}(this._key,this.props.characterSet),i=tQ.get(this._key);if(i&&0===t.size){this._atlas!==i&&(this._atlas=i);return}let o=this._generateFontAtlas(t,i);this._atlas=o,tQ.set(this._key,o)}_generateFontAtlas(e,t){let{fontFamily:i,fontWeight:o,fontSize:s,buffer:n,sdf:r,radius:a,cutoff:l}=this.props,c=t&&t.data;c||((c=document.createElement("canvas")).width=1024);let d=c.getContext("2d",{willReadFrequently:!0});t0(d,i,s,o);let{mapping:u,canvasHeight:g,xOffset:p,yOffset:f}=function({characterSet:e,getFontWidth:t,fontHeight:i,buffer:o,maxCanvasWidth:s,mapping:n={},xOffset:r=0,yOffset:a=0}){let l=0,c=r,d=i+2*o;for(let r of e)if(!n[r]){let e=t(r);c+e+2*o>s&&(c=0,l++),n[r]={x:c+o,y:a+l*d+o,width:e,height:d,layoutWidth:e,layoutHeight:i},c+=e+2*o}return{mapping:n,xOffset:c,yOffset:a+l*d,canvasHeight:Math.pow(2,Math.ceil(Math.log2(a+(l+1)*d)))}}({getFontWidth:e=>d.measureText(e).width,fontHeight:1.2*s,buffer:n,characterSet:e,maxCanvasWidth:1024,...t&&{mapping:t.mapping,xOffset:t.xOffset,yOffset:t.yOffset}});if(c.height!==g){let e=d.getImageData(0,0,c.width,c.height);c.height=g,d.putImageData(e,0,0)}if(t0(d,i,s,o),r){let t=new tH.default({fontSize:s,buffer:n,radius:a,cutoff:l,fontFamily:i,fontWeight:`${o}`});for(let i of e){let{data:e,width:o,height:n,glyphTop:r}=t.draw(i);u[i].width=o,u[i].layoutOffsetY=.9*s-r;let a=d.createImageData(o,n);for(let t=0;t<e.length;t++)a.data[4*t+3]=e[t];d.putImageData(a,u[i].x,u[i].y)}}else for(let t of e)d.fillText(t,u[t].x,u[t].y+n+.9*s);return{xOffset:p,yOffset:f,mapping:u,data:c,width:c.width,height:c.height}}_getKey(){let{fontFamily:e,fontWeight:t,fontSize:i,buffer:o,sdf:s,radius:n,cutoff:r}=this.props;return s?`${e} ${t} ${i} ${o} ${n} ${r}`:`${e} ${t} ${i} ${o}`}},t2=i(7673),t1=i(6463),t4=i(6463),t6=`uniform textBackgroundUniforms {
  bool billboard;
  float sizeScale;
  float sizeMinPixels;
  float sizeMaxPixels;
  vec4 borderRadius;
  vec4 padding;
  highp int sizeUnits;
  bool stroked;
} textBackground;
`,t5={name:"textBackground",vs:t6,fs:t6,uniformTypes:{billboard:"f32",sizeScale:"f32",sizeMinPixels:"f32",sizeMaxPixels:"f32",borderRadius:"vec4<f32>",padding:"vec4<f32>",sizeUnits:"i32",stroked:"f32"}},t8=`#version 300 es
#define SHADER_NAME text-background-layer-vertex-shader
in vec2 positions;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in vec4 instanceRects;
in float instanceSizes;
in float instanceAngles;
in vec2 instancePixelOffsets;
in float instanceLineWidths;
in vec4 instanceFillColors;
in vec4 instanceLineColors;
in vec3 instancePickingColors;
out vec4 vFillColor;
out vec4 vLineColor;
out float vLineWidth;
out vec2 uv;
out vec2 dimensions;
vec2 rotate_by_angle(vec2 vertex, float angle) {
float angle_radian = radians(angle);
float cos_angle = cos(angle_radian);
float sin_angle = sin(angle_radian);
mat2 rotationMatrix = mat2(cos_angle, -sin_angle, sin_angle, cos_angle);
return rotationMatrix * vertex;
}
void main(void) {
geometry.worldPosition = instancePositions;
geometry.uv = positions;
geometry.pickingColor = instancePickingColors;
uv = positions;
vLineWidth = instanceLineWidths;
float sizePixels = clamp(
project_size_to_pixel(instanceSizes * textBackground.sizeScale, textBackground.sizeUnits),
textBackground.sizeMinPixels, textBackground.sizeMaxPixels
);
dimensions = instanceRects.zw * sizePixels + textBackground.padding.xy + textBackground.padding.zw;
vec2 pixelOffset = (positions * instanceRects.zw + instanceRects.xy) * sizePixels + mix(-textBackground.padding.xy, textBackground.padding.zw, positions);
pixelOffset = rotate_by_angle(pixelOffset, instanceAngles);
pixelOffset += instancePixelOffsets;
pixelOffset.y *= -1.0;
if (textBackground.billboard)  {
gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
vec3 offset = vec3(pixelOffset, 0.0);
DECKGL_FILTER_SIZE(offset, geometry);
gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
} else {
vec3 offset_common = vec3(project_pixel_size(pixelOffset), 0.0);
DECKGL_FILTER_SIZE(offset_common, geometry);
gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset_common, geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
}
vFillColor = vec4(instanceFillColors.rgb, instanceFillColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vFillColor, geometry);
vLineColor = vec4(instanceLineColors.rgb, instanceLineColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vLineColor, geometry);
}
`,t7=`#version 300 es
#define SHADER_NAME text-background-layer-fragment-shader
precision highp float;
in vec4 vFillColor;
in vec4 vLineColor;
in float vLineWidth;
in vec2 uv;
in vec2 dimensions;
out vec4 fragColor;
float round_rect(vec2 p, vec2 size, vec4 radii) {
vec2 pixelPositionCB = (p - 0.5) * size;
vec2 sizeCB = size * 0.5;
float maxBorderRadius = min(size.x, size.y) * 0.5;
vec4 borderRadius = vec4(min(radii, maxBorderRadius));
borderRadius.xy =
(pixelPositionCB.x > 0.0) ? borderRadius.xy : borderRadius.zw;
borderRadius.x = (pixelPositionCB.y > 0.0) ? borderRadius.x : borderRadius.y;
vec2 q = abs(pixelPositionCB) - sizeCB + borderRadius.x;
return -(min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - borderRadius.x);
}
float rect(vec2 p, vec2 size) {
vec2 pixelPosition = p * size;
return min(min(pixelPosition.x, size.x - pixelPosition.x),
min(pixelPosition.y, size.y - pixelPosition.y));
}
vec4 get_stroked_fragColor(float dist) {
float isBorder = smoothedge(dist, vLineWidth);
return mix(vFillColor, vLineColor, isBorder);
}
void main(void) {
geometry.uv = uv;
if (textBackground.borderRadius != vec4(0.0)) {
float distToEdge = round_rect(uv, dimensions, textBackground.borderRadius);
if (textBackground.stroked) {
fragColor = get_stroked_fragColor(distToEdge);
} else {
fragColor = vFillColor;
}
float shapeAlpha = smoothedge(-distToEdge, 0.0);
fragColor.a *= shapeAlpha;
} else {
if (textBackground.stroked) {
float distToEdge = rect(uv, dimensions);
fragColor = get_stroked_fragColor(distToEdge);
} else {
fragColor = vFillColor;
}
}
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,t9=class extends t2.Layer{getShaders(){return super.getShaders({vs:t8,fs:t7,modules:[t2.project32,t2.picking,t5]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceSizes:{size:1,transition:!0,accessor:"getSize",defaultValue:1},instanceAngles:{size:1,transition:!0,accessor:"getAngle"},instanceRects:{size:4,accessor:"getBoundingRect"},instancePixelOffsets:{size:2,transition:!0,accessor:"getPixelOffset"},instanceFillColors:{size:4,transition:!0,type:"unorm8",accessor:"getFillColor",defaultValue:[0,0,0,255]},instanceLineColors:{size:4,transition:!0,type:"unorm8",accessor:"getLineColor",defaultValue:[0,0,0,255]},instanceLineWidths:{size:1,transition:!0,accessor:"getLineWidth",defaultValue:1}})}updateState(e){var t;super.updateState(e);let{changeFlags:i}=e;i.extensionsChanged&&(null==(t=this.state.model)||t.destroy(),this.state.model=this._getModel(),this.getAttributeManager().invalidateAll())}draw({uniforms:e}){let{billboard:t,sizeScale:i,sizeUnits:o,sizeMinPixels:s,sizeMaxPixels:n,getLineWidth:r}=this.props,{padding:a,borderRadius:l}=this.props;a.length<4&&(a=[a[0],a[1],a[0],a[1]]),Array.isArray(l)||(l=[l,l,l,l]);let c=this.state.model,d={billboard:t,stroked:!!r,borderRadius:l,padding:a,sizeUnits:t2.UNIT[o],sizeScale:i,sizeMinPixels:s,sizeMaxPixels:n};c.shaderInputs.setProps({textBackground:d}),c.draw(this.context.renderPass)}_getModel(){return new t4.Model(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new t1.Geometry({topology:"triangle-strip",vertexCount:4,attributes:{positions:{size:2,value:new Float32Array([0,0,1,0,0,1,1,1])}}}),isInstanced:!0})}};t9.defaultProps={billboard:!0,sizeScale:1,sizeUnits:"pixels",sizeMinPixels:0,sizeMaxPixels:Number.MAX_SAFE_INTEGER,borderRadius:{type:"object",value:0},padding:{type:"array",value:[0,0,0,0]},getPosition:{type:"accessor",value:e=>e.position},getSize:{type:"accessor",value:1},getAngle:{type:"accessor",value:0},getPixelOffset:{type:"accessor",value:[0,0]},getBoundingRect:{type:"accessor",value:[0,0,0,0]},getFillColor:{type:"accessor",value:[0,0,0,255]},getLineColor:{type:"accessor",value:[0,0,0,255]},getLineWidth:{type:"accessor",value:1}},t9.layerName="TextBackgroundLayer";var ie=t9,it={start:1,middle:0,end:-1},ii={top:1,center:0,bottom:-1},io=[0,0,0,255],is={billboard:!0,sizeScale:1,sizeUnits:"pixels",sizeMinPixels:0,sizeMaxPixels:Number.MAX_SAFE_INTEGER,background:!1,getBackgroundColor:{type:"accessor",value:[255,255,255,255]},getBorderColor:{type:"accessor",value:io},getBorderWidth:{type:"accessor",value:0},backgroundBorderRadius:{type:"object",value:0},backgroundPadding:{type:"array",value:[0,0,0,0]},characterSet:{type:"object",value:tY.characterSet},fontFamily:tY.fontFamily,fontWeight:tY.fontWeight,lineHeight:1,outlineWidth:{type:"number",value:0,min:0},outlineColor:{type:"color",value:io},fontSettings:{type:"object",value:{},compare:1},wordBreak:"break-word",maxWidth:{type:"number",value:-1},getText:{type:"accessor",value:e=>e.text},getPosition:{type:"accessor",value:e=>e.position},getColor:{type:"accessor",value:io},getSize:{type:"accessor",value:32},getAngle:{type:"accessor",value:0},getTextAnchor:{type:"accessor",value:"middle"},getAlignmentBaseline:{type:"accessor",value:"center"},getPixelOffset:{type:"accessor",value:[0,0]},backgroundColor:{deprecatedFor:["background","getBackgroundColor"]}},ir=class extends tD.CompositeLayer{constructor(){super(...arguments),this.getBoundingRect=(e,t)=>{let{size:[i,o]}=this.transformParagraph(e,t),{fontSize:s}=this.state.fontAtlasManager.props;i/=s,o/=s;let{getTextAnchor:n,getAlignmentBaseline:r}=this.props;return[(it["function"==typeof n?n(e,t):n]-1)*i/2,(ii["function"==typeof r?r(e,t):r]-1)*o/2,i,o]},this.getIconOffsets=(e,t)=>{let{getTextAnchor:i,getAlignmentBaseline:o}=this.props,{x:s,y:n,rowWidth:r,size:[a,l]}=this.transformParagraph(e,t),c=it["function"==typeof i?i(e,t):i],d=ii["function"==typeof o?o(e,t):o],u=s.length,g=Array(2*u),p=0;for(let e=0;e<u;e++){let t=(1-c)*(a-r[e])/2;g[p++]=(c-1)*a/2+t+s[e],g[p++]=(d-1)*l/2+n[e]}return g}}initializeState(){this.state={styleVersion:0,fontAtlasManager:new t3},this.props.maxWidth>0&&tD.log.once(1,"v8.9 breaking change: TextLayer maxWidth is now relative to text size")()}updateState(e){let{props:t,oldProps:i,changeFlags:o}=e;(o.dataChanged||o.updateTriggersChanged&&(o.updateTriggersChanged.all||o.updateTriggersChanged.getText))&&this._updateText(),(this._updateFontAtlas()||t.lineHeight!==i.lineHeight||t.wordBreak!==i.wordBreak||t.maxWidth!==i.maxWidth)&&this.setState({styleVersion:this.state.styleVersion+1})}getPickingInfo({info:e}){return e.object=e.index>=0?this.props.data[e.index]:null,e}_updateFontAtlas(){let{fontSettings:e,fontFamily:t,fontWeight:i}=this.props,{fontAtlasManager:o,characterSet:s}=this.state,n={...e,characterSet:s,fontFamily:t,fontWeight:i};if(!o.mapping)return o.setProps(n),!0;for(let e in n)if(n[e]!==o.props[e])return o.setProps(n),!0;return!1}_updateText(){var e;let t,{data:i,characterSet:o}=this.props,s=null==(e=i.attributes)?void 0:e.getText,{getText:n}=this.props,r=i.startIndices,a="auto"===o&&new Set;if(s&&r){let{texts:e,characterCount:o}=function({value:e,length:t,stride:i,offset:o,startIndices:s,characterSet:n}){let r=e.BYTES_PER_ELEMENT,a=i?i/r:1,l=o?o/r:0,c=s[t]||Math.ceil((e.length-l)/a),d=n&&new Set,u=Array(t),g=e;if(a>1||l>0){g=new e.constructor(c);for(let t=0;t<c;t++)g[t]=e[t*a+l]}for(let e=0;e<t;e++){let t=s[e],i=s[e+1]||c,o=g.subarray(t,i);u[e]=String.fromCodePoint.apply(null,o),d&&o.forEach(d.add,d)}if(d)for(let e of d)n.add(String.fromCodePoint(e));return{texts:u,characterCount:c}}({...ArrayBuffer.isView(s)?{value:s}:s,length:i.length,startIndices:r,characterSet:a});t=o,n=(t,{index:i})=>e[i]}else{let{iterable:e,objectInfo:o}=(0,tD.createIterable)(i);for(let i of(r=[0],t=0,e)){o.index++;let e=Array.from(n(i,o)||"");a&&e.forEach(a.add,a),t+=e.length,r.push(t)}}this.setState({getText:n,startIndices:r,numInstances:t,characterSet:a||o})}transformParagraph(e,t){let{fontAtlasManager:i}=this.state,o=i.mapping,s=this.state.getText,{wordBreak:n,lineHeight:r,maxWidth:a}=this.props;return function(e,t,i,o,s){var n;let r=Array.from(e),a=r.length,l=Array(a),c=Array(a),d=Array(a),u=("break-word"===i||"break-all"===i)&&isFinite(o)&&o>0,g=[0,0],p=[0,0],f=0,h=0,v=0;for(let e=0;e<=a;e++){let m=r[e];if(("\n"===m||e===a)&&(v=e),v>h){let e=u?function(e,t,i,o,s=0,n){void 0===n&&(n=e.length);let r=[];return"break-all"===t?tX(e,s,n,i,o,r):!function(e,t,i,o,s,n){let r=t,a=t,l=t,c=0;for(let d=t;d<i;d++)if(" "===e[d]?l=d+1:(" "===e[d+1]||d+1===i)&&(l=d+1),l>a){let t=tJ(e,a,l,s);c+t>o&&(r<a&&(n.push(a),r=a,c=0),t>o&&(t=tX(e,a,l,o,s,n),r=n[n.length-1])),a=l,c+=t}}(e,s,n,i,o,r),r}(r,i,o,s,h,v):t$;for(let i=0;i<=e.length;i++){let o=0===i?h:e[i-1],a=i<e.length?e[i]:v;!function(e,t,i,o,s,n){let r=0,a=0;for(let n=t;n<i;n++){let t=e[n],i=o[t];i?(a||(a=i.layoutHeight),s[n]=r+i.layoutWidth/2,r+=i.layoutWidth):(tZ.log.warn(`Missing character: ${t} (${t.codePointAt(0)})`)(),s[n]=r,r+=32)}n[0]=r,n[1]=a}(r,o,a,s,l,p);for(let e=o;e<a;e++){l[e],p[0];let t=(null==(n=s[r[e]])?void 0:n.layoutOffsetY)||0;c[e]=f+p[1]/2+t,d[e]=p[0]}f+=p[1]*t,g[0]=Math.max(g[0],p[0])}h=v}"\n"===m&&(l[h]=0,c[h]=0,d[h]=0,h++)}return g[1]=f,{x:l,y:c,rowWidth:d,size:g}}(s(e,t)||"",r,n,a*i.props.fontSize,o)}renderLayers(){let{startIndices:e,numInstances:t,getText:i,fontAtlasManager:{scale:o,atlas:s,mapping:n},styleVersion:r}=this.state,{data:a,_dataDiff:l,getPosition:c,getColor:d,getSize:u,getAngle:g,getPixelOffset:p,getBackgroundColor:f,getBorderColor:h,getBorderWidth:v,backgroundBorderRadius:m,backgroundPadding:y,background:x,billboard:P,fontSettings:_,outlineWidth:C,outlineColor:S,sizeScale:L,sizeUnits:b,sizeMinPixels:w,sizeMaxPixels:I,transitions:T,updateTriggers:M}=this.props,E=this.getSubLayerClass("characters",tV),A=this.getSubLayerClass("background",ie);return[x&&new A({getFillColor:f,getLineColor:h,getLineWidth:v,borderRadius:m,padding:y,getPosition:c,getSize:u,getAngle:g,getPixelOffset:p,billboard:P,sizeScale:L,sizeUnits:b,sizeMinPixels:w,sizeMaxPixels:I,transitions:T&&{getPosition:T.getPosition,getAngle:T.getAngle,getSize:T.getSize,getFillColor:T.getBackgroundColor,getLineColor:T.getBorderColor,getLineWidth:T.getBorderWidth,getPixelOffset:T.getPixelOffset}},this.getSubLayerProps({id:"background",updateTriggers:{getPosition:M.getPosition,getAngle:M.getAngle,getSize:M.getSize,getFillColor:M.getBackgroundColor,getLineColor:M.getBorderColor,getLineWidth:M.getBorderWidth,getPixelOffset:M.getPixelOffset,getBoundingRect:{getText:M.getText,getTextAnchor:M.getTextAnchor,getAlignmentBaseline:M.getAlignmentBaseline,styleVersion:r}}}),{data:a.attributes&&a.attributes.background?{length:a.length,attributes:a.attributes.background}:a,_dataDiff:l,autoHighlight:!1,getBoundingRect:this.getBoundingRect}),new E({sdf:_.sdf,smoothing:Number.isFinite(_.smoothing)?_.smoothing:tY.smoothing,outlineWidth:C/(_.radius||tY.radius),outlineColor:S,iconAtlas:s,iconMapping:n,getPosition:c,getColor:d,getSize:u,getAngle:g,getPixelOffset:p,billboard:P,sizeScale:L*o,sizeUnits:b,sizeMinPixels:w*o,sizeMaxPixels:I*o,transitions:T&&{getPosition:T.getPosition,getAngle:T.getAngle,getColor:T.getColor,getSize:T.getSize,getPixelOffset:T.getPixelOffset}},this.getSubLayerProps({id:"characters",updateTriggers:{all:M.getText,getPosition:M.getPosition,getAngle:M.getAngle,getColor:M.getColor,getSize:M.getSize,getPixelOffset:M.getPixelOffset,getIconOffsets:{getTextAnchor:M.getTextAnchor,getAlignmentBaseline:M.getAlignmentBaseline,styleVersion:r}}}),{data:a,_dataDiff:l,startIndices:e,numInstances:t,getIconOffsets:this.getIconOffsets,getIcon:i})]}static set fontAtlasCacheLimit(e){tK.log.assert(Number.isFinite(e)&&e>=3,"Invalid cache limit"),tQ=new tq(e)}};ir.defaultProps=is,ir.layerName="TextLayer";var ia=ir,il={circle:{type:eE,props:{filled:"filled",stroked:"stroked",lineWidthMaxPixels:"lineWidthMaxPixels",lineWidthMinPixels:"lineWidthMinPixels",lineWidthScale:"lineWidthScale",lineWidthUnits:"lineWidthUnits",pointRadiusMaxPixels:"radiusMaxPixels",pointRadiusMinPixels:"radiusMinPixels",pointRadiusScale:"radiusScale",pointRadiusUnits:"radiusUnits",pointAntialiasing:"antialiasing",pointBillboard:"billboard",getFillColor:"getFillColor",getLineColor:"getLineColor",getLineWidth:"getLineWidth",getPointRadius:"getRadius"}},icon:{type:Q,props:{iconAtlas:"iconAtlas",iconMapping:"iconMapping",iconSizeMaxPixels:"sizeMaxPixels",iconSizeMinPixels:"sizeMinPixels",iconSizeScale:"sizeScale",iconSizeUnits:"sizeUnits",iconAlphaCutoff:"alphaCutoff",iconBillboard:"billboard",getIcon:"getIcon",getIconAngle:"getAngle",getIconColor:"getColor",getIconPixelOffset:"getPixelOffset",getIconSize:"getSize"}},text:{type:ia,props:{textSizeMaxPixels:"sizeMaxPixels",textSizeMinPixels:"sizeMinPixels",textSizeScale:"sizeScale",textSizeUnits:"sizeUnits",textBackground:"background",textBackgroundPadding:"backgroundPadding",textFontFamily:"fontFamily",textFontWeight:"fontWeight",textLineHeight:"lineHeight",textMaxWidth:"maxWidth",textOutlineColor:"outlineColor",textOutlineWidth:"outlineWidth",textWordBreak:"wordBreak",textCharacterSet:"characterSet",textBillboard:"billboard",textFontSettings:"fontSettings",getText:"getText",getTextAngle:"getAngle",getTextColor:"getColor",getTextPixelOffset:"getPixelOffset",getTextSize:"getSize",getTextAnchor:"getTextAnchor",getTextAlignmentBaseline:"getAlignmentBaseline",getTextBackgroundColor:"getBackgroundColor",getTextBorderColor:"getBorderColor",getTextBorderWidth:"getBorderWidth"}}},ic={type:te,props:{lineWidthUnits:"widthUnits",lineWidthScale:"widthScale",lineWidthMinPixels:"widthMinPixels",lineWidthMaxPixels:"widthMaxPixels",lineJointRounded:"jointRounded",lineCapRounded:"capRounded",lineMiterLimit:"miterLimit",lineBillboard:"billboard",getLineColor:"getColor",getLineWidth:"getWidth"}},id={type:tE,props:{extruded:"extruded",filled:"filled",wireframe:"wireframe",elevationScale:"elevationScale",material:"material",_full3d:"_full3d",getElevation:"getElevation",getFillColor:"getFillColor",getLineColor:"getLineColor"}};function iu({type:e,props:t}){let i={};for(let o in t)i[o]=e.defaultProps[t[o]];return i}function ig(e,t){let{transitions:i,updateTriggers:o}=e.props,s={updateTriggers:{},transitions:i&&{getPosition:i.geometry}};for(let n in t){let r=t[n],a=e.props[n];n.startsWith("get")&&(a=e.getSubLayerAccessor(a),s.updateTriggers[r]=o[n],i&&(s.transitions[r]=i[n])),s[r]=a}return s}var ip=i(7673);function ih(e,t,i={}){let o={pointFeatures:[],lineFeatures:[],polygonFeatures:[],polygonOutlineFeatures:[]},{startRow:s=0,endRow:n=e.length}=i;for(let i=s;i<n;i++){let s=e[i],{geometry:n}=s;if(n)if("GeometryCollection"===n.type){ip.log.assert(Array.isArray(n.geometries),"GeoJSON does not have geometries array");let{geometries:e}=n;for(let n=0;n<e.length;n++)iv(e[n],o,t,s,i)}else iv(n,o,t,s,i)}return o}function iv(e,t,i,o,s){let{type:n,coordinates:r}=e,{pointFeatures:a,lineFeatures:l,polygonFeatures:c,polygonOutlineFeatures:d}=t;if(!function(e,t){let i=im[e];for(ip.log.assert(i,`Unknown GeoJSON type ${e}`);t&&--i>0;)t=t[0];return t&&Number.isFinite(t[0])}(n,r))return void ip.log.warn(`${n} coordinates are malformed`)();switch(n){case"Point":a.push(i({geometry:e},o,s));break;case"MultiPoint":r.forEach(e=>{a.push(i({geometry:{type:"Point",coordinates:e}},o,s))});break;case"LineString":l.push(i({geometry:e},o,s));break;case"MultiLineString":r.forEach(e=>{l.push(i({geometry:{type:"LineString",coordinates:e}},o,s))});break;case"Polygon":c.push(i({geometry:e},o,s)),r.forEach(e=>{d.push(i({geometry:{type:"LineString",coordinates:e}},o,s))});break;case"MultiPolygon":r.forEach(e=>{c.push(i({geometry:{type:"Polygon",coordinates:e}},o,s)),e.forEach(e=>{d.push(i({geometry:{type:"LineString",coordinates:e}},o,s))})})}}var im={Point:1,MultiPoint:2,LineString:2,MultiLineString:3,Polygon:3,MultiPolygon:4};function iy(){return{points:{},lines:{},polygons:{},polygonsOutline:{}}}function ix(e){return e.geometry.coordinates}var iP=["points","linestrings","polygons"],i_={...iu(il.circle),...iu(il.icon),...iu(il.text),...iu(ic),...iu(id),stroked:!0,filled:!0,extruded:!1,wireframe:!1,_full3d:!1,iconAtlas:{type:"object",value:null},iconMapping:{type:"object",value:{}},getIcon:{type:"accessor",value:e=>e.properties.icon},getText:{type:"accessor",value:e=>e.properties.text},pointType:"circle",getRadius:{deprecatedFor:"getPointRadius"}},iC=class extends tk.CompositeLayer{initializeState(){this.state={layerProps:{},features:{},featuresDiff:{}}}updateState({props:e,changeFlags:t}){if(!t.dataChanged)return;let{data:i}=this.props,o=i&&"points"in i&&"polygons"in i&&"lines"in i;this.setState({binary:o}),o?this._updateStateBinary({props:e,changeFlags:t}):this._updateStateJSON({props:e,changeFlags:t})}_updateStateBinary({props:e,changeFlags:t}){let i=function(e,t){let i=iy(),{points:o,lines:s,polygons:n}=e,r=function(e,t){let i={points:null,lines:null,polygons:null};for(let o in i){let s=e[o].globalFeatureIds.value;i[o]=new Uint8ClampedArray(4*s.length);let n=[];for(let e=0;e<s.length;e++)t(s[e],n),i[o][4*e+0]=n[0],i[o][4*e+1]=n[1],i[o][4*e+2]=n[2],i[o][4*e+3]=255}return i}(e,t);return i.points.data={length:o.positions.value.length/o.positions.size,attributes:{...o.attributes,getPosition:o.positions,instancePickingColors:{size:4,value:r.points}},properties:o.properties,numericProps:o.numericProps,featureIds:o.featureIds},i.lines.data={length:s.pathIndices.value.length-1,startIndices:s.pathIndices.value,attributes:{...s.attributes,getPath:s.positions,instancePickingColors:{size:4,value:r.lines}},properties:s.properties,numericProps:s.numericProps,featureIds:s.featureIds},i.lines._pathType="open",i.polygons.data={length:n.polygonIndices.value.length-1,startIndices:n.polygonIndices.value,attributes:{...n.attributes,getPolygon:n.positions,pickingColors:{size:4,value:r.polygons}},properties:n.properties,numericProps:n.numericProps,featureIds:n.featureIds},i.polygons._normalize=!1,n.triangles&&(i.polygons.data.attributes.indices=n.triangles.value),i.polygonsOutline.data={length:n.primitivePolygonIndices.value.length-1,startIndices:n.primitivePolygonIndices.value,attributes:{...n.attributes,getPath:n.positions,instancePickingColors:{size:4,value:r.polygons}},properties:n.properties,numericProps:n.numericProps,featureIds:n.featureIds},i.polygonsOutline._pathType="open",i}(e.data,this.encodePickingColor);this.setState({layerProps:i})}_updateStateJSON({props:e,changeFlags:t}){let i=function(e){if(Array.isArray(e))return e;switch(ip.log.assert(e.type,"GeoJSON does not have type"),e.type){case"Feature":return[e];case"FeatureCollection":return ip.log.assert(Array.isArray(e.features),"GeoJSON does not have features array"),e.features;default:return[{geometry:e}]}}(e.data),o=this.getSubLayerRow.bind(this),s={},n={};if(Array.isArray(t.dataChanged)){let e=this.state.features;for(let t in e)s[t]=e[t].slice(),n[t]=[];for(let r of t.dataChanged){let t=ih(i,o,r);for(let i in e)n[i].push(tA({data:s[i],getIndex:e=>e.__source.index,dataRange:r,replace:t[i]}))}}else s=ih(i,o);let r=function(e,t){let i=iy(),{pointFeatures:o,lineFeatures:s,polygonFeatures:n,polygonOutlineFeatures:r}=e;return i.points.data=o,i.points._dataDiff=t.pointFeatures&&(()=>t.pointFeatures),i.points.getPosition=ix,i.lines.data=s,i.lines._dataDiff=t.lineFeatures&&(()=>t.lineFeatures),i.lines.getPath=ix,i.polygons.data=n,i.polygons._dataDiff=t.polygonFeatures&&(()=>t.polygonFeatures),i.polygons.getPolygon=ix,i.polygonsOutline.data=r,i.polygonsOutline._dataDiff=t.polygonOutlineFeatures&&(()=>t.polygonOutlineFeatures),i.polygonsOutline.getPath=ix,i}(s,n);this.setState({features:s,featuresDiff:n,layerProps:r})}getPickingInfo(e){let t=super.getPickingInfo(e),{index:i,sourceLayer:o}=t;return t.featureType=iP.find(e=>o.id.startsWith(`${this.id}-${e}-`)),i>=0&&o.id.startsWith(`${this.id}-points-text`)&&this.state.binary&&(t.index=this.props.data.points.globalFeatureIds.value[i]),t}_updateAutoHighlight(e){let t=`${this.id}-points-`,i="points"===e.featureType;for(let o of this.getSubLayers())o.id.startsWith(t)===i&&o.updateAutoHighlight(e)}_renderPolygonLayer(){var e;let{extruded:t,wireframe:i}=this.props,{layerProps:o}=this.state,s="polygons-fill",n=this.shouldRenderSubLayer(s,null==(e=o.polygons)?void 0:e.data)&&this.getSubLayerClass(s,id.type);if(n){let e=ig(this,id.props),r=t&&i;return r||delete e.getLineColor,e.updateTriggers.lineColors=r,new n(e,this.getSubLayerProps({id:s,updateTriggers:e.updateTriggers}),o.polygons)}return null}_renderLineLayers(){var e,t;let{extruded:i,stroked:o}=this.props,{layerProps:s}=this.state,n="polygons-stroke",r="linestrings",a=!i&&o&&this.shouldRenderSubLayer(n,null==(e=s.polygonsOutline)?void 0:e.data)&&this.getSubLayerClass(n,ic.type),l=this.shouldRenderSubLayer(r,null==(t=s.lines)?void 0:t.data)&&this.getSubLayerClass(r,ic.type);if(a||l){let e=ig(this,ic.props);return[a&&new a(e,this.getSubLayerProps({id:n,updateTriggers:e.updateTriggers}),s.polygonsOutline),l&&new l(e,this.getSubLayerProps({id:r,updateTriggers:e.updateTriggers}),s.lines)]}return null}_renderPointLayers(){var e;let{pointType:t}=this.props,{layerProps:i,binary:o}=this.state,{highlightedObjectIndex:s}=this.props;!o&&Number.isFinite(s)&&(s=i.points.data.findIndex(e=>e.__source.index===s));let n=new Set(t.split("+")),r=[];for(let t of n){let n=`points-${t}`,a=il[t],l=a&&this.shouldRenderSubLayer(n,null==(e=i.points)?void 0:e.data)&&this.getSubLayerClass(n,a.type);if(l){let e=ig(this,a.props),c=i.points;if("text"===t&&o){let{instancePickingColors:e,...t}=c.data.attributes;c={...c,data:{...c.data,attributes:t}}}r.push(new l(e,this.getSubLayerProps({id:n,updateTriggers:e.updateTriggers,highlightedObjectIndex:s}),c))}}return r}renderLayers(){let{extruded:e}=this.props,t=this._renderPolygonLayer();return[!e&&t,this._renderLineLayers(),this._renderPointLayers(),e&&t]}getSubLayerAccessor(e){let{binary:t}=this.state;return t&&"function"==typeof e?(t,i)=>{let{data:o,index:s}=i;return e(function(e,t){if(!e)return null;let i="startIndices"in e?e.startIndices[t]:t,o=e.featureIds.value[i];return -1!==i?function(e,t,i){let o={properties:{...e.properties[t]}};for(let t in e.numericProps)o.properties[t]=e.numericProps[t].value[i];return o}(e,o,i):null}(o,s),i)}:super.getSubLayerAccessor(e)}};iC.layerName="GeoJsonLayer",iC.defaultProps=i_;var iS=iC}}]);