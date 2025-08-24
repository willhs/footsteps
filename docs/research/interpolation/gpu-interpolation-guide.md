# GPU guide: interpolating human migration patterns over time (from start → end populations)

Goal: given a start population density (and optionally a target/end density), generate a **plausible, mass-conserving** migration animation over time on the GPU, suitable for web viz (WebGL2 / WebGPU, deck.gl). This guide gives you three practical approaches:

- **A. Eulerian grid advection–diffusion** (fast, stable, mass-conserving; great for heat-map densities)
- **B. Particle advection** (“dots are people”; highly readable flows; aggregates to grid each frame)
- **C. Optimal-transport (displacement) interpolation** (best mass matching, heavier compute; optional)

You can combine A/B with **constraints** (land/sea masks, ice sheets, deserts), **habitability** fields, and **cost surfaces** to steer flows.

---

## 0) Data model & inputs

**Choose a grid** (e.g., 1024×512 equal-area) or multi-resolution tiles if you need global detail.

**Required textures (GPU):**
- `ρ0(x,y)`: start density (people/km² or normalized mass per cell)
- `ρT(x,y)` (optional): target/end density
- `H(x,y,t)` (optional, time-varying): habitability score [0..1] (climate/biome/altitude/ice)
- `C(x,y)` (optional): movement cost (higher = slower flow; water crossings, mountains)
- `M(x,y,t)` (optional): mask (0 = barrier, 1 = passable; dynamic for sea level/ice)

**Preprocessing**
- **Projection**: prefer equal-area grid (e.g., Mollweide) for mass conservation. If using lat-lon, **weight by cos(lat)** in all sums.
- **Normalization**: store `ρ` in **linear space** (not log); clamp to non-negative.
- **Dynamic range**: for display you can log-map, but keep simulation/state linear.
- **Units**: pick a consistent cell area A (km²) and velocity units (km/yr).

**Time control**
- Animation parameter `τ ∈ [0,1]` maps to real years `t = t0 + τ·Δt`. Use a slider and playhead.

---

## 1) Approach A — Eulerian grid advection–diffusion (ping-pong textures)

**Idea**: treat population as a density field `ρ(x,y,t)`. Transport it through a velocity field `v(x,y,t)` with mild diffusion while respecting barriers and capacities.

**Core PDE** (discretized on GPU):
- `∂ρ/∂t + ∇·(ρ v) = ∇·(D ∇ρ) + S`
  - `v` is a steering velocity (see below)
  - `D` is diffusion coefficient (small, stabilizes + models local dispersion)
  - `S` optional source/sink (e.g., births/deaths or capacity nudging)

**Velocity field choices**
- **Toward target**: `v = -α ∇Φ`, where potential `Φ = W * (ρ - ρT)` (smoothed residual toward target).
- **Toward habitability**: `v = β ∇H` (people move up habitability gradient).
- **Cost-aware**: scale by `1/(1+γ C)`; zero out with mask `M`.
- **Blend**: `v = u_target + u_hab` with schedule (start habitability-driven, later nudge to target).

**GPU implementation sketch (WebGL2 fragment “compute” pass)**
- Keep two RG32F (or RGBA32F) textures: `stateA` and `stateB` (ping–pong).
- Each frame:
  1) **Compute velocity**: from potentials/gradients (prepass), store in `velTex`.
  2) **Advect** `ρ` with **semi-Lagrangian** back-tracing (stable for large dt).
  3) **Diffuse** by sampling neighbor texels (Jacobi step).
  4) **Apply masks** (`M=0→ρ=0`, or reflect/stop velocity).
  5) **Renormalize mass** (see below).
  6) Swap textures and render to screen (e.g., BitmapLayer / TileLayer).

