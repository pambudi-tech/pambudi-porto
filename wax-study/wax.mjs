// The only raster fetched by this page is the separately labeled reference.
// The live button is a height-field material shaded from the user's SVG path.
const canvas = document.querySelector('canvas');
const status = document.querySelector('#status');
const wax = document.querySelector('.wax');
const stage = document.querySelector('.stage');
const gl = canvas.getContext('webgl', {alpha:true, premultipliedAlpha:false, antialias:true});
const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `
precision highp float;
varying vec2 uv;
uniform sampler2D distanceMap;
uniform vec2 resolution;
uniform vec2 lightOffset;
uniform float spread, gloss, textureAmount;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.56+noise(p*2.03+7.2)*.27+noise(p*4.11+21.)*.12+noise(p*8.07)*.05;}
float gauss(float x,float c,float w){return exp(-pow((x-c)/w,2.));}
vec2 mapUV(vec2 p){return vec2(p.x/3.1+.5,.5-p.y/1.125);}
float distanceField(vec2 p){vec2 t=texture2D(distanceMap,mapUV(p)).rg;return (t.r*255.*256.+t.g*255.-32768.)/64./455.;}
float waxDistance(vec2 p){
 float d=distanceField(p);
 // Small, coherent irregularities around an otherwise unaltered SVG silhouette.
 float flow=(fbm(p*8.8+9.)-.45)*.045+(noise(p*22.)-.5)*.012;
 return d+flow*spread;
}
float height(vec2 p){
 float d=waxDistance(p);
 float body=.068*smoothstep(0.,.025,d);
 float rim=.102*gauss(d,.048,.036);
 float trough=-.024*gauss(d,.117,.019);
 float inner=.027*gauss(d,.152,.018);
 float waviness=(fbm(p*12.)-.5)*.013*gauss(d,.05,.09);
 float face=(fbm(p*6.)-.5)*.005;
 float grain=(noise(p*280.)-.5)*.00065;
 float marks=sin(d*1530.+noise(p*55.)*3.)*.00065*gauss(d,.1,.07);
 // Small shallow bubbles, unique per cell, mostly on the squeezed outer lip.
 vec2 cell=p*43.; vec2 cellId=floor(cell);vec2 local=fract(cell)-.5;
 vec2 center=vec2(hash(cellId),hash(cellId+7.))*.45-.225;
 float radius=.07+hash(cellId+19.)*.08;
 float ring=length(local-center)-radius;
 float bubble=(gauss(ring,0.,.026)*.0018-gauss(length(local-center),0.,radius*.65)*.0012)*step(.88,hash(cellId+39.))*gauss(d,.05,.11);
 return body+rim+trough+inner+waviness+(face+grain+marks+bubble)*textureAmount;
}
float highlight(vec3 n,vec3 l,float exponent){return pow(max(0.,dot(n,normalize(l+vec3(0.,0.,1.)))),exponent);}
void main(){
 vec2 p=(uv-.5)*vec2(3.1,1.125);p.y=-p.y;
 float d=waxDistance(p);
 float aa=1.3/resolution.y;
 float alpha=smoothstep(-aa,aa,d);
 if(alpha<.002){gl_FragColor=vec4(0.);return;}
 float e=.0013;
 float h=height(p);
 vec3 n=normalize(vec3((height(p-vec2(e,0.))-height(p+vec2(e,0.)))/(2.*e),
 (height(p-vec2(0.,e))-height(p+vec2(0.,e)))/(2.*e),1.));
 vec3 l=normalize(vec3(-.48+lightOffset.x*.22,-.65+lightOffset.y*.16,1.0));
 vec3 fill=normalize(vec3(.38,.9,.8));
 float diffuse=max(0.,dot(n,l));
 float diffuse2=max(0.,dot(n,fill));
 float pigment=fbm(p*31.);
 vec3 base=mix(vec3(.36,.0018,.008),vec3(.65,.008,.019),pigment);
 float cavity=1.-.68*gauss(d,.112,.025);
 float rimShade=mix(.45,1.,smoothstep(0.,.022,d));
 vec3 color=base*(.35+diffuse*.69+diffuse2*.12)*cavity*rimShade;
 // Low-roughness dielectric wax: broad softbox and sharper specular reflection.
 float rough=mix(34.,125.,gloss);
 float spec=highlight(n,l,rough)*(.3+gloss*.42);
 float edgeSpec=highlight(n,fill,rough*1.8)*(.24+gloss*.38);
 float streak=highlight(n,normalize(vec3(-.5,-.8,1.1)),rough*.45)*.1;
 float fresnel=.045+.32*pow(1.-max(n.z,0.),5.);
 color+=vec3(1.,.83,.79)*(spec+edgeSpec+streak)*(fresnel+.13)*3.1;
 // Warm subsurface glow on thin wax edges, never transparent gelatin.
 color+=vec3(.12,.0015,.003)*gauss(d,.013,.018)*max(n.z,.1);
 color=pow(max(color,vec3(0.)),vec3(.86));
 gl_FragColor=vec4(color,alpha);
}`;

