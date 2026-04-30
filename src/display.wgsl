struct Params {
    numSeeds: u32,
    width:    u32,
    height:   u32,
    pad0:     u32,
}

@group(0) @binding(0) var<storage, read> pixels: array<vec4f>;
@group(0) @binding(1) var<uniform>       p:      Params;

struct Vert {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vi: u32) -> Vert {
    var positions = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0,  1.0),
        vec2f(-1.0, -1.0), vec2f(1.0,  1.0), vec2f(-1.0,  1.0)
    );
    var uv = array<vec2f, 6>(
        vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
        vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
    );
    return Vert(vec4f(positions[vi], 0.0, 1.0), uv[vi]);
}

@fragment
fn fragmentMain(v: Vert) -> @location(0) vec4f {
    let px = min(u32(v.uv.x * f32(p.width)),  p.width  - 1u);
    let py = min(u32(v.uv.y * f32(p.height)), p.height - 1u);
    return pixels[py * p.width + px];
}
