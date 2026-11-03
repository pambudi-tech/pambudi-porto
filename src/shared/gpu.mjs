// A WebGL 2 context only where a graphics card draws it. Drawn in software
// (SwiftShader, llvmpipe, Windows' basic driver), every frame holds up the
// page for tens of milliseconds, and the 2D paths serve better.
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i;

export function isSoftwareRenderer(name) {
  return SOFTWARE.test(name ?? '');
}

export function hardwareWebGL2(canvas, options) {
  const gl = canvas.getContext('webgl2', { ...options, failIfMajorPerformanceCaveat: true });
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (!isSoftwareRenderer(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))) return gl;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return null;
}
