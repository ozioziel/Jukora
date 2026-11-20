"""Jucumari 3D: oso andino estilizado (facetado) + su versión constelación.

Uso (sin interfaz):
  blender --background --factory-startup --python design/blender/jucumari_bear.py -- <carpeta_salida>

Genera:
  jucumari.glb                 malla facetada con colores por vértice (para Three.js)
  jucumari_stars.json          vértices de la constelación y aristas (para la transformación en la web)
  bear_solid.png, bear_constellation.png, bear_mid.png   renders de concepto (fondo transparente)

Todo es original y procedural: metabolas → remallado → reducción a facetas.
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.abspath("out")
os.makedirs(out, exist_ok=True)
random.seed(7)

# ───────────── escena limpia ─────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ───────────── cuerpo: primitivas superpuestas fusionadas por vóxeles ─────────────
# Proporciones de oso andino: hombros altos, cabeza ancha, hocico corto y patas gruesas.
PARTS = [
    # (centro, escala, rotación Y en grados)
    ((0.0, 0, 0.95), (0.86, 0.5, 0.5), 0),  # torso
    ((0.4, 0, 1.08), (0.5, 0.47, 0.52), 0),  # hombros (joroba)
    ((-0.5, 0, 1.0), (0.52, 0.47, 0.5), 0),  # grupa
    ((0.76, 0, 1.17), (0.36, 0.34, 0.36), 0),  # cuello
    ((1.02, 0, 1.28), (0.36, 0.35, 0.33), 0),  # cabeza
    ((1.32, 0, 1.2), (0.21, 0.16, 0.14), -10),  # hocico
    ((1.5, 0, 1.24), (0.065, 0.075, 0.06), 0),  # nariz
    ((0.93, 0.25, 1.57), (0.11, 0.06, 0.11), 0),  # oreja
    ((0.93, -0.25, 1.57), (0.11, 0.06, 0.11), 0),  # oreja
    ((0.55, 0.25, 0.5), (0.18, 0.17, 0.44), 8),  # pata delantera
    ((0.55, -0.25, 0.5), (0.18, 0.17, 0.44), -4),
    ((-0.5, 0.24, 0.52), (0.21, 0.19, 0.44), -6),  # pata trasera
    ((-0.5, -0.24, 0.52), (0.21, 0.19, 0.44), 6),
    ((0.62, 0.25, 0.09), (0.22, 0.16, 0.09), 0),  # garras
    ((0.6, -0.25, 0.09), (0.22, 0.16, 0.09), 0),
    ((-0.44, 0.24, 0.09), (0.22, 0.17, 0.09), 0),
    ((-0.46, -0.24, 0.09), (0.22, 0.17, 0.09), 0),
    ((-1.0, 0, 1.06), (0.1, 0.09, 0.09), 0),  # cola
]
bm = bmesh.new()
for (cx, cy, cz), (sx, sy, sz), ry in PARTS:
    geom = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1.0)
    vs = geom["verts"]
    bmesh.ops.scale(bm, verts=vs, vec=(sx, sy, sz))
    rot = __import__("mathutils").Matrix.Rotation(math.radians(ry), 3, "Y")
    bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=vs, vec=(cx, cy, cz))
me = bpy.data.meshes.new("Jucumari")
bm.to_mesh(me)
bear = bpy.data.objects.new("Jucumari", me)
scene.collection.objects.link(bear)
bpy.context.view_layer.objects.active = bear
bear.select_set(True)

# Fusión (vóxeles) → suavizado → reducción a facetas legibles.
rem = bear.modifiers.new("Remesh", "REMESH")
rem.mode = "VOXEL"
rem.voxel_size = 0.025
smo = bear.modifiers.new("Smooth", "SMOOTH")
smo.factor = 0.8
smo.iterations = 6
bpy.ops.object.modifier_apply(modifier="Remesh")
bpy.ops.object.modifier_apply(modifier="Smooth")
target_faces = 1800
dec = bear.modifiers.new("Decimate", "DECIMATE")
dec.decimate_type = "COLLAPSE"
dec.ratio = min(1.0, target_faces / max(1, len(bear.data.polygons)))
bpy.ops.object.modifier_apply(modifier="Decimate")
for p in bear.data.polygons:
    p.use_smooth = False

# ───────────── colores por vértice: pelaje, «anteojos», pechera y manta de aguayo ─────────────
EYE = [Vector((1.2, 0.15, 1.36)), Vector((1.2, -0.15, 1.36))]
PELT = (0.028, 0.022, 0.02)  # negro cálido
CREAM = (0.98, 0.84, 0.6)
INK = (0.006, 0.005, 0.005)  # ojos
# Manta tejida: franjas vivas con hilos crema finos entre ellas.
AGUAYO = [(0.92, 0.1, 0.38), (1.0, 0.45, 0.06), (1.0, 0.78, 0.12), (0.1, 0.7, 0.38), (0.1, 0.62, 0.95)]

# Color por CARA (dominio esquina): bordes nítidos en marcas y franjas.
col = bear.data.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")


def color_for(c: Vector):
    for e in EYE:
        d = (c - e).length
        if d < 0.045:
            return INK
        # anillo de «anteojos»: más marcado por arriba y hacia el hocico
        if d < 0.1 and c.x > 1.12:
            return CREAM
    if c.x > 1.3 and c.z < 1.34:  # hocico
        return CREAM
    # pechera en V
    if 0.72 < c.x < 1.02 and 0.66 < c.z < 1.08 and abs(c.y) < 0.06 + (1.08 - c.z) * 0.42:
        return CREAM
    return PELT


def in_blanket(c: Vector) -> bool:
    return -0.46 < c.x < 0.22 and c.z > 1.0 + abs(c.y) * 0.3


for poly in bear.data.polygons:
    c = color_for(poly.center)
    for li in poly.loop_indices:
        col.data[li].color = (*c, 1.0)

# ───────────── material ─────────────
mat = bpy.data.materials.new("Pelaje")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeAttribute")
attr.attribute_name = "Col"
nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.42
# Las franjas y marcas emiten un poco: se leen en la oscuridad.
nt.links.new(attr.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 0.35
bear.data.materials.append(mat)

# ───────────── manta tejida: pieza aparte con franjas nítidas (material procedural) ─────────────
bbm = bmesh.new()
bbm.from_mesh(bear.data)
bbm.faces.ensure_lookup_table()
drop = [f for f in bbm.faces if not in_blanket(f.calc_center_median())]
bmesh.ops.delete(bbm, geom=drop, context="FACES")
bbm.normal_update()
for v in bbm.verts:
    v.co += v.normal * 0.018
blanket_me = bpy.data.meshes.new("Manta")
bbm.to_mesh(blanket_me)
blanket = bpy.data.objects.new("Manta", blanket_me)
scene.collection.objects.link(blanket)
sol = blanket.modifiers.new("S", "SOLIDIFY")
sol.thickness = 0.012
smb = blanket.modifiers.new("Sm", "SMOOTH")
smb.factor = 0.5
smb.iterations = 2

bmat = bpy.data.materials.new("Aguayo")
bmat.use_nodes = True
n = bmat.node_tree.nodes
lk = bmat.node_tree.links
bp = n["Principled BSDF"]
tc = n.new("ShaderNodeTexCoord")
sep = n.new("ShaderNodeSeparateXYZ")
lk.new(tc.outputs["Object"], sep.inputs[0])


def math(op, a, b=None):
    m = n.new("ShaderNodeMath")
    m.operation = op
    if isinstance(a, float):
        m.inputs[0].default_value = a
    else:
        lk.new(a, m.inputs[0])
    if b is not None:
        if isinstance(b, float):
            m.inputs[1].default_value = b
        else:
            lk.new(b, m.inputs[1])
    return m.outputs[0]


t = math("DIVIDE", math("ADD", sep.outputs["X"], 0.46), 0.068)
idx = math("DIVIDE", math("MODULO", math("FLOOR", t), 5.0), 5.0)
thread = math("LESS_THAN", math("FRACT", t), 0.18)
ramp = n.new("ShaderNodeValToRGB")
ramp.color_ramp.interpolation = "CONSTANT"
els = ramp.color_ramp.elements
els[0].position, els[0].color = 0.0, (*AGUAYO[0], 1)
els[1].position, els[1].color = 0.19, (*AGUAYO[1], 1)
for k in range(2, 5):
    e2 = els.new(k / 5 - 0.01)
    e2.color = (*AGUAYO[k], 1)
lk.new(idx, ramp.inputs[0])
mix = n.new("ShaderNodeMix")
mix.data_type = "RGBA"
lk.new(thread, mix.inputs["Factor"])
lk.new(ramp.outputs["Color"], mix.inputs[6])
mix.inputs[7].default_value = (*CREAM, 1)
lk.new(mix.outputs[2], bp.inputs["Base Color"])
lk.new(mix.outputs[2], bp.inputs["Emission Color"])
bp.inputs["Emission Strength"].default_value = 0.35
bp.inputs["Roughness"].default_value = 0.7
blanket.data.materials.append(bmat)

# ───────────── constelación: malla muy reducida → estrellas y líneas ─────────────
star_src = bear.copy()
star_src.data = bear.data.copy()
scene.collection.objects.link(star_src)
bpy.context.view_layer.objects.active = star_src
d2 = star_src.modifiers.new("D", "DECIMATE")
d2.decimate_type = "COLLAPSE"
d2.ratio = 0.08
bpy.ops.object.select_all(action="DESELECT")
star_src.select_set(True)
bpy.ops.object.modifier_apply(modifier="D")
verts = [tuple(round(c, 4) for c in v.co) for v in star_src.data.vertices]
edges = [tuple(e.vertices) for e in star_src.data.edges]
with open(os.path.join(out, "jucumari_stars.json"), "w", encoding="utf8") as f:
    json.dump({"vertices": verts, "edges": edges}, f)

# Objeto de estrellas (icosferas en vértices) + líneas (alambre).
stars_bm = bmesh.new()
for v in star_src.data.vertices:
    r = 0.018 + random.random() * 0.02
    m = bmesh.ops.create_icosphere(stars_bm, subdivisions=1, radius=r)
    bmesh.ops.translate(stars_bm, verts=m["verts"], vec=v.co)
stars_me = bpy.data.meshes.new("Stars")
stars_bm.to_mesh(stars_me)
stars = bpy.data.objects.new("Stars", stars_me)
scene.collection.objects.link(stars)
smat = bpy.data.materials.new("Estrella")
smat.use_nodes = True
sb = smat.node_tree.nodes["Principled BSDF"]
sb.inputs["Base Color"].default_value = (1, 0.85, 0.55, 1)
sb.inputs["Emission Color"].default_value = (1, 0.8, 0.45, 1)
sb.inputs["Emission Strength"].default_value = 12
stars_me.materials.append(smat)

wire = star_src
wire.name = "Lineas"
wmod = wire.modifiers.new("W", "WIREFRAME")
wmod.thickness = 0.006
wmat = bpy.data.materials.new("Linea")
wmat.use_nodes = True
wb = wmat.node_tree.nodes["Principled BSDF"]
wb.inputs["Base Color"].default_value = (0.4, 0.8, 1, 1)
wb.inputs["Emission Color"].default_value = (0.45, 0.85, 1, 1)
wb.inputs["Emission Strength"].default_value = 4
wire.data.materials.clear()
wire.data.materials.append(wmat)

# ───────────── luces, cámara, mundo ─────────────
world = bpy.data.worlds.new("Noche")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.01, 0.025, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1
scene.world = world


def light(name, kind, loc, energy, color, size=1.0):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if hasattr(ld, "size"):
        ld.size = size
    lo = bpy.data.objects.new(name, ld)
    lo.location = loc
    scene.collection.objects.link(lo)
    lo.rotation_euler = (Vector((0.2, 0, 1.0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return lo


light("Clave", "AREA", (3.5, -3.0, 3.5), 450, (1.0, 0.88, 0.75), 3)
light("Borde naranja", "AREA", (-2.5, 2.5, 2.8), 1800, (1.0, 0.45, 0.1), 2)
light("Borde azul", "AREA", (2.2, 3.2, 1.0), 1500, (0.15, 0.5, 1.0), 2)

cam_d = bpy.data.cameras.new("Cam")
cam_d.lens = 50
cam = bpy.data.objects.new("Cam", cam_d)
scene.collection.objects.link(cam)
cam.location = (2.5, -3.5, 1.75)
target = Vector((0.25, 0, 0.85))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

# ───────────── motor de render ─────────────
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
try:
    # «Standard» conserva la saturación del tejido (AgX la lavaba a tonos pastel).
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
except TypeError:
    pass


def render(name, show_bear, show_stars, bear_alpha=1.0):
    bear.hide_render = not show_bear
    blanket.hide_render = not show_bear
    stars.hide_render = not show_stars
    wire.hide_render = not show_stars
    bsdf.inputs["Alpha"].default_value = bear_alpha
    mat.blend_method = "BLEND" if bear_alpha < 1 else "OPAQUE"
    scene.render.filepath = os.path.join(out, name)
    bpy.ops.render.render(write_still=True)


render("bear_solid.png", True, False)
render("bear_mid.png", True, True, 0.35)
render("bear_constellation.png", False, True)

# ───────────── exportar GLB (solo el oso, con colores por vértice) ─────────────
bpy.ops.object.select_all(action="DESELECT")
bear.select_set(True)
blanket.select_set(True)
bpy.context.view_layer.objects.active = bear
bpy.ops.export_scene.gltf(
    filepath=os.path.join(out, "jucumari.glb"),
    use_selection=True,
    export_format="GLB",
    export_vertex_color="ACTIVE",
    export_apply=True,
)
print("JUCUMARI_OK", scene.render.engine, len(bear.data.polygons), "caras", len(verts), "estrellas")
