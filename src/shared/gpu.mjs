// A WebGL 2 context only where a graphics card draws it. Drawn in software
// (SwiftShader, llvmpipe, Windows' basic driver), every frame holds up the
// page for tens of milliseconds, and the 2D paths serve better.
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i;

export function isSoftwareRenderer(name) {
  return SOFTWARE.test(name ?? '');
}

// Found once: without a graphics card the page stays without one, and each
// try at a context costs the main thread tens of milliseconds in software.
let software = false;
export function hardwareWebGL2(canvas, options) {
  if (software) return null;
  const gl = canvas.getContext('webgl2', { ...options, failIfMajorPerformanceCaveat: true });
  if (!gl) { software = true; return null; }
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (!isSoftwareRenderer(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))) return gl;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  software = true;
  return null;
}