**Pseudo-GLSL fragment kernel (single pass advect + diffuse)**

    // Inputs: sampler2D rhoTex, velTex, maskTex, costTex, habitTex, targetTex
    // Uniforms: texSize, dt, cellSizeKm, D, alpha, beta, gamma, wrapMode
    vec2 backtrace(vec2 uv) {
      vec2 v = texture(velTex, uv).xy;         // km/yr
      vec2 px = 1.0 / texSize;
      vec2 shift = (dt * v / cellSizeKm);      // in cells
      // Map cell shift to uv space
      return uv - shift * px;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / texSize;
      float M = texture(maskTex, uv).r;        // 0..1
      if (M < 0.5) { fragColor = vec4(0.0); return; }

      // Semi-Lagrangian sample (with chosen wrap/clamp)
      vec2 uv_prev = backtrace(uv);
      float rho_adv = texture(rhoTex, uv_prev).r;

      // Simple diffusion (5-point stencil)
      vec2 px = 1.0 / texSize;
      float rho_c = rho_adv;
      float rho_n = texture(rhoTex, uv + vec2(0, 1)*px).r;
      float rho_s = texture(rhoTex, uv + vec2(0,-1)*px).r;
      float rho_e = texture(rhoTex, uv + vec2( 1,0)*px).r;
      float rho_w = texture(rhoTex, uv + vec2(-1,0)*px).r;
      float lap = (rho_n + rho_s + rho_e + rho_w - 4.0*rho_c);
      float rho_diff = rho_c + D * dt * lap;

      // Clamp non-negative
      float rho = max(rho_diff, 0.0);

      // Optional: capacity or nudging towards target (light touch)
      float rhoT = texture(targetTex, uv).r;
      float k = 0.0; // small (e.g., 0..0.02) to avoid teleporting
      rho = mix(rho, rhoT, k * dt);

      fragColor = vec4(rho, 0, 0, 1);
    }

**Mass conservation**
- Track total mass `Σ ρ * A`. After each step, compute sum (GPU reduction or CPU readback ~ occasionally) and **scale** the field to keep `Σ` constant (unless you model births/deaths intentionally).
- On lat-lon grids multiply per-texel contributions by `cos(lat)`.

**Deck.gl integration**
- Use a **custom Layer** that owns:
  - Two `Framebuffer`s (luma.gl) for ping-pong.
  - `Model` for velocity prepass (computes ∇Φ etc.) and main pass.
  - A `BitmapLayer` (or RasterLayer) to visualize `ρ`.
- Expose props: `dt`, `diffusion`, `alpha/beta/gamma`, `wrapMode`, `maskTexture`, `habitTexture`, `targetTexture`, `speedScale`.
- Update on `draw()`; ensure deterministic stepping when paused/seeked.

---

## 2) Approach B — Particle advection (then aggregate to grid)

**Idea**: spawn N particles from start distribution; move each by `v(x,y,t)`; splat to a grid each frame to visualize density.

**Pros/cons**
- ✅ Intuitive pathlines, great storytelling; stochastic variation looks natural.
- ❗ Needs many particles (hundreds of thousands to millions) for smooth density; use GPU aggregation.

**Pipeline**
1) **Seeding**: sample particle positions from `ρ0` (importance sampling). Store in SSBO/texture: pos, mass, rng seed.
2) **Velocity**: same construction as Approach A (habitability/target/cost/masks).
3) **Integrate**: Euler or RK2/3; clamp with masks; reflect/absorb at barriers.
4) **Aggregation**: rasterize particles to a **screen-space or grid texture** (additive blending with soft splats). Optionally convolve with a Gaussian (small blur).
5) **Target matching**: slowly reweight particle masses or add weak “barycenter pull” to match `ρT` by time T (do not teleport).

**Minimal WGSL-ish compute step (WebGPU)**

    struct Particle { pos: vec2<f32>, mass: f32, seed: u32 };
    @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
    @group(0) @binding(1) var velTex: texture_2d<f32>;
    @group(0) @binding(2) var maskTex: texture_2d<f32>;
    @group(0) @binding(3) var samplerLinear: sampler;

    @compute @workgroup_size(256)
    fn step(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i >= arrayLength(&particles)) { return; }
      var p = particles[i];

      // Sample velocity
      let uv = worldToUV(p.pos);
      let v  = textureSample(velTex, samplerLinear, uv).xy; // km/yr
      // Integrate
      let dt = uniforms.dt;
      p.pos += v * dt; // map units

      // Mask
      let passable = textureSample(maskTex, samplerLinear, worldToUV(p.pos)).r;
      if (passable < 0.5) {
        // reflect or project to nearest passable cell (simple reflect shown)
        p.pos -= v * dt;
      }

      particles[i] = p;
    }

