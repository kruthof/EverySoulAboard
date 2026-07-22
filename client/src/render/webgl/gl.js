// Thin WebGL2 layer — the ONLY GPU-touching module in the client. It owns context acquisition,
// the two shader programs (textured quad + flat/tinted quad), one shared VAO over one streaming
// interleaved VBO, the atlas texture (trilinear minify; MAG is LINEAR but inert — see uploadAtlas),
// premultiplied-alpha blending, and the context-loss surface. Everything above it
// (webgl2.js) feeds it plain Float32 vertex data produced from the PURE batcher/atlas/rasterplan.
//
// Vertex layout is a single interleaved format shared by both programs (stride 8 floats):
//   [ x, y,   u, v,   r, g, b, a ]   position(px)  uv  premultiplied-rgba
// The flat program ignores u,v; the textured program multiplies the sampled (premultiplied) texel
// by the vertex rgba. Blending is ONE, ONE_MINUS_SRC_ALPHA (premultiplied), so both draw paths
// emit premultiplied colour. A `setBlendMultiply` toggle exists for the reserved light pass (C4).

const STRIDE = 8;            // floats per vertex
const STRIDE_B = STRIDE * 4; // bytes

const TEX_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 a_rgba;
uniform vec2 u_res;
out vec2 v_uv;
out vec4 v_rgba;
void main() {
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_rgba = a_rgba;
}`;

const TEX_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_rgba;
uniform sampler2D u_tex;
out vec4 o;
void main() { o = texture(u_tex, v_uv) * v_rgba; }`;

const FLAT_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=2) in vec4 a_rgba;
uniform vec2 u_res;
out vec4 v_rgba;
void main() {
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_rgba = a_rgba;
}`;

const FLAT_FS = `#version 300 es
precision mediump float;
in vec4 v_rgba;
out vec4 o;
void main() { o = v_rgba; }`;

/** A thin WebGL2 wrapper. Construction throws if a context can't be acquired or a shader fails. */
export class GLContext {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true, // screenshot parity: keep the buffer readable after the draw
    });
    if (!gl) throw new Error('WebGL2 context unavailable');
    this.canvas = canvas;
    this.gl = gl;
    this._lost = false;
    /** @type {(()=>void)|null} */
    this.onLost = null;
    this._onCtxLost = (e) => { e.preventDefault(); this._lost = true; if (this.onLost) this.onLost(); };
    canvas.addEventListener('webglcontextlost', this._onCtxLost, false);

    this.texProg = this._program(TEX_VS, TEX_FS);
    this.flatProg = this._program(FLAT_VS, FLAT_FS);
    this.uTexRes = gl.getUniformLocation(this.texProg, 'u_res');
    this.uTexSampler = gl.getUniformLocation(this.texProg, 'u_tex');
    this.uFlatRes = gl.getUniformLocation(this.flatProg, 'u_res');

    // One VAO over one streaming VBO; attribute pointers set once (both programs share the layout).
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE_B, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE_B, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE_B, 16);
    gl.bindVertexArray(null);

    this.tex = null;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
  }

  /** True once the context is lost (via event or the driver). Callers should stop drawing. */
  isLost() { return this._lost || this.gl.isContextLost(); }

  _shader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader compile: ' + log);
    }
    return s;
  }

  _program(vsSrc, fsSrc) {
    const gl = this.gl;
    const p = gl.createProgram();
    const vs = this._shader(gl.VERTEX_SHADER, vsSrc);
    const fs = this._shader(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error('program link: ' + log);
    }
    return p;
  }

  /**
   * Upload a canvas-backed atlas as the single sampled texture: premultiplied, LINEAR magnify,
   * trilinear (LINEAR_MIPMAP_LINEAR) minify.
   *
   * MIN_FILTER is the one that matters. NEAREST_MIPMAP_LINEAR point-samples inside each mip
   * (aliasing the detail) while cross-fading between mips (blurring what survived) — the worst of
   * both. Trilinear does the sane thing. It only behaves if the atlas gutter survives mip
   * reduction — see atlas.js ATLAS_BORDER and the edge replication in webgl2.js.
   *
   * MAG_FILTER is INERT, and saying otherwise would overstate this change. camera.js caps the
   * pitch at MAX_TILE_DEVICE_PX (128) and the atlas bakes every cell at CELL (128), so a tile quad
   * is never magnified — magnification is reached only at exactly 1:1, where LINEAR and NEAREST
   * agree texel-for-texel. Measured: 1:1 frames before/after are byte-identical (RMSE 0.000). The
   * crispness win at max zoom comes from the CEILING (no upscaling past the source art at all),
   * not from this filter. LINEAR is kept because it is the correct choice the moment the ceiling
   * is ever relaxed, and it costs nothing today.
   * @param {HTMLCanvasElement|ImageBitmap|HTMLImageElement} source
   */
  uploadAtlas(source) {
    const gl = this.gl;
    if (!this.tex) this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Set the viewport + clear to a premultiplied rgba. */
  beginFrame(w, h, clear) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Draw an interleaved flat batch (uv ignored). `verts` is a Float32Array of STRIDE-float verts. */
  drawFlat(verts, w, h) {
    if (!verts.length) return;
    const gl = this.gl;
    gl.useProgram(this.flatProg);
    gl.uniform2f(this.uFlatRes, w, h);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / STRIDE);
    gl.bindVertexArray(null);
  }

  /** Draw an interleaved textured batch sampling the atlas texture. */
  drawTextured(verts, w, h) {
    if (!verts.length || !this.tex) return;
    const gl = this.gl;
    gl.useProgram(this.texProg);
    gl.uniform2f(this.uTexRes, w, h);
    gl.uniform1i(this.uTexSampler, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / STRIDE);
    gl.bindVertexArray(null);
  }

  /**
   * Multiply-blend toggle for the reserved light pass. Light DrawOps (C4) modulate the lit scene:
   * dst *= src. Off restores the default premultiplied over-blend. Empty light pass never calls it.
   */
  setBlendMultiply(on) {
    const gl = this.gl;
    if (on) gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  dispose() {
    try { this.canvas.removeEventListener('webglcontextlost', this._onCtxLost); } catch { /* ignore */ }
  }
}

export const VERTEX_STRIDE = STRIDE;