function shader(type, source) {
 const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
 return s;
}

// Chamfer distance transform, preserving the actual supplied path rather than
// substituting a generic ellipse. The two channels store signed 16-bit distance.
function distanceTexture(path) {
 const w=1408,h=512,shapeHeight=455;
 const mask=document.createElement('canvas');mask.width=w;mask.height=h;
 const ctx=mask.getContext('2d',{willReadFrequently:true});
 const scale=shapeHeight/102;
 ctx.setTransform(scale,0,0,scale,(w-280*scale)/2,(h-102*scale)/2);
 ctx.fillStyle='#fff';ctx.fill(new Path2D(path));
 const pixels=ctx.getImageData(0,0,w,h).data;
 const field=new Float32Array(w*h);field.fill(1e5);
 const inside=i=>pixels[i*4+3]>127;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   const i=y*w+x;
   if(inside(i)!==inside(i-1)||inside(i)!==inside(i+1)||inside(i)!==inside(i-w)||inside(i)!==inside(i+w))field[i]=0;
 }
 for(let y=1;y<h;y++)for(let x=1;x<w-1;x++){
   const i=y*w+x;field[i]=Math.min(field[i],field[i-1]+1,field[i-w]+1,field[i-w-1]+Math.SQRT2,field[i-w+1]+Math.SQRT2);
 }
 for(let y=h-2;y>=0;y--)for(let x=w-2;x>0;x--){
   const i=y*w+x;field[i]=Math.min(field[i],field[i+1]+1,field[i+w]+1,field[i+w-1]+Math.SQRT2,field[i+w+1]+Math.SQRT2);
 }
 const data=new Uint8Array(w*h*4);
 for(let i=0;i<field.length;i++){
   const signed=field[i]*(inside(i)?1:-1);
   const packed=Math.max(0,Math.min(65535,Math.round(32768+signed*64)));
   data[i*4]=packed>>8;data[i*4+1]=packed&255;data[i*4+3]=255;
 }
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 return tex;
}

async function init(){
 if(!gl)throw new Error('This browser does not support WebGL.');
 const source=await fetch('./button-shape.svg');
 if(!source.ok)throw new Error('The SVG shape could not be loaded.');
 const xml=new DOMParser().parseFromString(await source.text(),'image/svg+xml');
 const path=xml.querySelector('path')?.getAttribute('d');
 if(!path)throw new Error('The supplied SVG has no path.');
 const program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 const attribute=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
 distanceTexture(path);
 const uniform=name=>gl.getUniformLocation(program,name);
 const uniforms=Object.fromEntries(['resolution','lightOffset','spread','gloss','textureAmount'].map(n=>[n,uniform(n)]));
 let light=[0,0],target=[0,0],raf=0;
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function draw(){
   raf=0;
   const bounds=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
   const w=Math.round(bounds.width*dpr),h=Math.round(bounds.height*dpr);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
   gl.uniform2f(uniforms.resolution,w,h);gl.uniform2f(uniforms.lightOffset,...light);
   gl.uniform1f(uniforms.spread,Number(document.querySelector('#spread').value));
   gl.uniform1f(uniforms.gloss,Number(document.querySelector('#gloss').value));
   gl.uniform1f(uniforms.textureAmount,Number(document.querySelector('#texture').value));
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 }
 const request=()=>{if(!raf)raf=requestAnimationFrame(draw);};
 const follow=()=>{
   light=light.map((v,i)=>v+(target[i]-v)*.14);draw();
   if(Math.abs(light[0]-target[0])+Math.abs(light[1]-target[1])>.002)raf=requestAnimationFrame(follow);
 };
 wax.addEventListener('pointermove',event=>{
   if(reducedMotion)return;
   const r=wax.getBoundingClientRect();target=[(event.clientX-r.left)/r.width*2-1,(event.clientY-r.top)/r.height*2-1];
   if(!raf)raf=requestAnimationFrame(follow);
 });
 wax.addEventListener('pointerleave',()=>{target=[0,0];if(!raf)raf=requestAnimationFrame(follow);});
 new ResizeObserver(request).observe(wax);
 document.querySelectorAll('input[type=range]').forEach(input=>input.addEventListener('input',request));
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();status.textContent='Graphics context lost. Reload to restore the material.';});
 draw();status.textContent='Live · procedural WebGL material';
}

document.querySelectorAll('[data-mode]').forEach(button=>{
 if(button.tagName!=='BUTTON')return;
 button.addEventListener('click',()=>{
   stage.dataset.mode=button.dataset.mode;
   document.querySelectorAll('.segmented button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   document.querySelector('.divider').hidden=button.dataset.mode!=='split';
 });
});
document.querySelector('#label-toggle').addEventListener('change',event=>document.querySelector('.button-label').hidden=!event.target.checked);
document.querySelector('.background').addEventListener('click',()=>document.body.classList.toggle('dark'));
init().catch(error=>{status.textContent=error.message;status.style.color='#b00020';console.error(error);});
