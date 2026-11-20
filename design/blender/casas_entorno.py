"""Casas «del entorno»: ilustradas en 3D con materiales del altiplano y la misma luz de crepúsculo
que los paisajes (escenas.py), para que se vean construidas en ese mundo y no como iconos.

Uso:
  blender --background --factory-startup --python design/blender/casas_entorno.py -- <carpeta_salida> [--prueba]

Salida por sector: casa-<sector>-0.webp (puerta cerrada), -1 (entreabierta) y -2 (abierta, con luz
saliendo). La web encadena los tres cuadros al pasar el cursor. Fondo transparente.
Materiales: adobe con textura, piedra en el zócalo, teja colonial, calamina, madera pintada (azul o
verde como las puertas de los pueblos), ventanas con marco y luz cálida, un aguayo tendido y faroles.
Colores apagados a propósito: nada de plástico brillante.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from casas import box, cyl, lin, mesh_obj, setup_render  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = os.path.abspath(args[0] if args else "out")
PRUEBA = "--prueba" in args
ONLY = [a for a in args[1:] if not a.startswith("--")]
os.makedirs(OUT, exist_ok=True)

SECTORS = ["restaurant", "cafe", "workshop", "store", "studio", "other"]
DOOR_STATES = [0, 42, 84]  # grados de apertura


# ── materiales ────────────────────────────────────────────────────────────────
def node_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree


def textured(name, hex_a, hex_b, scale=14.0, rough=0.9, bump=0.25, metallic=0.0, detail=6.0):
    """Superficie con variación de color y relieve (adobe, piedra, madera, revoque)."""
    m, nt = node_mat(name)
    if nt is None:
        return m
    bsdf = nt.nodes["Principled BSDF"]
    co = nt.nodes.new("ShaderNodeTexCoord")
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = detail
    tex.inputs["Roughness"].default_value = 0.6
    nt.links.new(co.outputs["Object"], tex.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (*lin(hex_a), 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*lin(hex_b), 1)
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump
    nt.links.new(tex.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def plain(name, hexc, rough=0.6, metallic=0.0, emission=0.0):
    m, nt = node_mat(name)
    if nt is None:
        return m
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(hexc), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    if emission:
        b.inputs["Emission Color"].default_value = (*lin(hexc), 1)
        b.inputs["Emission Strength"].default_value = emission
    return m


STONE = lambda: textured("Piedra", "#4A4646", "#7A746C", scale=6, bump=0.6)  # noqa: E731
WOOD = lambda: textured("Madera", "#3E2A1E", "#6B4A32", scale=30, bump=0.15, rough=0.7)  # noqa: E731
GLOW = lambda: plain("Luz-ventana", "#F2A659", emission=1.5)  # noqa: E731
INSIDE = lambda: plain("Luz-interior", "#FFB866", emission=4.5)  # noqa: E731
TEJA = lambda: textured("Teja", "#8E3F26", "#B5603A", scale=10, bump=0.2, rough=0.75)  # noqa: E731
CALAMINA = lambda: textured("Calamina", "#6E7782", "#9AA3AD", scale=4, bump=0.1, rough=0.35, metallic=0.7)  # noqa: E731

WALLS = {
    "restaurant": ("#B9885C", "#D3A87A"),  # adobe ocre
    "cafe": ("#D9D0BF", "#ECE5D6"),  # cal blanca
    "workshop": ("#A06A48", "#BE8862"),  # ladrillo de adobe
    "store": ("#C9A24E", "#DDBE72"),  # revoque amarillo apagado
    "studio": ("#7E8FB0", "#98A8C6"),  # revoque azul andino
    "other": ("#BFA27E", "#D4BC98"),
}
DOORS = {"restaurant": "#2F5D73", "cafe": "#3F6B4F", "workshop": "#5A6068", "store": "#7A3A2C", "studio": "#3F3550", "other": "#5A3A26"}
AGUAYO = ["#9E2F4C", "#C8743F", "#D9B556", "#3F7F5A", "#4E6FA6"]


def window(prefix, x, z, ww, wh, d, parent, muntins=True):
    y = -d / 2
    wood = WOOD()
    box(f"{prefix}-marco", (ww + 0.07, 0.05, wh + 0.07), (x, y - 0.012, z), wood, parent, bevel=0.008)
    box(f"{prefix}-vidrio", (ww, 0.03, wh), (x, y - 0.03, z), GLOW(), parent, bevel=0)
    if muntins:
        box(f"{prefix}-cruzv", (0.018, 0.05, wh), (x, y - 0.04, z), wood, parent, bevel=0)
        box(f"{prefix}-cruzh", (ww, 0.05, 0.018), (x, y - 0.04, z), wood, parent, bevel=0)
    box(f"{prefix}-alfeizar", (ww + 0.12, 0.09, 0.03), (x, y - 0.045, z - wh / 2 - 0.03), STONE(), parent, bevel=0.006)


def door(sector, d, x, parent, w=0.36, h=0.64, angle=0):
    """Puerta de tablones pintados con bisagra a la izquierda; detrás, el interior iluminado."""
    y = -d / 2
    # hueco iluminado delante del muro y marco de tres piezas (no un bloque que lo tape)
    box("Hueco", (w, 0.02, h), (x, y - 0.012, 0.14 + h / 2), INSIDE(), parent, bevel=0)
    wood = WOOD()
    for sx in (-1, 1):
        box(f"Jamba{sx}", (0.045, 0.06, h + 0.05), (x + sx * (w / 2 + 0.022), y - 0.02, 0.14 + h / 2 + 0.02), wood, parent, bevel=0.006)
    box("Dintel", (w + 0.13, 0.06, 0.05), (x, y - 0.02, 0.14 + h + 0.03), wood, parent, bevel=0.006)
    hinge = bpy.data.objects.new("Bisagra", None)
    hinge.location = (x - w / 2, y - 0.045, 0.14)
    hinge.parent = parent
    bpy.context.scene.collection.objects.link(hinge)
    paint = textured(f"Puerta-{sector}", DOORS[sector], DOORS[sector], scale=40, bump=0.12, rough=0.55)
    n = 4
    for i in range(n):
        box(f"Tablon{i}", (w / n - 0.006, 0.035, h), (w / n * (i + 0.5), 0, h / 2), paint, hinge, bevel=0.004)
    box("Travesano", (w - 0.02, 0.045, 0.04), (w / 2, -0.004, h * 0.72), paint, hinge, bevel=0.004)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=(w - 0.05, -0.04, h * 0.5))
    knob = bpy.context.active_object
    knob.data.materials.append(plain("Bronce", "#B08A4A", rough=0.3, metallic=0.9))
    knob.parent = hinge
    # se abre hacia afuera (hacia quien mira), dejando ver el interior encendido
    hinge.rotation_euler = (0, 0, math.radians(-angle))
    # luz que sale cuando la puerta se abre
    if angle > 0:
        ld = bpy.data.lights.new("Derrame", "POINT")
        ld.energy = 4 + angle * 0.3
        ld.color = lin("#FFB866")
        ld.shadow_soft_size = 0.15
        lo = bpy.data.objects.new("Derrame", ld)
        lo.location = (x, y - 0.25, 0.45)
        lo.parent = parent
        bpy.context.scene.collection.objects.link(lo)
    return hinge


def lamp(x, z, d, parent):
    y = -d / 2 - 0.08
    box("Brazo", (0.02, 0.12, 0.02), (x, y + 0.05, z + 0.08), plain("Hierro", "#2A2A2E", rough=0.5, metallic=0.6), parent, bevel=0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=(x, y, z))
    o = bpy.context.active_object
    o.data.materials.append(plain("Farol", "#FFD9A0", emission=6.0))
    o.parent = parent


def aguayo_cloth(x, z, d, parent, w=0.34, h=0.3):
    """Aguayo tendido en el alféizar: franjas en colores apagados."""
    for i, c in enumerate(AGUAYO * 2):
        box(f"Aguayo{i}", (w, 0.012, h / 10), (x, -d / 2 - 0.07, z - i * h / 10), plain(f"Ag-{c}", c, rough=0.85), parent, bevel=0)


def plant(x, d, parent, y_off=0.14):
    cyl("Maceta", 0.065, 0.13, (x, -d / 2 - y_off, 0.065), textured("Barro", "#8E4A2E", "#B0623E", scale=20), parent, verts=14)
    for k, (dx, dz, r) in enumerate(((0, 0.2, 0.09), (-0.04, 0.16, 0.07), (0.045, 0.17, 0.065))):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=r, location=(x + dx, -d / 2 - y_off, dz), subdivisions=2)
        o = bpy.context.active_object
        o.data.materials.append(textured("Hojas", "#2F5A33", "#4E7D45", scale=40, bump=0.3))
        o.parent = parent


def tile_roof(w, d, h, parent, rise=0.46, over=0.13):
    """Teja colonial: faldones con medias cañas."""
    hw, hd = w / 2 + over, d / 2 + over
    z = h - rise * over / hd
    teja = TEJA()
    for side in (-1, 1):
        mesh_obj(
            f"Faldon{side}",
            [(-hw, side * hd, z), (hw, side * hd, z), (hw, 0, z + rise), (-hw, 0, z + rise)],
            [(0, 1, 2, 3)],
            teja,
            parent,
        ).modifiers.new("S", "SOLIDIFY").thickness = 0.05
        mesh_obj(f"Hastial{side}", [(side * w / 2, -d / 2, h), (side * w / 2, d / 2, h), (side * w / 2, 0, z + rise - 0.02)], [(0, 1, 2)], bpy.data.materials["Muro"], parent)
    L = math.hypot(hd, rise)
    n = int(2 * hw / 0.075)
    for side in (-1, 1):
        theta = -math.atan2(hd, rise) * (-side)
        nrm = Vector((0, side * rise / L, hd / L))
        for i in range(n):
            x = -hw + (i + 0.5) * 2 * hw / n
            c = Vector((x, side * hd / 2, z + rise / 2)) + nrm * 0.04
            cyl(f"Teja{side}{i}", 0.033, L, c, teja, parent, rot=(theta, 0, 0), verts=10)
    cyl("Cumbrera", 0.045, 2 * hw, (0, 0, z + rise + 0.03), teja, parent, rot=(0, math.radians(90), 0), verts=12)


def build(sector, door_angle):
    root = bpy.data.objects.new(f"Casa-{sector}", None)
    bpy.context.scene.collection.objects.link(root)
    wa, wb = WALLS[sector]
    muro = textured("Muro", wa, wb, scale=9, bump=0.35)
    w, d, h = {"restaurant": (1.5, 1.1, 1.62), "workshop": (1.7, 1.15, 1.25), "store": (1.65, 1.1, 1.3), "studio": (1.35, 1.1, 1.55)}.get(sector, (1.4, 1.1, 1.2))

    if sector == "other":
        # «tu idea»: obra empezada — muros de adobe a medio levantar, andamio de eucalipto y adobes apilados
        adobe = textured("Adobe", "#A87E58", "#C49A70", scale=12, bump=0.5)
        for k, (bw, bh) in enumerate(((1.4, 0.55), (1.4, 0.35))):
            box(f"Muro{k}", (bw, 0.16, bh), (0, -0.47 + k * 0.94, bh / 2), adobe, root, bevel=0.01)
        box("MuroIzq", (0.16, 0.94, 0.75), (-0.62, 0, 0.375), adobe, root, bevel=0.01)
        box("MuroDer", (0.16, 0.94, 0.45), (0.62, 0, 0.225), adobe, root, bevel=0.01)
        palo = textured("Eucalipto", "#6B5A44", "#8E7A5E", scale=30, bump=0.2)
        for x in (-0.82, 0.82):
            for y in (-0.7, 0.7):
                cyl("Poste", 0.025, 1.5, (x, y, 0.75), palo, root, verts=8)
        for z in (0.6, 1.15):
            cyl("Travesano", 0.02, 1.7, (0, -0.7, z), palo, root, rot=(0, math.radians(90), 0), verts=8)
            box("Tablon", (1.7, 0.22, 0.03), (0, -0.7, z + 0.03), WOOD(), root, bevel=0.004)
        for i in range(9):
            box(f"Pila{i}", (0.24, 0.12, 0.09), (0.95 + (i % 3) * 0.02, -0.2 + (i % 3) * 0.13, 0.05 + (i // 3) * 0.095), adobe, root, bevel=0.008)
        box("Base", (1.55, 1.15, 0.05), (0, 0, 0.025), STONE(), root, bevel=0.01)
        return root

    box("Cuerpo", (w, d, h), (0, 0, h / 2), muro, root, bevel=0.02)
    box("Zocalo", (w + 0.06, d + 0.06, 0.16), (0, 0, 0.08), STONE(), root, bevel=0.015)

    if sector == "restaurant":
        door(sector, d, 0, root, w=0.4, h=0.7, angle=door_angle)
        for x in (-0.5, 0.5):
            window(f"V{x}", x, 0.55, 0.26, 0.32, d, root)
        # balcón cerrado de madera (Potosí, Sucre)
        wood = WOOD()
        bw, by, bz = 0.86, -d / 2 - 0.17, 1.05
        box("Balcon-piso", (bw + 0.08, 0.36, 0.05), (0, by, bz), wood, root)
        for x in (-0.3, 0, 0.3):
            box("Mensula", (0.06, 0.2, 0.13), (x, -d / 2 - 0.09, bz - 0.09), wood, root)
        box("Balcon-antepecho", (bw, 0.32, 0.18), (0, by, bz + 0.12), wood, root)
        box("Balcon-vidrio", (bw - 0.06, 0.28, 0.3), (0, by, bz + 0.36), GLOW(), root, bevel=0)
        for i in range(8):
            box(f"Celosia{i}", (0.026, 0.33, 0.32), (-bw / 2 + 0.03 + i * (bw - 0.06) / 7, by, bz + 0.36), wood, root, bevel=0)
        box("Balcon-tapa", (bw + 0.12, 0.4, 0.05), (0, by, bz + 0.54), wood, root)
        tile_roof(w, d, h, root)
        box("Chimenea", (0.17, 0.17, 0.42), (0.45, 0.22, h + 0.45), textured("Muro", wa, wb), root)
        lamp(-0.35, 0.95, d, root)
        aguayo_cloth(0.5, 0.36, d, root)
    elif sector == "cafe":
        door(sector, d, -0.33, root, angle=door_angle)
        window("V", 0.3, 0.55, 0.44, 0.36, d, root)
        box("Parapeto", (w + 0.08, d + 0.08, 0.12), (0, 0, h + 0.06), STONE(), root)
        stripes = ["#C8743F", "#EBDCC0"]
        n = 12
        for i in range(n):
            x = -w / 2 + (i + 0.5) * w / n
            box(f"Toldo{i}", (w / n, 0.44, 0.03), (x, -d / 2 - 0.2, 1.0), plain(f"T-{stripes[i % 2]}", stripes[i % 2], rough=0.9), root, bevel=0, rot=(math.radians(28), 0, 0))
        cyl("Letrero", 0.2, 0.05, (0, -d / 2 - 0.05, h + 0.32), WOOD(), root, rot=(math.radians(90), 0, 0))
        cyl("Taza", 0.08, 0.06, (0, -d / 2 - 0.09, h + 0.32), plain("Crema", "#EBDCC0", rough=0.5), root, rot=(math.radians(90), 0, 0), verts=16)
        plant(-0.62, d, root)
        plant(0.64, d, root)
    elif sector == "workshop":
        door(sector, d, -0.55, root, w=0.3, h=0.6, angle=door_angle)
        gx = 0.24
        metal = textured("Porton", "#5E666F", "#7C858E", scale=3, bump=0.1, rough=0.4, metallic=0.6)
        box("Porton", (0.84, 0.035, 0.78), (gx, -d / 2 - 0.015, 0.16 + 0.39), metal, root, bevel=0.004)
        for i in range(10):
            box(f"Ranura{i}", (0.82, 0.012, 0.012), (gx, -d / 2 - 0.035, 0.2 + i * 0.075), plain("Ranura", "#3C4248", rough=0.4, metallic=0.5), root, bevel=0)
        for i, x in enumerate((-0.55, -0.15, 0.25)):
            window(f"Alta{i}", x + 0.25, 1.02, 0.22, 0.14, d, root, muntins=False)
        s = math.radians(9)
        cal = CALAMINA()
        box("Losa", (w + 0.2, d + 0.28, 0.035), (0, 0, h + 0.1), cal, root, bevel=0, rot=(s, 0, 0))
        n = 28
        for i in range(n):
            x = -(w + 0.2) / 2 + (i + 0.5) * (w + 0.2) / n
            cyl(f"Onda{i}", 0.022, d + 0.28, (x, 0, h + 0.13), cal, root, rot=(math.pi / 2 + s, 0, 0), verts=8)
        lamp(-0.3, 0.9, d, root)
    elif sector == "store":
        door(sector, d, 0.58, root, w=0.34, angle=door_angle)
        vx, vw, vh = -0.2, 1.0, 0.5
        box("Vitrina", (vw, 0.03, vh), (vx, -d / 2 - 0.02, 0.62), GLOW(), root, bevel=0)
        wood = WOOD()
        for i in range(5):
            box(f"Montante{i}", (0.035, 0.05, vh + 0.04), (vx - vw / 2 + i * vw / 4, -d / 2 - 0.035, 0.62), wood, root, bevel=0)
        box("Dintel", (vw + 0.1, 0.06, 0.06), (vx, -d / 2 - 0.035, 0.62 + vh / 2 + 0.04), wood, root, bevel=0)
        box("Rotulo", (0.9, 0.06, 0.17), (0, -d / 2 - 0.035, 1.1), plain("Rotulo", "#EBDCC0", rough=0.7), root)
        # parapeto escalonado (eco del cholet) en colores apagados
        # parapeto escalonado del mismo revoque, con un filete de color por escalón
        widths, hs, cols = [w + 0.06, w * 0.7, w * 0.42], [0.1, 0.13, 0.13], ["#7A3A2C", "#3F7F5A", "#4E6FA6"]
        zz = h
        for i, (ww, hh) in enumerate(zip(widths, hs)):
            box(f"Escalon{i}", (ww, d * 0.5, hh), (0, -d / 4 + 0.03, zz + hh / 2), muro, root, bevel=0.012)
            box(f"Filete{i}", (ww + 0.01, 0.02, 0.03), (0, -d / 2 + 0.02, zz + hh - 0.02), plain(f"Esc-{cols[i]}", cols[i], rough=0.7), root, bevel=0)
            zz += hh
        box("Losa", (w + 0.06, d + 0.06, 0.06), (0, 0.05, h + 0.03), STONE(), root)
        plant(-0.7, d, root, y_off=0.12)
    elif sector == "studio":
        door(sector, d, -0.36, root, angle=door_angle)
        for i, x in enumerate((-0.36, 0.0, 0.36)):
            window(f"Alta{i}", x, 1.12, 0.24, 0.3, d, root)
        cyl("Ojo", 0.2, 0.08, (0.36, -d / 2 - 0.04, 0.58), WOOD(), root, rot=(math.radians(90), 0, 0))
        cyl("Ojo-vidrio", 0.14, 0.09, (0.36, -d / 2 - 0.05, 0.58), plain("Vidrio-frio", "#BFE3F0", emission=1.2), root, rot=(math.radians(90), 0, 0))
        box("Cornisa", (w + 0.1, d + 0.1, 0.09), (0, 0, h + 0.045), STONE(), root)
        lamp(0.0, 0.88, d, root)
        aguayo_cloth(-0.36, 0.98, d, root, w=0.3, h=0.22)
    return root


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Crepusculo")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*lin("#8E9BD0"), 1)
    bg.inputs[1].default_value = 0.9
    scene.world = world
    # sol bajo y cálido (como en los paisajes) + contraluz frío
    sd = bpy.data.lights.new("Sol", "SUN")
    sd.energy = 3.2
    sd.color = lin("#FFD6AE")
    sd.angle = math.radians(4)
    so = bpy.data.objects.new("Sol", sd)
    so.rotation_euler = (math.radians(62), 0, math.radians(-38))
    scene.collection.objects.link(so)
    ad = bpy.data.lights.new("Contraluz", "AREA")
    ad.energy = 260
    ad.color = lin("#9DB0FF")
    ad.size = 3
    ao = bpy.data.objects.new("Contraluz", ad)
    ao.location = (2.6, 3.2, 3.0)
    ao.rotation_euler = (Vector((0, 0, 0.8)) - Vector(ao.location)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(ao)
    return scene


def render(sector, state):
    scene = scene_setup()
    root = build(sector, DOOR_STATES[state])
    root.rotation_euler = (0, 0, math.radians(-24))
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = 54 if sector == "restaurant" else 62  # la casa alta necesita aire para la chimenea
    scene.collection.objects.link(cam)
    cam.location = (1.25, -4.9, 1.75)
    cam.rotation_euler = (Vector((0.05, 0, 0.95)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    setup_render(scene, (640, 560), True)
    scene.render.resolution_percentage = 50 if PRUEBA else 100
    scene.eevee.taa_render_samples = 16 if PRUEBA else 48
    try:
        scene.eevee.use_raytracing = True
    except AttributeError:
        pass
    scene.view_settings.look = "Medium Contrast"
    s = scene.render.image_settings
    s.file_format = "WEBP"
    s.color_mode = "RGBA"
    s.quality = 88
    scene.render.filepath = os.path.join(OUT, f"casa-{sector}-{state}.webp")
    bpy.ops.render.render(write_still=True)


for sec in SECTORS:
    if ONLY and sec not in ONLY:
        continue
    for st in range(len(DOOR_STATES)) if sec != "other" else [0]:
        render(sec, st)
        print("CASA_OK", sec, st)
print("CASAS_ENTORNO_FIN")
