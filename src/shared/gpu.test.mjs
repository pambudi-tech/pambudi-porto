import test from 'node:test';
import assert from 'node:assert/strict';
import { isSoftwareRenderer } from './gpu.mjs';

test('software rasterisers are told apart from graphics cards', () => {
  for (const name of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
  ]) assert.ok(isSoftwareRenderer(name), name);
  for (const name of [
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
    'Adreno (TM) 650',
    'Mali-G78',
    'Apple GPU',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ]) assert.ok(!isSoftwareRenderer(name), name);
});
