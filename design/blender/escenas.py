"""Paisajes nocturnos del altiplano boliviano para el fondo y las cartas del inicio.

Uso:
  blender --background --factory-startup --python design/blender/escenas.py -- <carpeta_salida> [nombres...] [--prueba]

Cada escena mezcla lo espacial con lo boliviano: el Salar como espejo de la Vía Láctea, la cordillera
nevada (perfil tipo Illimani), un volcán solitario (tipo Tunupa o Licancabur), la laguna roja y las
luces de una ciudad en la falda. Los fondos anchos (bg-*) van difuminados detrás de la interfaz; las
cartas (card-*) llevan la casa de cada sector construida en el paisaje, nunca sobre un cuadro.
Todo es procedural: no usa fotos ni texturas externas.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from casas import area, box, build_house, cyl, lin, mat, setup_render  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = os.path.abspath(args[0] if args else "out")
PRUEBA = "--prueba" in args
# Las casas 3D se descartaron en el boceto (2026-11-20): las cartas se renderizan solo con paisaje y la
# casa va encima como ilustración 2D. Con --casas3d se recupera la versión anterior.
CASAS_3D = "--casas3d" in args
ONLY = [a for a in args[1:] if not a.startswith("--")]
os.makedirs(OUT, exist_ok=True)

# cenit, medio, horizonte, resplandor (color, acimut, fuerza), segundo resplandor, Vía Láctea, estrellas,
# sol (color, fuerza, elevación, acimut), luna (acimut, elevación) y bruma para alejar las montañas.
SKIES_OSCUROS = {  # versión nocturna anterior (pedido: «muy oscuro, genera desconfianza»); se usa con --oscuro
    "noche": dict(zenith="#020309", mid="#0A0F2C", horizon="#1E2252", glow="#E3197B", az=-55, gs=0.9, glow2="#6E2C8F", mw=1.0, stars=1.0, sun=("#9DB4FF", 0.35, 35, 40)),
    "alba": dict(zenith="#060A24", mid="#35205E", horizon="#F26B1D", glow="#F8C81E", az=38, gs=3.2, glow2="#E3197B", mw=0.35, stars=0.5, sun=("#FFB066", 2.2, 3, 38)),
    "ocaso": dict(zenith="#04051A", mid="#40124F", horizon="#D8262E", glow="#E3197B", az=-32, gs=2.6, glow2="#F26B1D", mw=0.6, stars=0.8, sun=("#FF6A4A", 1.8, 4, -32)),
}
SKIES_CLAROS = {  # crepúsculo claro: sigue siendo espacial (luna, estrellas, Vía Láctea tenue) pero luminoso
    "noche": dict(zenith="#2C3C86", mid="#7380C8", horizon="#F4B394", glow="#FFD8A8", az=-40, gs=2.0, glow2="#F2A2C0", mw=0.4, stars=0.5,
                  sun=("#FFC9A4", 2.6, 4, -40), moon=(16, 19), haze="#A9A6D6"),
    "alba": dict(zenith="#3557AA", mid="#9DB0E6", horizon="#FFD7AC", glow="#FFE9C0", az=38, gs=3.4, glow2="#F7B8CA", mw=0.15, stars=0.25,
                 sun=("#FFDAA8", 4.0, 5, 38), moon=(-18, 20), haze="#C7CDEB"),
    "ocaso": dict(zenith="#2F3280", mid="#9A80CA", horizon="#F6A0AC", glow="#FFC4A4", az=-32, gs=2.0, glow2="#F27F9E", mw=0.32, stars=0.4,
                  sun=("#FFB496", 3.0, 4, -32), moon=(14, 18), haze="#C1A6D2"),
}
SKIES = SKIES_OSCUROS if "--oscuro" in sys.argv else SKIES_CLAROS
CLARO = SKIES is SKIES_CLAROS

PEAKS = {
    # (x, y, altura, radio): perfiles inspirados, no copias topográficas
    "illimani": [(-330, 1350, 300, 280), (-120, 1380, 350, 250), (100, 1350, 320, 260), (420, 1500, 200, 300), (-700, 1500, 180, 320)],
    "tunupa": [(330, 1050, 240, 360), (-600, 1500, 120, 400), (-200, 1700, 90, 400)],
    "cordillera": [(-720, 1450, 270, 320), (-260, 1300, 210, 240), (180, 1550, 330, 330), (620, 1350, 250, 270), (980, 1600, 220, 300)],
    "licancabur": [(-120, 1150, 300, 360), (420, 1450, 150, 380), (-650, 1600, 130, 380)],
}

# Referencias bolivianas en el paisaje: teleférico (líneas roja, amarilla y verde, como las primeras de
# La Paz – El Alto), llamas con borlas de colores en el altiplano y flamencos en la laguna.
ROJA, AMARILLA, VERDE = "#C4363B", "#E8BF45", "#24905A"
FLAMENCOS_ANCHO = [(-70, 70), (-52, 84), (-40, 66), (-18, 95), (8, 74), (26, 88), (44, 68), (61, 92), (78, 76), (-88, 98)]
FLAMENCOS_CARTA = [(-6.5, 22), (-4.6, 26), (-2.2, 31), (3.4, 25), (5.2, 33), (7.8, 27), (-9.5, 38), (1.2, 44)]
LLAMAS_CARTA = [(-8.5, 19), (-5.8, 25), (7.2, 18), (10.5, 29), (-12, 34)]

SCENES = {
    "bg-noche": dict(sky="noche", ground="espejo", peaks="cordillera", lights=True, house=None, tele=[((-170, 150, 30), (200, 360, 82), ROJA, 3.0)]),
    "bg-alba": dict(sky="alba", ground="espejo", peaks="illimani", lights=True, house=None, tele=[((220, 150, 30), (-230, 420, 95), VERDE, 3.0)]),
    "bg-ocaso": dict(sky="ocaso", ground="laguna", peaks="licancabur", lights=False, house=None, flamencos=FLAMENCOS_ANCHO),
    "card-restaurant": dict(sky="ocaso", ground="altiplano", peaks="illimani", lights=True, house="restaurant", tele=[((-45, 70, 20), (60, 160, 52), ROJA, 1.25)], llamas=LLAMAS_CARTA),
    "card-cafe": dict(sky="alba", ground="espejo", peaks="tunupa", lights=False, house="cafe"),
    "card-workshop": dict(sky="noche", ground="altiplano", peaks="cordillera", lights=True, house="workshop", tele=[((55, 70, 20), (-60, 170, 55), AMARILLA, 1.25)], llamas=LLAMAS_CARTA[1:]),
    "card-store": dict(sky="noche", ground="espejo", peaks="tunupa", lights=False, house="store"),
    "card-studio": dict(sky="ocaso", ground="laguna", peaks="licancabur", lights=False, house="studio", flamencos=FLAMENCOS_CARTA),
    "card-other": dict(sky="noche", ground="espejo", peaks="cordillera", lights=True, house="other", tele=[((-60, 100, 26), (70, 210, 64), VERDE, 1.3)]),
}


# ── utilidades de nodos ──────────────────────────────────────────────────────
class G:
    def __init__(self, nt):
        self.nt = nt

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def set(self, sock, val):
        if hasattr(val, "is_output"):
            self.nt.links.new(val, sock)
        else:
            sock.default_value = val

    def math(self, op, a, b=0.0, clamp=False):
        m = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.set(m.inputs[0], a)
        self.set(m.inputs[1], b)
        return m.outputs[0]

    def mr(self, v, a, b, c=0.0, d=1.0):
        m = self.n("ShaderNodeMapRange", clamp=True)
        self.set(m.inputs[0], v)
        m.inputs[1].default_value, m.inputs[2].default_value = a, b
        m.inputs[3].default_value, m.inputs[4].default_value = c, d
        return m.outputs[0]

    def ramp(self, fac, stops, interp="LINEAR"):
        r = self.n("ShaderNodeValToRGB")
        cr = r.color_ramp
        cr.interpolation = interp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for el, (pos, hexc) in zip(cr.elements, stops):
            el.position = pos
            el.color = (*lin(hexc), 1)
        self.set(r.inputs[0], fac)
        return r.outputs[0]

    def noise(self, vec, scale, detail=6.0, rough=0.55):
        t = self.n("ShaderNodeTexNoise")
        t.noise_dimensions = "3D"
        self.set(t.inputs["Vector"], vec)
        t.inputs["Scale"].default_value = scale
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        return t.outputs["Fac"]

    def voronoi(self, vec, scale, feature="F1"):
        t = self.n("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature=feature)
        self.set(t.inputs["Vector"], vec)
        t.inputs["Scale"].default_value = scale
        return t

    def dot(self, a, vec):
        v = self.n("ShaderNodeVectorMath", operation="DOT_PRODUCT")
        self.set(v.inputs[0], a)
        v.inputs[1].default_value = vec
        return v.outputs["Value"]

    def bg(self, color, strength):
        b = self.n("ShaderNodeBackground")
        self.set(b.inputs["Color"], color if hasattr(color, "is_output") else (*color, 1))
        self.set(b.inputs["Strength"], strength)
        return b.outputs[0]

    def add(self, a, b):
        s = self.n("ShaderNodeAddShader")
        self.nt.links.new(a, s.inputs[0])
        self.nt.links.new(b, s.inputs[1])
        return s.outputs[0]


def az_vec(az_deg, z=0.0):
    a = math.radians(az_deg)
    return Vector((math.sin(a), math.cos(a), z)).normalized()


def build_sky(scene, p):
    world = bpy.data.worlds.new("Cielo")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    g = G(nt)
    d = g.n("ShaderNodeTexCoord").outputs["Generated"]
    z = g.n("ShaderNodeSeparateXYZ")
    g.set(z.inputs[0], d)
    Z = z.outputs["Z"]
    above = g.mr(Z, -0.005, 0.06)

    sky = g.ramp(g.mr(Z, 0.0, 0.65), [(0.0, p["horizon"]), (0.2, p["mid"]), (1.0, p["zenith"])], "EASE")
    out = g.bg(sky, 1.0)

    # resplandor del horizonte en un acimut (último o primer sol): aquí entra el color boliviano
    dotg = g.dot(d, az_vec(p["az"]))
    near = g.math("POWER", g.mr(dotg, 0.0, 1.0), 2.4)
    low = g.math("POWER", g.mr(Z, -0.05, 0.42, 1.0, 0.0), 2.6)
    out = g.add(out, g.bg(lin(p["glow"]), g.math("MULTIPLY", g.math("MULTIPLY", near, low), p["gs"])))
    wide = g.math("POWER", g.mr(dotg, -0.5, 1.0), 1.4)
    low2 = g.math("POWER", g.mr(Z, -0.05, 0.28, 1.0, 0.0), 3.0)
    out = g.add(out, g.bg(lin(p["glow2"]), g.math("MULTIPLY", g.math("MULTIPLY", wide, low2), p["gs"] * 0.45)))

    # Vía Láctea: banda sobre un gran círculo inclinado, con nubes y la grieta oscura
    # gran círculo que entra por la izquierda cerca del horizonte y sube en diagonal hacia la derecha
    nrm = Vector((0.642, 0.338, -0.689)).normalized()
    dd = g.math("ABSOLUTE", g.dot(d, nrm))
    d2 = g.math("MULTIPLY", dd, dd)
    band = g.math("EXPONENT", g.math("MULTIPLY", d2, -60.0))
    core = g.math("EXPONENT", g.math("MULTIPLY", d2, -420.0))
    fine = g.mr(g.noise(d, 6.0, 14, 0.7), 0.3, 0.78)
    broad = g.mr(g.noise(d, 1.5, 3, 0.5), 0.3, 0.7, 0.35, 1.0)
    rift = g.mr(g.noise(d, 4.0, 10, 0.62), 0.5, 0.63, 1.0, 0.1)
    halo = g.math("MULTIPLY", g.math("MULTIPLY", band, 0.4), g.math("MULTIPLY", fine, broad))
    lane = g.math("MULTIPLY", g.math("MULTIPLY", core, 0.95), g.math("MULTIPLY", fine, rift))
    mw = g.math("MULTIPLY", g.math("MULTIPLY", g.math("ADD", halo, lane), above), p["mw"])
    mw_col = g.ramp(fine, [(0.0, "#1B2A6B"), (0.5, "#9C8CC4"), (1.0, "#F2D2B0")])
    out = g.add(out, g.bg(mw_col, mw))
    # polvo de estrellas denso dentro de la banda
    v = g.voronoi(d, 520)
    dust = g.mr(v.outputs["Distance"], 0.0, 0.12, 1.0, 0.0)
    out = g.add(out, g.bg((1.0, 0.94, 0.86), g.math("MULTIPLY", g.math("MULTIPLY", dust, band), g.math("MULTIPLY", above, p["mw"] * 2.2))))

    # estrellas: dos capas (muchas tenues, pocas brillantes)
    for scale, radius, lo, gain, pw in ((240, 0.1, 0.55, 6.0, 3.0), (62, 0.045, 0.9, 30.0, 1.0)):
        v = g.voronoi(d, scale)
        m = g.mr(v.outputs["Distance"], 0.0, radius, 1.0, 0.0)
        sep = g.n("ShaderNodeSeparateColor")
        g.set(sep.inputs[0], v.outputs["Color"])
        b = g.math("POWER", g.mr(sep.outputs[0], lo, 1.0), pw)
        s = g.math("MULTIPLY", g.math("MULTIPLY", m, b), g.math("MULTIPLY", above, p["stars"] * gain))
        out = g.add(out, g.bg((1.0, 0.95, 0.88), s))

    # luna creciente con halo: el guiño espacial que sobrevive a un cielo claro
    if p.get("moon"):
        maz, mel = p["moon"]
        mv = az_vec(maz, 0.0)
        mv = Vector((mv.x * math.cos(math.radians(mel)), mv.y * math.cos(math.radians(mel)), math.sin(math.radians(mel)))).normalized()
        md = g.dot(d, mv)
        disk = g.mr(md, math.cos(math.radians(1.25)), math.cos(math.radians(1.1)))
        # sombra desplazada para la fase creciente
        sv = (mv + Vector((0.012, -0.004, 0.006))).normalized()
        shade = g.mr(g.dot(d, sv), math.cos(math.radians(1.2)), math.cos(math.radians(1.0)), 1.0, 0.0)
        craters = g.mr(g.noise(d, 900.0, 4, 0.6), 0.35, 0.7, 0.75, 1.0)
        out = g.add(out, g.bg((1.0, 0.97, 0.9), g.math("MULTIPLY", g.math("MULTIPLY", disk, shade), g.math("MULTIPLY", craters, 6.0))))
        glowm = g.math("POWER", g.mr(md, math.cos(math.radians(9)), 1.0), 6.0)
        out = g.add(out, g.bg((1.0, 0.95, 0.88), g.math("MULTIPLY", glowm, 0.35)))

    wo = g.n("ShaderNodeOutputWorld")
    nt.links.new(out, wo.inputs["Surface"])
    scene.world = world


def ground_material(kind):
    m = bpy.data.materials.new(f"Suelo-{kind}")
    m.use_nodes = True
    nt = m.node_tree
    g = G(nt)
    bsdf = nt.nodes["Principled BSDF"]
    co = g.n("ShaderNodeTexCoord").outputs["Object"]
    bump = g.n("ShaderNodeBump")
    if kind == "espejo":
        # costra de sal en polígonos con una película de agua: refleja el cielo como un espejo
        # los bordes de sal se apagan con la distancia: a lo lejos queda espejo puro
        fade = g.mr(g.n("ShaderNodeCameraData").outputs["View Distance"], 4.0, 45.0, 1.0, 0.0)
        ridge = g.mr(g.voronoi(co, 0.7, "DISTANCE_TO_EDGE").outputs["Distance"], 0.0, 0.018, 1.0, 0.0)
        ridge = g.math("MULTIPLY", ridge, fade)
        cells, ridges = ("#4A5268", "#D6DAE4") if CLARO else ("#0C1019", "#4A5262")  # en claro, sal blanca de verdad
        g.set(bsdf.inputs["Base Color"], g.ramp(ridge, [(0.0, cells), (1.0, ridges)]))
        wet = g.mr(g.noise(co, 0.012, 2, 0.5), 0.35, 0.65, 0.0, 0.05)
        g.set(bsdf.inputs["Roughness"], g.math("ADD", wet, g.math("MULTIPLY", ridge, 0.35)))
        g.set(bump.inputs["Height"], ridge)
        bump.inputs["Strength"].default_value = 0.12
    elif kind == "laguna":
        borax = g.mr(g.noise(co, 0.004, 4, 0.55), 0.56, 0.6)
        g.set(bsdf.inputs["Base Color"], g.ramp(borax, [(0.0, "#6E1712"), (1.0, "#E9E2D6")]))
        g.set(bsdf.inputs["Roughness"], g.mr(borax, 0.0, 1.0, 0.05, 0.8))
        g.set(bump.inputs["Height"], g.noise(co, 1.5, 3, 0.5))
        bump.inputs["Strength"].default_value = 0.04
    else:
        n = g.noise(co, 0.18, 6, 0.6)
        stops = [(0.3, "#4A3A28"), (0.55, "#6E5638"), (0.75, "#8C7048")] if CLARO else [(0.3, "#1A130C"), (0.55, "#36281A"), (0.75, "#4E3C25")]
        g.set(bsdf.inputs["Base Color"], g.ramp(n, stops))
        bsdf.inputs["Roughness"].default_value = 0.93
        g.set(bump.inputs["Height"], g.noise(co, 2.0, 6, 0.6))
        bump.inputs["Strength"].default_value = 0.35
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def fbm(x, y, seed, octaves=6):
    tot, amp, f = 0.0, 1.0, 1.0
    for _ in range(octaves):
        tot += amp * noise.noise(Vector((x * f, y * f, seed)))
        amp *= 0.5
        f *= 2.0
    return tot


def make_range(scene, profile, sky):
    rnd = random.Random(profile)
    # cumbres principales (anisótropas) + cumbres secundarias al azar para que la cordillera no parezca dibujada
    peaks = [(px, py, ph, pr, rnd.uniform(0.75, 1.35)) for px, py, ph, pr in PEAKS[profile]]
    peaks += [(rnd.uniform(-2500, 2500), rnd.uniform(1150, 1900), rnd.uniform(50, 160), rnd.uniform(160, 340), rnd.uniform(0.7, 1.4)) for _ in range(16)]
    y0, y1, x0, x1 = 760.0, 1950.0, -2700.0, 2700.0
    sx, sy = 10.0, 16.0
    cols, rows = int((x1 - x0) / sx) + 1, int((y1 - y0) / sy) + 1
    verts, faces = [], []
    for j in range(rows):
        y = y0 + j * sy
        front = min(1.0, max(0.0, (y - y0) / 260.0))
        front = front * front * (3 - 2 * front)
        for i in range(cols):
            x = x0 + i * sx
            wx = x + 120.0 * fbm(x / 700.0, y / 700.0, 1.3, 3)  # deformación del dominio: crestas torcidas
            ridged = 1.0 - abs(fbm(wx / 480.0, y / 480.0, 3.1, 5))
            h = 18.0 + 105.0 * ridged * ridged * (0.6 + 0.4 * (fbm(x / 1500.0, y / 1500.0, 5.5, 2) + 0.5))
            erosion = 1.0 - abs(fbm(wx / 70.0, y / 70.0, 9.9, 4))
            for px, py, ph, pr, ani in peaks:
                dist = math.hypot((wx - px) * ani, (y - py) * 0.8)
                if dist < pr:
                    t = 1.0 - dist / pr
                    h += ph * t ** 1.3 * (0.72 + 0.4 * (fbm(x / 150.0, y / 150.0, 7.7, 4) + 0.5)) + ph * 0.16 * t * erosion
            verts.append((x, y, h * front - 3.0))
    for j in range(rows - 1):
        for i in range(cols - 1):
            a = j * cols + i
            faces.append((a, a + 1, a + cols + 1, a + cols))
    me = bpy.data.meshes.new("Cordillera")
    me.from_pydata(verts, [], faces)
    me.update()
    for poly in me.polygons:
        poly.use_smooth = True
    o = bpy.data.objects.new("Cordillera", me)
    scene.collection.objects.link(o)

    m = bpy.data.materials.new("Roca")
    m.use_nodes = True
    g = G(m.node_tree)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    pos = g.n("ShaderNodeSeparateXYZ")
    g.set(pos.inputs[0], g.n("ShaderNodeNewGeometry").outputs["Position"])
    fac = g.math("ADD", g.mr(pos.outputs["Z"], 0.0, 360.0), g.math("MULTIPLY", g.math("SUBTRACT", g.noise(g.n("ShaderNodeTexCoord").outputs["Object"], 0.02, 8, 0.6), 0.5), 0.16))
    rock = [(0.0, "#1C1E34"), (0.3, "#30365E"), (0.5, "#56608E"), (0.57, "#A6B0D2"), (0.62, "#EEF2FA"), (1.0, "#FAFBFF")] if CLARO else \
        [(0.0, "#07080F"), (0.3, "#171A33"), (0.5, "#2E3560"), (0.57, "#8C97BC"), (0.62, "#DCE4F4"), (1.0, "#F4F7FF")]
    g.set(bsdf.inputs["Base Color"], g.ramp(fac, rock))
    bsdf.inputs["Roughness"].default_value = 0.8
    if CLARO and SKIES[sky].get("haze"):
        # perspectiva aérea: cuanto más lejos, más se funde la montaña con la bruma del cielo
        out = m.node_tree.nodes["Material Output"]
        em = g.n("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*lin(SKIES[sky]["haze"]), 1)
        mix = g.n("ShaderNodeMixShader")
        g.set(mix.inputs[0], g.mr(g.n("ShaderNodeCameraData").outputs["View Distance"], 700.0, 2200.0, 0.08, 0.42))
        m.node_tree.links.new(bsdf.outputs[0], mix.inputs[1])
        m.node_tree.links.new(em.outputs[0], mix.inputs[2])
        m.node_tree.links.new(mix.outputs[0], out.inputs["Surface"])
    o.data.materials.append(m)

    # sol bajo que recorta las cumbres con el color del cielo
    col, strength, elev, az = SKIES[sky]["sun"]
    sd = bpy.data.lights.new("Sol", "SUN")
    sd.energy = strength
    sd.color = lin(col)
    sd.angle = math.radians(2)
    so = bpy.data.objects.new("Sol", sd)
    v = az_vec(az, math.tan(math.radians(elev)))
    so.rotation_euler = (-v).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(so)


def city_lights(scene, seed=4):
    rnd = random.Random(seed)
    verts, faces = [], []
    for cx in (-520, -180, 140, 460):
        for _ in range(170):
            x = cx + rnd.gauss(0, 110)
            y = 790 + abs(rnd.gauss(0, 40))
            z = 1.0 + (y - 790) * 0.12 + rnd.random() * 2
            s = 0.9 + rnd.random() * 1.6
            b = len(verts)
            verts += [(x + s, y, z), (x - s, y, z), (x, y + s, z), (x, y - s, z), (x, y, z + s), (x, y, z - s)]
            faces += [(b, b + 2, b + 4), (b + 2, b + 1, b + 4), (b + 1, b + 3, b + 4), (b + 3, b, b + 4), (b + 2, b, b + 5), (b + 1, b + 2, b + 5), (b + 3, b + 1, b + 5), (b, b + 3, b + 5)]
    me = bpy.data.meshes.new("Luces")
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new("Luces", me)
    o.data.materials.append(mat("Luz-ciudad", "#FFB054", emission=28.0))
    scene.collection.objects.link(o)


def ichu(scene, seed=9):
    """Matas de paja brava (ichu) del altiplano alrededor de la casa."""
    rnd = random.Random(seed)
    m = mat("Ichu", "#B8913E", rough=0.9)
    m2 = mat("Ichu2", "#8E6B2A", rough=0.9)
    n = 0
    while n < 240:
        x, y = rnd.uniform(-10, 10), rnd.uniform(-1.5, 22)
        if abs(x) < 1.6 and y < 2.0:
            continue
        if y < 0 and x > -0.5:
            continue  # despejar la línea de cámara
        r = rnd.uniform(0.05, 0.13)
        bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=r, depth=r * rnd.uniform(2.2, 3.4), location=(x, y, r))
        c = bpy.context.active_object
        c.data.materials.append(m if rnd.random() > 0.4 else m2)
        n += 1


def curve(name, pts, radius, m, parent=None):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (c[0], c[1], c[2], 1.0)
    o = bpy.data.objects.new(name, cu)
    o.data.materials.append(m)
    bpy.context.scene.collection.objects.link(o)
    if parent:
        o.parent = parent
    return o


def teleferico(a, b, color, s=1.0):
    """Línea de teleférico: dos cables con catenaria, tres torres y cabinas iluminadas con techo del color de la línea."""
    a, b = Vector(a), Vector(b)
    d = b - a
    horiz = Vector((d.x, d.y, 0)).normalized()
    side = Vector((-horiz.y, horiz.x, 0))
    ang = math.atan2(horiz.y, horiz.x)
    sag = 0.035 * d.length
    steel = mat("Acero", "#2E333D", rough=0.5, metallic=0.6)

    def at(t):
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        return p

    for off in (-0.9 * s, 0.9 * s):
        curve("Cable", [tuple(at(i / 48) + side * off) for i in range(49)], 0.09 * s, steel)
    for t in (0.0, 0.5, 1.0):
        p = at(t)
        h = p.z + 1.2 * s
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.0 * s, radius2=0.32 * s, depth=h, location=(p.x, p.y, h / 2))
        bpy.context.active_object.data.materials.append(steel)
        box("Cruceta", (0.5 * s, 3.2 * s, 0.4 * s), (p.x, p.y, h), steel, rot=(0, 0, ang))
        bpy.ops.mesh.primitive_ico_sphere_add(radius=0.22 * s, location=(p.x, p.y, h + 0.4 * s), subdivisions=1)
        bpy.context.active_object.data.materials.append(mat("Baliza", "#FF4A3A", emission=12.0))
    body = mat("Cabina", "#D9D4CC", rough=0.4)
    band = mat(f"Linea-{color}", color, rough=0.45)
    glow = mat("Cabina-luz", "#FFC27A", emission=3.0)
    for t in (0.17, 0.33, 0.66, 0.84):
        p = at(t) - Vector((0, 0, 3.0 * s))
        box("Cabina", (2.0 * s, 1.9 * s, 1.7 * s), p, body, bevel=0.3 * s, rot=(0, 0, ang))
        box("Ventanas", (2.06 * s, 1.96 * s, 0.55 * s), p + Vector((0, 0, 0.15 * s)), glow, bevel=0, rot=(0, 0, ang))
        box("Techo", (2.04 * s, 1.94 * s, 0.32 * s), p + Vector((0, 0, 0.95 * s)), band, bevel=0.1 * s, rot=(0, 0, ang))
        cyl("Brazo", 0.08 * s, 2.2 * s, p + Vector((0, 0, 2.0 * s)), steel, verts=6)


def _root(name, x, y, yaw):
    r = bpy.data.objects.new(name, None)
    r.location = (x, y, 0)
    r.rotation_euler = (0, 0, yaw)
    bpy.context.scene.collection.objects.link(r)
    return r


def _sphere(loc, scale, m, parent, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    o.data.materials.append(m)
    o.parent = parent
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def flamencos(spots, seed=3):
    rnd = random.Random(seed)
    pink = mat("Flamenco", "#E58FA8", rough=0.6)
    dark = mat("Pico", "#1A1418", rough=0.5)
    for x, y in spots:
        k = rnd.uniform(0.9, 1.15)
        r = _root("Flamenco", x, y, rnd.uniform(0, 6.28))
        _sphere((0, 0, 0.95 * k), (0.34 * k, 0.17 * k, 0.17 * k), pink, r, rot=(0, math.radians(-12), 0))
        curve("Cuello", [(0.26 * k, 0, 1.0 * k), (0.33 * k, 0, 1.24 * k), (0.29 * k, 0, 1.44 * k), (0.36 * k, 0, 1.62 * k)], 0.035 * k, pink, r)
        _sphere((0.4 * k, 0, 1.66 * k), (0.065 * k, 0.055 * k, 0.055 * k), pink, r)
        cyl("Pico", 0.022 * k, 0.12 * k, (0.47 * k, 0, 1.62 * k), dark, r, rot=(0, math.radians(120), 0), verts=6)
        for dy in (-0.04, 0.04):
            cyl("Pata", 0.014 * k, 0.86 * k, (0, dy * k, 0.43 * k), pink, r, verts=6)


def llamas(spots, seed=5):
    rnd = random.Random(seed)
    pelos = ["#EDE4D3", "#8A5A3A", "#3B2A22", "#D9C3A0"]
    borlas = ["#CC3A80", "#E8BF45", "#DC7434", "#24905A"]
    for i, (x, y) in enumerate(spots):
        k = rnd.uniform(0.92, 1.1)
        c = mat(f"Llama{i % 4}", pelos[i % 4], rough=0.85)
        r = _root("Llama", x, y, rnd.uniform(0, 6.28))
        _sphere((0, 0, 1.0 * k), (0.55 * k, 0.25 * k, 0.27 * k), c, r)
        cyl("Cuello", 0.1 * k, 0.78 * k, (0.43 * k, 0, 1.42 * k), c, r, rot=(0, math.radians(10), 0), verts=10)
        _sphere((0.56 * k, 0, 1.84 * k), (0.17 * k, 0.1 * k, 0.1 * k), c, r)
        for dy in (-0.05, 0.05):
            bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.035 * k, depth=0.15 * k, location=(0.49 * k, dy * k, 1.97 * k))
            e = bpy.context.active_object
            e.data.materials.append(c)
            e.parent = r
            # borlas de lana de colores en las orejas, como se adorna a las llamas en el altiplano
            _sphere((0.49 * k, dy * 1.3 * k, 2.05 * k), (0.045 * k,) * 3, mat(f"Borla{i}", borlas[(i + int(dy > 0)) % 4], rough=0.7), r)
        for lx in (-0.32, 0.32):
            for ly in (-0.12, 0.12):
                cyl("Pata", 0.05 * k, 0.86 * k, (lx * k, ly * k, 0.43 * k), c, r, verts=8)
        _sphere((-0.56 * k, 0, 1.12 * k), (0.09 * k, 0.07 * k, 0.1 * k), c, r)


def render(name, cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    build_sky(scene, SKIES[cfg["sky"]])
    bpy.ops.mesh.primitive_plane_add(size=9000, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(ground_material(cfg["ground"]))
    make_range(scene, cfg["peaks"], cfg["sky"])
    if cfg["lights"]:
        city_lights(scene)
    for a, b, color, s in cfg.get("tele", []):
        teleferico(a, b, color, s)
    if cfg.get("flamencos"):
        flamencos(cfg["flamencos"])
    if cfg.get("llamas"):
        llamas(cfg["llamas"])
    try:
        bpy.ops.object.lightprobe_add(type="PLANE", location=(0, 0, 0.002))
        bpy.context.active_object.scale = (4000, 4000, 1)
    except Exception as e:  # noqa: BLE001
        print("SIN_SONDA_PLANAR", e)

    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.clip_end = 8000
    wide = cfg["house"] is None
    if wide:
        cam.data.lens = 24
        cam.location = (0, 0, 1.6)
        cam.rotation_euler = (math.radians(94), 0, 0)
        res = (2400, 1350)
    else:
        if CASAS_3D:
            build_house(cfg["house"], (0, 0, 0), math.radians(-26))
        if cfg["ground"] == "altiplano":
            ichu(scene)
        cam.data.lens = 28
        cam.location = (0.95, -4.4, 0.8)
        cam.rotation_euler = (Vector((0.0, 0.0, 1.35)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        for lamp in () if not CASAS_3D else (
            area(scene, "Clave", (-3.2, -4.2, 4.0), 520, "#FFE6C8", 3.5, (0, 0, 0.9)),
            area(scene, "Borde", (2.6, 3.0, 3.2), 420, "#5B7CFF", 3.0, (0, 0, 0.9)),
            area(scene, "Relleno", (3.5, -3.0, 1.2), 160, "#FF8FC0", 2.5, (0, 0, 0.9)),
        ):
            lamp.data.specular_factor = 0.0  # que el espejo de sal no refleje las luces de estudio
        res = (900, 1200)

    setup_render(scene, res, False)
    scene.render.resolution_percentage = 50 if PRUEBA else 100
    scene.eevee.taa_render_samples = 16 if PRUEBA else 48
    try:
        scene.eevee.use_raytracing = True
    except AttributeError:
        pass
    scene.view_settings.look = "Medium Contrast" if wide else "Medium High Contrast"
    s = scene.render.image_settings
    s.file_format = "WEBP"
    s.color_mode = "RGB"
    s.quality = 82
    scene.render.filepath = os.path.join(OUT, f"{name}.webp")
    bpy.ops.render.render(write_still=True)
    print("ESCENA_OK", name)


for name, cfg in SCENES.items():
    if ONLY and name not in ONLY:
        continue
    render(name, cfg)
print("ESCENAS_FIN")
