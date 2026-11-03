"""Run with Blender --background --factory-startup --python tools/build-wax-seal.py.

The supplied seal image owns the silhouette and the wax colour. Depth is a
reconstruction, in source-pixel units, not a measured scan of the object.
One relief drives everything: the master .blend, the .glb and the two
textures the website's WebGL seal is relit with (src/wax/wax-gl.mjs).
"""
import bpy
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT.parent / 'output/wax-seal-3d'
# The relit seal's texture masters; tools/optimize-images.py encodes them.
SOURCE = ROOT / 'tools/source-images'
MASTER.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
image = bpy.data.images.load(str(MASTER / 'reference.png'))
W, H = image.size
# Blender's rows run bottom to top, so +row is up, like the mesh.
rgba = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)
alpha = rgba[:, :, 3]
mask = alpha > .08
solid = alpha > .35
tone = rgba[:, :, :3] @ np.array([.6, .25, .15], dtype=np.float32)

def box(a, r):
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]; pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis)
        n = out.shape[axis]
        out = (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
    return out

def blur(a, r):
    for _ in range(3): a = box(a, r)
    return a

def masked_blur(a, weight, r):
    return blur(a * weight, r) / np.maximum(blur(weight, r), 1e-4)

# Distance inside the outline, in source pixels.
outer = np.where(mask, 1000., 0.).astype(np.float32)
for _ in range(90):
    old = outer.copy()
    for axis in (0, 1):
        outer = np.minimum(outer, np.roll(old, 1, axis) + 1)
        outer = np.minimum(outer, np.roll(old, -1, axis) + 1)
    for y, x in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        outer = np.minimum(outer, np.roll(old, (y, x), (0, 1)) + 1.414214)

# The sunken field is a clean oval, not a copy of the wavy outline. Its rim,
# the thin inner ridge, was measured on the image: centre (383, 145) from the
# top left, semi-axes 289 × 83 px.
CX, CY, A, B = 383., H - 145., 289., 83.
X, Y = np.meshgrid(np.arange(W, dtype=np.float32) + .5, np.arange(H, dtype=np.float32) + .5)
u, v = (X - CX) / A, (Y - CY) / B
r = np.sqrt(u * u + v * v) + 1e-6
# Signed distance to the ridge in pixels: negative in the field, positive on the lip.
ridge = (r - 1) / (np.hypot(u / A, v / B) / r)
bump = lambda d, c, s: np.exp(-((d - c) / s) ** 2)

# Across the lip, from the ridge (0) to the outer edge (1). The lip is as wide
# as the image says it is: broad at the ends, narrower along the long sides.
across = np.clip(ridge / np.maximum(ridge + outer, 1), 0, 1)
crest = np.sin(np.pi * np.clip((across - .12) / .88, 0, 1)) ** .7
lip = np.where(ridge > 0, 3.4 + 10.5 * crest, 3.4 - .8 * np.clip(-ridge / 40, 0, 1))
shape = lip + 2.2 * bump(ridge, 0, 2.2)
edge = 1 - np.exp(-outer / 2.6)
# Lumps and drips: where the image's wax is brighter at the scale of a drip,
# it bulges. Shines are clipped first, so a highlight is not read as a hill.
clipped = np.minimum(tone, np.percentile(tone[solid], 90))
clipped = np.where(solid, clipped, np.median(tone[solid]))
on_lip = np.clip(ridge / 6, 0, 1)
lumps = (blur(clipped, 2) - blur(clipped, 9)) * (.3 + 1.7 * on_lip)
grain = (clipped - blur(clipped, 1)) * .8
height = blur(np.where(mask, shape * edge + 9 * lumps + grain, 0), 1) * mask

dy, dx = np.gradient(height)
normal = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
cavity = np.clip(1 - np.maximum(blur(height, 5) - height, 0) * .18, 0, 1)

# The wax colour without the image's own light: shines are filled from their
# surroundings, then the remaining light and shade is mostly flattened, so the
# live light is the only one on the seal.
level = np.median(tone[solid])
local = masked_blur(tone, solid.astype(np.float32), 6)
shine = np.clip((tone - local) / .1 - .4, 0, 1) * solid
keep = (solid & (shine < .3)).astype(np.float32)
albedo = rgba[:, :, :3].copy()
filled = np.stack([masked_blur(albedo[:, :, c], keep, 4) for c in range(3)], axis=-1)
albedo = albedo * (1 - shine[..., None]) + filled * shine[..., None]
flat = albedo @ np.array([.6, .25, .15], dtype=np.float32)
albedo = np.clip(albedo * ((level + (flat - level) * .3) / np.maximum(flat, 1e-3))[..., None], 0, 1)

def texture(name, pixels, colour, save_to=None):
    out = bpy.data.images.new(name, width=W, height=H, alpha=True)
    out.colorspace_settings.name = colour
    out.pixels.foreach_set(pixels.astype(np.float32).ravel())
    if save_to:
        out.filepath_raw = str(save_to)
        out.file_format = 'PNG'
        out.save()
    return out

peak = float(height.max())
normal_image = texture('Wax normal • OpenGL', np.dstack((normal * .5 + .5, alpha)), 'Non-Color')
# The website takes its outline from the seal image, so the colour is opaque.
albedo_image = texture('Wax colour • without baked light', np.dstack((albedo, alpha)), 'sRGB')
texture('Wax colour • web', np.dstack((albedo, np.ones_like(alpha))), 'sRGB', SOURCE / 'wax-seal-albedo.png')
# R,G: OpenGL normal (y up). B: height / peak. A: cavity.
texture('Wax relief • normal, height, cavity',
        np.dstack((normal[:, :, 0] * .5 + .5, normal[:, :, 1] * .5 + .5, height / peak, cavity)),
        'Non-Color', SOURCE / 'wax-seal-relief.png')

def material(name, exact=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    n, links = mat.node_tree.nodes, mat.node_tree.links
    n.clear()
    out = n.new('ShaderNodeOutputMaterial')
    tex = n.new('ShaderNodeTexImage'); tex.image = image
    tex.location = (-500, 100)
    if exact:
        shader = n.new('ShaderNodeEmission')
        links.new(tex.outputs['Color'], shader.inputs['Color'])
    else:
        # Relit wax: the colour without baked light, and the relief's normals.
        colour = n.new('ShaderNodeTexImage'); colour.image = albedo_image
        bumps = n.new('ShaderNodeTexImage'); bumps.image = normal_image
        normal_map = n.new('ShaderNodeNormalMap')
        shader = n.new('ShaderNodeBsdfPrincipled')
        links.new(colour.outputs['Color'], shader.inputs['Base Color'])
        links.new(bumps.outputs['Color'], normal_map.inputs['Color'])
        links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])
        shader.inputs['Roughness'].default_value = .29
        shader.inputs['Coat Weight'].default_value = .28
        shader.inputs['Coat Roughness'].default_value = .2
    transparent = n.new('ShaderNodeBsdfTransparent')
    mix = n.new('ShaderNodeMixShader')
    links.new(tex.outputs['Alpha'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(tex.outputs['Color'] if exact else shader.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs[0])
    mat.blend_method = 'HASHED'
    return mat

exact = material('Reference appearance • exact front', True)
physical = material('Wax • relit, without baked light')
side = bpy.data.materials.new('Wax • edges and underside')
side.diffuse_color = (.24, .003, .006, 1)
side.use_nodes = True
side.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.24, .003, .006, 1)
side.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .3
side_texture = side.node_tree.nodes.new('ShaderNodeTexImage'); side_texture.image=image
side.node_tree.links.new(side_texture.outputs['Alpha'], side.node_tree.nodes.get('Principled BSDF').inputs['Alpha'])
side.blend_method='HASHED'

def mesh(step, name):
    xs = list(range(0, W, step)) + [W]
    ys = list(range(0, H, step)) + [H]
    vertices, faces, lookup, front_faces = [], [], {}, 0
    def vertex(x, y):
        key = (x, y)
        if key not in lookup:
            lookup[key] = len(vertices)
            z = float(height[min(y, H-1), min(x, W-1)])
            vertices.append(((x-W/2)/H, (y-H/2)/H, z/H))
        return lookup[key]
    for yi in range(len(ys)-1):
        for xi in range(len(xs)-1):
            x, y, xx, yy = xs[xi], ys[yi], xs[xi+1], ys[yi+1]
            if not mask[max(0,y-1):min(H,yy+1), max(0,x-1):min(W,xx+1)].any():
                continue
            a,b,c,d = vertex(x,y),vertex(xx,y),vertex(xx,yy),vertex(x,yy)
            faces.extend(((a,b,c),(a,c,d)))
    front_faces = len(faces)
    count = len(vertices)
    vertices += [(x,y,-2.5/H) for x,y,z in vertices]
    edges = {}
    for a,b,c in faces[:]:
        for i,j in ((a,b),(b,c),(c,a)):
            key = tuple(sorted((i,j)))
            if key in edges: del edges[key]
            else: edges[key] = (i,j)
        faces.append((c+count,b+count,a+count))
    for a,b in edges.values():
        faces.extend(((b,a,a+count),(b,a+count,b+count)))
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces); data.update()
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj)
    data.materials.append(exact); data.materials.append(side); data.materials.append(physical)
    uv = data.uv_layers.new(name='Reference projection')
    for face in data.polygons:
        face.material_index = 0 if face.index < front_faces else 1
        face.use_smooth = True
        for loop in face.loop_indices:
            x,y,z = data.vertices[data.loops[loop].vertex_index].co
            uv.data[loop].uv = (x*H/W+.5, y+.5)
    obj.shape_key_add(name='Basis')
    stretch = obj.shape_key_add(name='Label width + one seal height')
    for v in stretch.data:
        # Fixed end caps; only the inner span extends. UVs remain attached.
        x = v.co.x
        v.co.x += max(-.5, min(.5, x / ((W/H)-1)))
    obj['source'] = 'public/assets/works-wax-seal.webp'
    obj['depth'] = 'Reconstructed relief, not measured depth'
    obj['width_control'] = 'Shape key: add one height unit at value 1; end caps retain their size'
    return obj, front_faces

