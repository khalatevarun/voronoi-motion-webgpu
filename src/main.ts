import seedsCode from "./seeds.wgsl";
import voronoiCode from "./voronoi.wgsl";
import displayCode from "./display.wgsl";

const CANVAS_W = 800;
const CANVAS_H = 600;
const MAX_SEEDS = 64;
const SEED_FLOATS = 8;  // pos.x pos.y vel.x vel.y r g b a
const SEED_BYTES = SEED_FLOATS * 4; // 32 bytes per seed

const PALETTE: [number, number, number][] = [
    [0.95, 0.26, 0.21],
    [0.13, 0.59, 0.95],
    [0.30, 0.69, 0.31],
    [1.00, 0.76, 0.03],
    [0.61, 0.15, 0.69],
    [0.00, 0.74, 0.83],
    [1.00, 0.34, 0.13],
    [0.00, 0.59, 0.53],
    [0.91, 0.12, 0.39],
    [0.40, 0.23, 0.72],
    [0.55, 0.76, 0.29],
    [1.00, 0.60, 0.00],
    [0.24, 0.32, 0.71],
    [0.00, 0.47, 0.42],
    [0.74, 0.21, 0.42],
    [0.09, 0.63, 0.52],
];

interface Seed {
    x: number; y: number;
    vx: number; vy: number;
    r: number; g: number; b: number;
}

