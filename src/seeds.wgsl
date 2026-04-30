// Pass 1 — one thread per seed, updates position and bounces off walls
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

@group(0) @binding(0) var<storage, read_write> seeds: array<Seed>;
@group(0) @binding(1) var<uniform>             p:     Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= p.numSeeds) { return; }

    var pos = seeds[i].pos;
    var vel = seeds[i].vel;

    pos.x += vel.x;
    pos.y += vel.y;

    let w = f32(p.width);
    let h = f32(p.height);

    // reflect position and ensure velocity points away from wall
    if (pos.x < 0.0) { 
        pos.x = -pos.x;          
        vel.x =  abs(vel.x); 
        }
    if (pos.x > w)   { 
        pos.x = w - (pos.x - w);  
        vel.x = -abs(vel.x); 
        }
    if (pos.y < 0.0) { 
        pos.y = -pos.y;          
        vel.y =  abs(vel.y); 
        }
    if (pos.y > h)   { 
        pos.y = h - (pos.y - h);  
        vel.y = -abs(vel.y); 
        }

    seeds[i].pos = pos;
    seeds[i].vel = vel;
}