master, _ = mesh(1, 'Wax seal • master')
web, _ = mesh(3, 'Wax seal • web')
master.hide_render = True; master.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
web.select_set(True); bpy.context.view_layer.objects.active = web
bpy.ops.export_scene.gltf(filepath=str(MASTER / 'wax-seal.glb'), use_selection=True,
                         export_format='GLB', export_morph=True, export_extras=True)
# Reference camera has exactly the source photograph's framing.
bpy.ops.object.camera_add(location=(0,0,5))
camera=bpy.context.object; camera.name='Reference • exact front'; camera.data.type='ORTHO'
camera.data.ortho_scale=W/H; bpy.context.scene.camera=camera
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=16
scene.render.resolution_x=W; scene.render.resolution_y=H; scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.view_settings.exposure=0; scene.view_settings.gamma=1
scene.world.color=(.15,.15,.15)
bpy.ops.object.light_add(type='AREA', location=(-1,1,3))
bpy.context.object.data.energy=180; bpy.context.object.data.size=3
image.pack(); normal_image.pack(); albedo_image.pack()
note=bpy.data.texts.new('READ ME')
note.write('Exact supplied front texture on reconstructed, closed relief geometry.\n'
           'Master and Web objects share source UVs. Unhide Master to edit high resolution geometry.\n'
           'Shape key extends middle while keeping end-cap size. Material slot 0 preserves the image;\n'
           'slot 2 is relit wax: the colour without baked light, with the relief as a normal map.\n'
           'The inner field is an oval measured on the image; the lip spans it to the real outline.\n'
           'Unknown underside is plain red wax. No claim of measured full 3D equivalence.\n')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(MASTER / 'wax-seal-master.blend'), compress=True)
scene.render.filepath=str(MASTER / 'front-render.png')
bpy.ops.render.render(write_still=True)
# src/wax/wax-gl.mjs keeps this as WAX_RELIEF_PEAK.
print('WAX_BUILD_COMPLETE', len(web.data.polygons), 'triangles; WAX_RELIEF_PEAK =', round(peak / H, 4))