async function main(): Promise<void> {

    // STATE

    const seeds: Seed[] = [];
    let paletteIdx = 0;
    let animating = false;
    let needsRedraw = true;

    // UI & INTERACTION

    const canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
    const startBtn = document.getElementById("start-motion-btn") as HTMLButtonElement;
    const stopBtn = document.getElementById("stop-motion-btn") as HTMLButtonElement;

    function updateUI(): void {
        const el = document.getElementById("seed-count");
        if (el) el.textContent = `${seeds.length} / ${MAX_SEEDS}`;
    }

    function setAnimating(value: boolean): void {
        animating = value;
        startBtn.disabled = value;
        stopBtn.disabled = !value;
        if (value) needsRedraw = true;
    }

    function addSeed(x: number, y: number): void {
        if (seeds.length >= MAX_SEEDS) return;
        const speed = 1.0 + Math.random() * 1.5;
        const angle = Math.random() * Math.PI * 2;
        const [r, g, b] = PALETTE[paletteIdx % PALETTE.length];
        paletteIdx++;
        seeds.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, g, b });
        setAnimating(false);
        uploadSeeds();
        updateUI();
    }

    function scatterSeeds(n: number): void {
        seeds.length = 0;
        paletteIdx = 0;
        for (let i = 0; i < n; i++) {
            const speed = 1.0 + Math.random() * 1.5;
            const angle = Math.random() * Math.PI * 2;
            const [r, g, b] = PALETTE[i % PALETTE.length];
            seeds.push({
                x: 40 + Math.random() * (CANVAS_W - 80),
                y: 40 + Math.random() * (CANVAS_H - 80),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r, g, b,
            });
        }
        uploadSeeds();
        updateUI();
    }

    // place seed at the clicked position
    canvas.addEventListener("click", (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
        const y = (e.clientY - rect.top) * (CANVAS_H / rect.height);
        addSeed(x, y);
    });

    document.getElementById("scatter-btn")?.addEventListener("click", () => scatterSeeds(16));
    startBtn.addEventListener("click", () => setAnimating(true));
    stopBtn.addEventListener("click", () => setAnimating(false));
    document.getElementById("reset-btn")?.addEventListener("click", () => {
        seeds.length = 0;
        paletteIdx = 0;
        setAnimating(false);
        uploadSeeds();
        updateUI();
    });

    // WEBGPU SETUP

    // Device
    if (!navigator.gpu) {
        (document.getElementById("no-webgpu") as HTMLElement).style.display = "block";
        return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        (document.getElementById("no-webgpu") as HTMLElement).style.display = "block";
        return;
    }
    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu") as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });

    // Buffers
    const seedsBuffer = device.createBuffer({
        size: MAX_SEEDS * SEED_BYTES,          // 64 seeds × 32 bytes
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const pixelsBuffer = device.createBuffer({
        size: CANVAS_W * CANVAS_H * 16,        // 480 000 pixels × 16 bytes (vec4f)
        usage: GPUBufferUsage.STORAGE,
    });

    const paramsBuffer = device.createBuffer({
        size: 16, // numSeeds u32 + width u32 + height u32 + pad0 u32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // writes seed array into GPU buffers
    function uploadSeeds(): void {
        const data = new Float32Array(MAX_SEEDS * SEED_FLOATS);
        for (let i = 0; i < seeds.length; i++) {
            const s = seeds[i];
            const off = i * SEED_FLOATS;
            data[off + 0] = s.x;
            data[off + 1] = s.y;
            data[off + 2] = s.vx;
            data[off + 3] = s.vy;
            data[off + 4] = s.r;
            data[off + 5] = s.g;
            data[off + 6] = s.b;
            data[off + 7] = 1.0;
        }
        device.queue.writeBuffer(seedsBuffer, 0, data);

        const params = new Uint32Array([seeds.length, CANVAS_W, CANVAS_H, 0]);
        device.queue.writeBuffer(paramsBuffer, 0, params);

        needsRedraw = true;
    }

    uploadSeeds(); // pushes empty state so canvas clears on first frame

    // Shader modules 
    const seedsMod = device.createShaderModule({ code: seedsCode });
    const voronoiMod = device.createShaderModule({ code: voronoiCode });
    const displayMod = device.createShaderModule({ code: displayCode });

    // Bind group layouts
    const seedsBGL = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }, // seeds (read_write)
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // params
        ]
    });

    const voronoiBGL = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // seeds (read)
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }, // pixels (read_write)
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // params
        ]
    });

    const displayBGL = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } }, // pixels (read)
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // params
        ]
    });


    // Bind Groups
    const seedsGroup = device.createBindGroup({
        layout: seedsBGL,
        entries: [
            { binding: 0, resource: { buffer: seedsBuffer } },
            { binding: 1, resource: { buffer: paramsBuffer } },
        ]
    });

    const voronoiGroup = device.createBindGroup({
        layout: voronoiBGL,
        entries: [
            { binding: 0, resource: { buffer: seedsBuffer } },
            { binding: 1, resource: { buffer: pixelsBuffer } },
            { binding: 2, resource: { buffer: paramsBuffer } },
        ]
    });

    const displayGroup = device.createBindGroup({
        layout: displayBGL,
        entries: [
            { binding: 0, resource: { buffer: pixelsBuffer } },
            { binding: 1, resource: { buffer: paramsBuffer } },
        ]
    });

    // Pipelines
    const seedsPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [seedsBGL] }),
        compute: { module: seedsMod, entryPoint: "main" },
    });

    const voronoiPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [voronoiBGL] }),
        compute: { module: voronoiMod, entryPoint: "main" },
    });

    const displayPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [displayBGL] }),
        vertex: { module: displayMod, entryPoint: "vertexMain" },
        fragment: { module: displayMod, entryPoint: "fragmentMain", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });

    // RENDER LOOP

    function render(): void {
        const enc = device.createCommandEncoder();

        // Pass 1: move seeds on the GPU (one thread per seed)
        if (animating && seeds.length > 0) {
            const pass1 = enc.beginComputePass();
            pass1.setPipeline(seedsPipeline);
            pass1.setBindGroup(0, seedsGroup);
            pass1.dispatchWorkgroups(Math.ceil(seeds.length / 64));
            pass1.end();
            needsRedraw = true;
        }

        // Pass 2: recompute Voronoi (one thread per pixel)
        // Runs whenever seeds moved or a seed was added/removed.
        if (needsRedraw) {
            const pass2 = enc.beginComputePass();
            pass2.setPipeline(voronoiPipeline);
            pass2.setBindGroup(0, voronoiGroup);
            pass2.dispatchWorkgroups(Math.ceil(CANVAS_W / 8), Math.ceil(CANVAS_H / 8));
            pass2.end();
            if (!animating) needsRedraw = false; // static: skip recompute next frame
        }

        // Pass 3: reads pixel buffer → outputs to canvas
        const pass3 = enc.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.07, g: 0.07, b: 0.10, a: 1.0 },
            }],
        });
        pass3.setPipeline(displayPipeline);
        pass3.setBindGroup(0, displayGroup);
        pass3.draw(6); // 2 triangles
        pass3.end();

        device.queue.submit([enc.finish()]);
        requestAnimationFrame(render);
    }

    render();
}

window.addEventListener("load", main);
