"""Casas de negocio 3D con rasgos bolivianos, una por sector.

Uso directo (fila de casas + un GLB por casa):
  blender --background --factory-startup --python design/blender/casas.py -- <carpeta_salida>

También se importa como módulo desde escenas.py (build_house).

Cada casa es una construcción propia y reconocible por su silueta (nunca una tarjeta):
  restaurante  rojo     dos plantas, techo de teja colonial y balcón cerrado de madera
  cafetería    naranja  toldo a franjas k'isa y letrero con taza
  taller       verde    techo de calamina ondulada y portón enrollable
  tienda       amarillo fachada tipo cholet: parapeto escalonado y vitrina con marcos de color
  estudio      fucsia   cholet con vidrio celeste, rombos y lente
  tu idea      morado   estructura luminosa en obra, con andamio
Los colores salen del aguayo (fucsia, rojo, naranja, amarillo, verde, morado) y la franja
tejida bajo la cornisa es una k'isa: bandas que pasan de oscuro a claro.
"""
import math
import os
import sys

import bpy
from mathutils import Vector


def lin(hexstr):
    """Color sRGB en hex → lineal (Blender trabaja en lineal; sin esto los colores se lavan)."""
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "rojo": "#D8262E",
    "naranja": "#F26B1D",
    "amarillo": "#F8C81E",
    "verde": "#0E9A4A",
    "fucsia": "#E3197B",
    "morado": "#6E2C8F",
    "azul": "#1E64D8",
    "celeste": "#36C2E8",
    "crema": "#F4EADB",
    "teja": "#B4502C",
    "teja2": "#93391F",
    "madera": "#4A2A1A",
    "calamina": "#8D9AA6",
    "noche": "#0B0A14",
}
SECTOR_COLOR = {
    "restaurant": "rojo",
    "cafe": "naranja",
    "workshop": "verde",
    "store": "amarillo",
    "studio": "fucsia",
    "other": "morado",
}
KISA = {
    "rojo": ["#4A0D16", "#8E1426", "#D8262E", "#F26B1D", "#F8C81E"],
    "naranja": ["#5A1E06", "#B4400F", "#F26B1D", "#F8C81E", "#FFF0B3"],
    "verde": ["#06301B", "#0E6B35", "#0E9A4A", "#7CCB5A", "#F8C81E"],
    "amarillo": ["#3A0A2A", "#8E1458", "#E3197B", "#F58BB8", "#FFE3F0"],
    "fucsia": ["#1E0B2E", "#4A1A66", "#6E2C8F", "#36C2E8", "#D8F6FF"],
    "morado": ["#1E0B2E", "#4A1A66", "#6E2C8F", "#B06BD0", "#F0D8FF"],
}


