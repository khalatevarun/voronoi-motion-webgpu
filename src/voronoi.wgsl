// Pass 2 — one thread per pixel: finds nearest seed, overlays white dot if within radius
struct Seed {
    pos:   vec2f,
    vel:   vec2f,
    color: vec4f,
}

struct Params {
    numSeeds: u32,
    width:    u32,
    height:   u32,
    pad0:     u32,
}

@group(0) @binding(0) var<storage, read>       seeds:  array<Seed>;
@group(0) @binding(1) var<storage, read_write> pixels: array<vec4f>;
@group(0) @binding(2) var<uniform>             p:      Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let x = id.x;
    let y = id.y;
    if (x >= p.width || y >= p.height) { return; }
    let idx = y * p.width + x;

    if (p.numSeeds == 0u) {
        pixels[idx] = vec4f(0.07, 0.07, 0.10, 1.0);
        return;
    }

    var minDist = 1.0e9f;
    var nearest = 0u;
    var isDot   = false;

    for (var i = 0u; i < p.numSeeds; i++) {
        let dx = f32(x) - seeds[i].pos.x;
        let dy = f32(y) - seeds[i].pos.y;
        let d2 = dx * dx + dy * dy;

        if (d2 < minDist) { minDist = d2; nearest = i; }
        if (d2 < 64.0)    { isDot = true; } // 8² = 64 
    }

    // select(a, b, condition) → b if condition true, a if false
    pixels[idx] = select(seeds[nearest].color, vec4f(1.0, 1.0, 1.0, 1.0), isDot);
}
