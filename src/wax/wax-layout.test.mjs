import test from 'node:test';
import assert from 'node:assert/strict';
import { waxLayout, extendWaxX, WAX_ASPECT } from './wax-layout.mjs';

test('short labels preserve the exact reference aspect; long labels add room',()=>{
  const short=waxLayout(45), long=waxLayout(250);
  assert.ok(Math.abs(short.width/short.height-WAX_ASPECT)<1e-12);
  assert.ok(Math.abs(short.extension)<1e-12);
  assert.ok(long.labelWidth>=250);
  assert.equal(long.height,short.height);
});
test('extending the centre translates each end cap rigidly',()=>{
  for(const extension of [.25,1,3]){
    assert.ok(Math.abs((extendWaxX(1.35,extension)-extendWaxX(1.05,extension))-.3)<1e-12);
    assert.equal(extendWaxX(0,extension),0);
    assert.equal(extendWaxX(-1.2,extension),-extendWaxX(1.2,extension));
  }
});
test('available width bounds long labels and exposes space for wrapping',()=>{
  const layout=waxLayout(1000,{height:48,maxWidth:320});
  assert.equal(layout.width,320);
  assert.equal(layout.labelWidth,260);
});