def mat(name, hexc=None, emission=0.0, rough=0.55, metallic=0.0, color=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    col = color or lin(hexc)
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    if emission:
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = emission
    return m


def _link(o, parent):
    if o.name not in bpy.context.scene.collection.objects and not o.users_collection:
        bpy.context.scene.collection.objects.link(o)
    if parent:
        o.parent = parent
    return o


def box(name, size, loc, m, parent=None, bevel=0.012, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        bv = o.modifiers.new("B", "BEVEL")
        bv.width = bevel
        bv.segments = 2
    o.data.materials.append(m)
    return _link(o, parent)


def cyl(name, r, depth, loc, m, parent=None, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return _link(o, parent)


def mesh_obj(name, verts, faces, m, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(m)
    if parent:
        o.parent = parent
    return o


def gable(name, w, d, rise, over, z, m_roof, m_wall, parent, tiles=None):
    """Techo a dos aguas (cumbrera paralela a la fachada) con hastiales rellenos."""
    hw, hd = w / 2 + over, d / 2 + over
    z_top = z
    z = z - rise * over / hd  # el faldón cruza la línea del muro justo en su coronación
    roof = mesh_obj(
        name,
        [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z), (-hw, 0, z + rise), (hw, 0, z + rise)],
        [(0, 1, 5, 4), (3, 4, 5, 2)],
        m_roof,
        parent,
    )
    so = roof.modifiers.new("S", "SOLIDIFY")
    so.thickness = 0.045
    for sx in (-1, 1):
        x = sx * w / 2
        mesh_obj(f"{name}-hastial", [(x, -d / 2, z_top), (x, d / 2, z_top), (x, 0, z + rise - 0.02)], [(0, 1, 2)], m_wall, parent)
    if tiles:
        # tejas: medias cañas siguiendo cada faldón
        L = math.hypot(hd, rise)
        n = int(2 * hw / 0.072)
        for side in (-1, 1):
            theta = -math.atan2(hd, rise) * (-side)
            nx, nz = side * rise / L, hd / L  # normal hacia afuera (y, z)
            for i in range(n):
                x = -hw + (i + 0.5) * 2 * hw / n
                c = Vector((x, side * hd / 2, z + rise / 2)) + Vector((0, nx, nz)) * 0.035
                cyl(f"{name}-teja{side}{i}", 0.03, L, c, tiles[i % len(tiles)], parent, rot=(theta, 0, 0), verts=10)
    return roof


def kisa_band(prefix, w, d, z, colors, parent, step=0.024):
    """Franja tejida que envuelve la casa: cinco bandas de oscuro a claro (k'isa)."""
    seq = colors + colors[-2::-1]
    for i, hexc in enumerate(seq):
        box(f"{prefix}{i}", (w + 0.014, d + 0.014, step), (0, 0, z - i * step), mat(f"K-{hexc}", hexc, rough=0.7), parent, bevel=0)
    return z - len(seq) * step


def window(prefix, x, z, ww, wh, d, parent, glass=None, frame="crema"):
    y = -d / 2
    box(f"{prefix}-marco", (ww + 0.06, 0.03, wh + 0.06), (x, y - 0.006, z), mat(f"Marco-{frame}", HEX[frame], rough=0.6), parent, bevel=0.006)
    box(f"{prefix}", (ww, 0.03, wh), (x, y - 0.016, z), glass or mat("Ventana", "#FFB45A", emission=1.4), parent, bevel=0)
    box(f"{prefix}-alfeizar", (ww + 0.1, 0.07, 0.025), (x, y - 0.03, z - wh / 2 - 0.03), mat(f"Marco-{frame}", HEX[frame]), parent, bevel=0)


def door(d, x, parent, w=0.36, h=0.6):
    box("Interior", (w, 0.02, h), (x, -d / 2 + 0.005, 0.12 + h / 2), mat("Interior", "#FF9A3C", emission=2.0), parent, bevel=0)
    box("Marco-puerta", (w + 0.07, 0.03, h + 0.05), (x, -d / 2 - 0.004, 0.12 + h / 2 + 0.01), mat("Marco-crema", HEX["crema"]), parent, bevel=0.006)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(w / 2, 0, h / 2))
    o = bpy.context.active_object
    o.name = "Puerta"
    o.scale = (w, 0.04, h)
    bpy.ops.object.transform_apply(scale=True, location=True)
    o.location = (x - w / 2, -d / 2 - 0.03, 0.12)
    o.data.materials.append(mat("Puerta", HEX["madera"], rough=0.45))
    o.parent = parent
    return o


def stepped_parapet(prefix, w, d, z, colors, parent):
    """Parapeto escalonado (chakana), típico de las fachadas cholet de El Alto."""
    widths = [w, w * 0.74, w * 0.48, w * 0.24]
    hs = [0.07, 0.11, 0.12, 0.12]
    zz = z
    for i, (ww, hh) in enumerate(zip(widths, hs)):
        box(f"{prefix}{i}", (ww, 0.09, hh), (0, -d / 2 + 0.03, zz + hh / 2), mat(f"P-{colors[i % len(colors)]}", colors[i % len(colors)], rough=0.45), parent, bevel=0.008)
        zz += hh
    return zz


def rhombus(name, x, z, s, d, hexc, parent, emission=0.0):
    return box(name, (s, 0.03, s), (x, -d / 2 - 0.02, z), mat(f"R-{hexc}-{emission}", hexc, emission=emission, rough=0.4), parent, bevel=0.004, rot=(0, math.radians(45), 0))


def build_house(sector, origin=(0, 0, 0), rot_z=0.0):
    color = SECTOR_COLOR[sector]
    body_m = mat(f"Fachada-{sector}", HEX[color], rough=0.62)
    root = bpy.data.objects.new(f"Casa-{sector}", None)
    root.location = origin
    root.rotation_euler = (0, 0, rot_z)
    bpy.context.scene.collection.objects.link(root)
    k = KISA[color]
    zocalo = mat("Zocalo", "#2A1E22", rough=0.8)

    if sector == "other":
        # «tu idea»: la casa aún en obra, dibujada con vigas luminosas y un andamio
        glow = mat("Obra", "#FFD27A", emission=3.0)
        w, d, h = 1.4, 1.1, 1.2
        b = box("Estructura", (w, d, h), (0, 0, h / 2), glow, root, bevel=0)
        wf = b.modifiers.new("W", "WIREFRAME")
        wf.thickness = 0.03
        r = mesh_obj("Techo-obra", [(-w / 2, -d / 2, h), (w / 2, -d / 2, h), (w / 2, d / 2, h), (-w / 2, d / 2, h), (-w / 2, 0, h + 0.5), (w / 2, 0, h + 0.5)], [(0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5)], glow, root)
        wr = r.modifiers.new("W", "WIREFRAME")
        wr.thickness = 0.03
        pole = mat("Andamio", "#B06BD0", rough=0.5, metallic=0.4)
        for x in (-w / 2 - 0.18, w / 2 + 0.18):
            for y in (-d / 2 - 0.16,):
                cyl("Poste", 0.02, 1.5, (x, y, 0.75), pole, root, verts=8)
        for z in (0.5, 1.0):
            cyl("Travesano", 0.016, w + 0.36, (0, -d / 2 - 0.16, z), pole, root, rot=(0, math.radians(90), 0), verts=8)
            box("Tablon", (w + 0.36, 0.2, 0.025), (0, -d / 2 - 0.16, z + 0.02), mat("Tablon", "#C98A3A", rough=0.8), root, bevel=0)
        box("Base", (w + 0.1, d + 0.1, 0.06), (0, 0, 0.03), mat("Base-obra", "#3A2D44", rough=0.9), root, bevel=0)
        return root

    if sector == "restaurant":
        w, d, h = 1.45, 1.1, 1.72
    elif sector == "workshop":
        w, d, h = 1.65, 1.15, 1.3
    elif sector == "store":
        w, d, h = 1.7, 1.1, 1.35
    elif sector == "studio":
        w, d, h = 1.4, 1.1, 1.62
    else:
        w, d, h = 1.4, 1.1, 1.22

    box("Cuerpo", (w, d, h), (0, 0, h / 2), body_m, root)
    box("Zocalo", (w + 0.05, d + 0.05, 0.14), (0, 0, 0.07), zocalo, root)

    if sector == "restaurant":
        kisa_band("K", w, d, h - 0.02, k, root)
        door(d, 0, root, w=0.4, h=0.66)
        for x in (-0.48, 0.48):
            window(f"Ventana-pb{x}", x, 0.5, 0.24, 0.32, d, root)
        # balcón cerrado colonial (Potosí, Sucre): caja de madera con celosía y vidrio cálido
        wood = mat("Madera", HEX["madera"], rough=0.5)
        bw, by, bz = 0.86, -d / 2 - 0.16, 1.02
        box("Balcon-piso", (bw + 0.08, 0.34, 0.05), (0, by, bz), wood, root)
        for x in (-0.3, 0, 0.3):
            box("Mensula", (0.06, 0.18, 0.12), (x, -d / 2 - 0.08, bz - 0.08), wood, root)
        box("Balcon-antepecho", (bw, 0.3, 0.17), (0, by, bz + 0.11), wood, root)
        box("Balcon-vidrio", (bw - 0.06, 0.26, 0.3), (0, by, bz + 0.35), mat("Ventana", "#FFB45A", emission=1.4), root, bevel=0)
        for i in range(7):
            x = -bw / 2 + 0.02 + i * (bw - 0.04) / 6
            box(f"Balcon-poste{i}", (0.03, 0.31, 0.32), (x, by, bz + 0.35), wood, root, bevel=0)
        box("Balcon-tapa", (bw + 0.1, 0.38, 0.05), (0, by, bz + 0.53), wood, root)
        tiles = [mat("Teja", HEX["teja"], rough=0.55), mat("Teja2", HEX["teja2"], rough=0.6)]
        gable("Techo", w, d, 0.48, 0.12, h, mat("Teja-base", HEX["teja2"], rough=0.7), body_m, root, tiles=tiles)
        box("Chimenea", (0.16, 0.16, 0.42), (0.42, 0.2, h + 0.42), mat("Marco-crema", HEX["crema"]), root)

    elif sector == "cafe":
        kisa_band("K", w, d, h - 0.02, k, root)
        door(d, -0.32, root)
        window("Ventana-cafe", 0.3, 0.55, 0.42, 0.36, d, root)
        box("Parapeto", (w + 0.08, d + 0.08, 0.12), (0, 0, h + 0.06), mat("Trim-verde", HEX["verde"], rough=0.5), root)
        seq = k + k[-2::-1]
        n = 12
        for i in range(n):
            x = -w / 2 + (i + 0.5) * w / n
            box(f"Toldo{i}", (w / n, 0.42, 0.03), (x, -d / 2 - 0.19, 1.0), mat(f"K-{seq[i % len(seq)]}", seq[i % len(seq)]), root, bevel=0, rot=(math.radians(28), 0, 0))
        cyl("Letrero", 0.22, 0.05, (0, -d / 2 - 0.05, h + 0.36), mat("Marco-crema", HEX["crema"]), root, rot=(math.radians(90), 0, 0))
        cyl("Taza", 0.085, 0.13, (0, -d / 2 - 0.1, h + 0.34), mat("Interior", "#FF9A3C", emission=2.0), root, verts=16)
        for x in (-0.62, 0.62):
            cyl("Maceta", 0.07, 0.14, (x, -d / 2 - 0.12, 0.07), mat("Teja", HEX["teja"]), root, verts=12)
            bpy.ops.mesh.primitive_ico_sphere_add(radius=0.11, location=(x, -d / 2 - 0.12, 0.2), subdivisions=1)
            p = bpy.context.active_object
            p.data.materials.append(mat("Planta", "#2F8F3A", rough=0.8))
            p.parent = root

    elif sector == "workshop":
        kisa_band("K", w, d, h - 0.02, k, root)
        door(d, -0.55, root, w=0.3, h=0.58)
        # portón enrollable con ranuras
        gx = 0.22
        box("Porton", (0.82, 0.03, 0.74), (gx, -d / 2 - 0.012, 0.12 + 0.37), mat("Porton", "#A9B4BE", rough=0.35, metallic=0.6), root, bevel=0.004)
        for i in range(9):
            box(f"Ranura{i}", (0.8, 0.012, 0.012), (gx, -d / 2 - 0.03, 0.18 + i * 0.075), mat("Ranura", "#59636D", rough=0.4, metallic=0.5), root, bevel=0)
        for i, x in enumerate((-0.5, -0.1, 0.3)):
            window(f"Ventana-alta{i}", x + 0.2, 1.0, 0.22, 0.14, d, root)
        # techo de calamina: losa inclinada + ondas metálicas
        s = math.radians(9)
        cal = mat("Calamina", HEX["calamina"], rough=0.32, metallic=0.75)
        box("Losa", (w + 0.18, d + 0.26, 0.035), (0, 0, h + 0.1), cal, root, bevel=0, rot=(s, 0, 0))
        n = 26
        for i in range(n):
            x = -(w + 0.18) / 2 + (i + 0.5) * (w + 0.18) / n
            cyl(f"Onda{i}", 0.022, d + 0.26, (x, 0, h + 0.13), cal, root, rot=(math.pi / 2 + s, 0, 0), verts=8)
        cyl("Engranaje", 0.15, 0.05, (gx, -d / 2 - 0.035, 1.02), mat("Marco-crema", HEX["crema"]), root, rot=(math.radians(90), 0, 0), verts=10)

    elif sector == "store":
        kisa_band("K", w, d, h - 0.02, k, root)
        door(d, 0.58, root, w=0.34)
        # vitrina con marcos de colores (como el vidrio de un cholet)
        vx, vw, vh = -0.2, 1.0, 0.5
        box("Vitrina", (vw, 0.03, vh), (vx, -d / 2 - 0.014, 0.6), mat("Ventana", "#FFB45A", emission=1.4), root, bevel=0)
        for i, hexc in enumerate(["#E3197B", "#1E64D8", "#0E9A4A", "#E3197B", "#1E64D8"]):
            x = vx - vw / 2 + i * vw / 4
            box(f"Montante{i}", (0.035, 0.05, vh + 0.04), (x, -d / 2 - 0.03, 0.6), mat(f"P-{hexc}", hexc, rough=0.45), root, bevel=0)
        box("Dintel", (vw + 0.08, 0.05, 0.05), (vx, -d / 2 - 0.03, 0.6 + vh / 2 + 0.03), mat("P-#E3197B", "#E3197B"), root, bevel=0)
        rhombus("Rombo1", -0.62, 1.08, 0.16, d, "#0E9A4A", root)
        rhombus("Rombo2", 0.62, 1.08, 0.16, d, "#E3197B", root)
        box("Rotulo", (0.86, 0.06, 0.16), (0, -d / 2 - 0.03, 1.08), mat("Marco-crema", HEX["crema"]), root)
        box("Losa", (w + 0.06, d + 0.06, 0.06), (0, 0, h + 0.03), mat("Trim-noche", "#1B1630", rough=0.6), root)
        stepped_parapet("Parapeto", w, d, h + 0.06, ["#E3197B", "#0E9A4A", "#1E64D8", "#F26B1D"], root)

    elif sector == "studio":
        kisa_band("K", w, d, h - 0.02, k, root)
        door(d, -0.38, root)
        glass = mat("Vidrio-celeste", HEX["celeste"], emission=0.9, rough=0.08)
        for i, x in enumerate((-0.38, 0.0, 0.38)):
            window(f"Vidrio{i}", x, 1.12, 0.26, 0.3, d, root, glass=glass, frame="crema")
        window("Ventana-pb", 0.3, 0.52, 0.42, 0.34, d, root)
        for i, (x, hexc) in enumerate(((-0.55, "#F8C81E"), (-0.38 + 0.19, "#36C2E8"), (0.19, "#F8C81E"))):
            rhombus(f"Rombo{i}", x, 0.84, 0.1, d, hexc, root)
        cyl("Lente", 0.2, 0.08, (0.5, -d / 2 - 0.05, 0.6), mat("Marco-crema", HEX["crema"]), root, rot=(math.radians(90), 0, 0))
        cyl("Vidrio-lente", 0.13, 0.1, (0.5, -d / 2 - 0.07, 0.6), glass, root, rot=(math.radians(90), 0, 0))
        box("Losa", (w + 0.06, d + 0.06, 0.06), (0, 0, h + 0.03), mat("Trim-noche", "#1B1630", rough=0.6), root)
        stepped_parapet("Parapeto", w, d, h + 0.06, ["#F8C81E", "#36C2E8", "#0E9A4A"], root)
    return root


def setup_render(scene, res, transparent):
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = transparent
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        pass


def area(scene, name, loc, energy, hexc, size=3.0, target=(0, 0, 0.8)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.color = lin(hexc)
    ld.size = size
    lo = bpy.data.objects.new(name, ld)
    lo.location = loc
    lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(lo)
    return lo


def main(out):
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    sectors = list(SECTOR_COLOR)
    roots = []
    # En fila, cada una girada para mostrar un costado: así cada nombre cae bajo su casa.
    for i, s in enumerate(sectors):
        roots.append(build_house(s, (i * 2.5 - 6.25, 0, 0), math.radians(-24)))

    world = bpy.data.worlds.new("Noche")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (*lin("#141838"), 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    area(scene, "Luna", (4, -7, 7), 1500, "#C9D8FF", 7)
    area(scene, "Calida", (-6, -4, 3), 900, "#FF9A4A", 5)
    area(scene, "Azul", (3, 6, 3), 1000, "#3D6BFF", 5)

    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.type = "ORTHO"  # sin perspectiva: las casas quedan equiespaciadas como columnas
    cam.data.ortho_scale = 15.4
    scene.collection.objects.link(cam)
    cam.location = (0, -14, 5.0)
    cam.rotation_euler = (Vector((0, 0, 1.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    setup_render(scene, (2400, 600), True)
    scene.render.filepath = os.path.join(out, "casas.png")
    bpy.ops.render.render(write_still=True)

    # GLB por casa (la puerta queda como nodo propio para animarla en Three.js)
    for r in roots:
        bpy.ops.object.select_all(action="DESELECT")
        r.select_set(True)
        for o in r.children_recursive:
            o.select_set(True)
            if o.name.startswith("Puerta"):
                o.rotation_euler = (0, 0, 0)
        saved_loc, saved_rot = r.location.copy(), r.rotation_euler.copy()
        r.location, r.rotation_euler = (0, 0, 0), (0, 0, 0)
        bpy.ops.export_scene.gltf(filepath=os.path.join(out, f"{r.name.lower()}.glb"), use_selection=True, export_format="GLB", export_apply=True)
        r.location, r.rotation_euler = saved_loc, saved_rot
    print("CASAS_OK", len(roots))


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.abspath("out"))