**Aggregation to density (render pass)**
- Draw instanced points for particles with **additive blending** into an offscreen float texture.
- Splat kernel: smooth circular footprint in NDC or grid space.
- Normalize and display via BitmapLayer.

---

## 3) Approach C — Optimal-transport (OT) displacement interpolation (optional, heavier)

**Idea**: compute a transport map that pushes `ρ0` to `ρT` with minimal cost (e.g., geodesic distance on cost surface), then **interpolate positions along that map** (McCann displacement interpolation). Guarantees mass-preserving match at T.

**Practical browser route**
- Use **entropic regularized OT (Sinkhorn)** on the grid:
  - Cost `d(i,j)` = geodesic or great-circle distance (km) × cost scaling.
  - Kernel `K = exp(-d/ε)`; iterative scaling updates `(u,v)`.
  - Recover transport `P = diag(u) K diag(v)`.
- Compute **barycentric map** (for each source cell, the weighted mean of destination locations under `P`).
- Interpolate positions: `x(τ) = (1-τ) x0 + τ x_dest`.
- Render by advection of density (particles or grid warping).

**Notes**
- WebGPU compute fits Sinkhorn well; still O(N²) memory if naive. Use **truncated kernels** (local neighborhoods), multi-resolution coarse-to-fine, or convolutional acceleration on regular grids.
- Use OT only for **keyframes** (e.g., every 1k years); between keyframes use Approach A/B.

---

## 4) Building the velocity field `v(x,y,t)`

Combine multiple drives:

- **Target attraction (soft)**:
  - Residual: `r = ρ - ρT`
  - Potential via smoothing: `Φ = Gσ * r` (Gaussian blur with σ≈1–3 cells)
  - `u_target = -α ∇Φ`
- **Habitability gradient**:
  - `u_hab = β ∇H`; set `H=0` where uninhabitable; ramp over time (e.g., post-glacial opening)
- **Cost surface**:
  - Scale speed: `|v| := |v| / (1 + γ C)`; or project along corridors (river valleys, coasts)
- **Cohesion**:
  - Local neighbor attraction proportional to `∇(Gκ * ρ)` to avoid excessive fragmentation
- **Barriers/masks**:
  - Multiply `v` by `M`; or project tangentially along coasts.

**Calibration tips**
- Typical peak speeds (prehistoric walking/coastal hopping): 5–30 km/yr (tunable).
- Choose `dt` so that **CFL** condition holds for advection (semi-Lagrangian is forgiving).
- Diffusion `D`: small (e.g., 0.05–0.3 cell²/yr) to soften artifacts; not so large that sharp fronts vanish.

---

## 5) Constraints & realism knobs

- **Sea/ice masks** over time: update `M(x,y,t)` each epoch (glacial cycles).
- **Carrying capacity** `K(x,y,t)`: softly cap `ρ` with logistic term `S = r ρ (1 - ρ/K)`.
- **Stochasticity**: add small divergence-free noise to `v` for organic texture; keep mass check.
- **Coastal preference**: bias velocity direction along coastline normals/tangents.
- **Corridors**: precompute least-cost directions; steer `v` toward corridor vector field.

---

## 6) Mass bookkeeping & validation

- **Mass check** each N frames: `Σ ρ * A` (lat-lon: multiply by cos(lat)).
- **Renormalize** by constant factor if you must preserve total population.
- **Distance to target**: track `||ρ - ρT||₁` or EMD proxy to monitor convergence schedule.
- **Sanity plots**: histogram of speeds; map of divergence `∇·(ρ v)` to catch artifacts.

---

## 7) Large-world performance

- Use **tiled simulation** (e.g., 512×512 tiles) with halo borders; update only visible + 1 ring.
- Store textures as **R16F** where possible; keep accumulators in 32-bit.
- Mipmaps for sampling gradients at coherent scales.
- Prefer **WebGPU** compute for particles/OT; fallback WebGL2 fragment passes for advection.

---

## 8) Minimal deck.gl (WebGL2) skeleton

**Concept**: a deck.gl `MigrationLayer` runs the ping-pong simulation and exposes a `BitmapLayer` of `ρ`.

    class MigrationLayer extends deck.Layer {
      initializeState({gl}) {
        // create framebuffers/Textures stateA, stateB, velTex, maskTex, targetTex ...
        // create luma.gl Models: velocityPass, mainPass
        // load initial rho0 into stateA
      }
      updateState({props, changeFlags}) {
        // update uniforms (dt, D, alpha/beta/gamma), swap textures on prop changes
      }
      draw({uniforms}) {
        // 1) velocity prepass: compute ∇Φ and build velTex
        // 2) main pass: advect+diffuse from readTex → writeTex
        // 3) swap ping-pong
        // 4) draw BitmapLayer with current rho texture
      }
      // provide a sublayer (BitmapLayer) that reads current rho tex
      renderLayers() {
        return new deck.BitmapLayer({
          id: `${this.props.id}-rho`,
          bounds: this.props.bounds, // world bounds in your projection
          image: this.getCurrentRhoTexture()
        });
      }
    }

---

## 9) Controls & UX

- **Time**: slider for `τ` with play/pause; snap to keyframes when using OT.
- **Knobs**: `speed`, `diffusion`, `habitability weight`, `target pull`.
- **Overlays**: toggle masks (ice/water), habitability, corridors, particle trails (Approach B).
- **Bookmarks**: jump to notable epochs.

---

## 10) Quick recipe (pragmatic defaults)

1) Grid 1024×512 equal-area; load `ρ0`, `ρT`, `H`, `M`.
2) Build `v = -α ∇(Gσ*(ρ-ρT)) + β ∇H`, then scale by cost `(1+γC)⁻¹`, then apply mask `M`.
3) Semi-Lagrangian advect with `dt` = 1–10 years; diffusion `D` = 0.1–0.2 cell²/yr.
4) Every frame: mass check & global rescale; 1–2 Jacobi diffusion iterations.
5) Visualize `ρ` via BitmapLayer; optional overdraw of particles for flavor.
6) If you need tighter end fit, add light nudging `ρ ← mix(ρ, ρT, κ dt)` with tiny κ.

---

## 11) Testing checklist

- ✅ Mass stays constant (±0.1%) unless births/deaths modeled.
- ✅ No flow across hard barriers; coasts look plausible.
- ✅ Max speeds reasonable; fronts propagate at km/yr expectations.
- ✅ With `ρT` provided, residual to target decreases smoothly.
- ✅ Performance: 60 fps at your chosen resolution, or degrade gracefully with tiles.

---

## 12) What to try next

- Multi-epoch keyframes: OT between coarse waypoints, A/B in between.
- Learned velocity priors from paleo-routes datasets (rivers/coasts) to guide `v`.
- Per-cell carrying capacity from climate/hydrology; logistic growth in hospitable zones.
- Provenance UI: show which term (target vs habitability vs cost) dominates flow locally.

---

## Appendix: tiny GLSL helpers (fragments)

**Gradient (central diff)**

    vec2 grad(sampler2D tex, vec2 uv, vec2 px) {
      float l = texture(tex, uv - vec2(px.x, 0)).r;
      float r = texture(tex, uv + vec2(px.x, 0)).r;
      float d = texture(tex, uv - vec2(0, px.y)).r;
      float u = texture(tex, uv + vec2(0, px.y)).r;
      return vec2((r - l)/(2.0*px.x), (u - d)/(2.0*px.y));
    }

**Gaussian blur (separable 5-tap)**

    float blur5(sampler2D tex, vec2 uv, vec2 dir, vec2 px) {
      float w0=0.204164, w1=0.304005, w2=0.193416; // normalized 5-tap approx
      float s = w0*texture(tex, uv).r;
      s += w1*texture(tex, uv + dir*px).r + w1*texture(tex, uv - dir*px).r;
      s += w2*texture(tex, uv + 2.0*dir*px).r + w2*texture(tex, uv - 2.0*dir*px).r;
      return s;
    }

Use these to build `Φ = blur(Gσ*(ρ-ρT))`, then `v = -α ∇Φ + β ∇H`, then the main advect–diffuse step.

---

**That’s it.** Start with Approach A (most bang-for-buck), add particles for visual richness, and reach for OT only if you need keyframe-accurate matching between known start/end distributions.
