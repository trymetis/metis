import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import kit

out = kit.args()[0]
kit.reset()

CW, CH, CT = 0.085, 0.055, 0.0007
N = 6
TILT = math.radians(14)
GAP = 0.0034
BW, BD, BH = 0.112, 0.062, 0.012
FRONT = -0.012
SLOTS = [FRONT + (i + 1) * GAP for i in range(N - 1)] + [FRONT]

base = kit.slab('base', BW, BD, 0.007, BH, rt=0.0025, rb=0.001, segs=5, plan_segs=10)
kit.paint(base, 'bone')
kit.bevel(base, 0.0006, 3, angle=45)

well = kit.box('well', (CW + 0.006, (N + 1) * GAP + 0.004, 0.006), loc=(0, FRONT + (N - 1) * GAP / 2, BH - 0.0025))
kit.paint(well, 'graphite', name='cavity', rough=0.7)
kit.boolean(base, well, transfer=True)
kit.finish(base, 30)

pad = kit.slab('pad', BW - 0.01, BD - 0.01, 0.005, 0.0015, rt=0.0004, segs=2, plan_segs=8, z0=-0.0015)
kit.paint(pad, 'rubber')

lip = kit.slab('lip', CW + 0.012, 0.0035, 0.0012, 0.016, rt=0.0012, segs=3, plan_segs=4, z0=BH - 0.003)
lip.location = (0, FRONT - 0.0042, 0)
kit.apply_tf(lip)
kit.bevel(lip, 0.0003, 2, angle=40)
kit.paint(lip, 'brass')
kit.finish(lip, 40)

rest = kit.slab('rest', CW + 0.012, 0.0035, 0.0012, 0.042, rt=0.0012, segs=3, plan_segs=4)
rest.rotation_euler = (-TILT, 0, 0)
rest.location = (0, FRONT + N * GAP + 0.0045, BH - 0.003)
kit.apply_tf(rest)
kit.bevel(rest, 0.0003, 2, angle=40)
kit.paint(rest, 'brass')
kit.finish(rest, 40)

screws = [kit.cyl('screw', 0.0022, 0.0012, loc=(sx * (CW / 2 + 0.002), FRONT - 0.0062, BH + 0.007), rot=(math.radians(90), 0, 0), n=32) for sx in (-1, 1)]
screw = kit.join(screws, 'screws')
kit.paint(screw, 'brass_dk')

kit.join([base, pad, lip, rest, screw], 'holder')

CARDS = [f'card{i}' for i in range(N)]
for i in range(N):
    card = kit.box(CARDS[i], (CW, CT, CH), loc=(0, 0, CH / 2), bev=0.00025, segs=2)
    kit.paint(card, 'paper')
    face = kit.plane(f'face{i}', CW - 0.0006, CH - 0.0006, loc=(0, -CT / 2 - 0.00015, CH / 2), key='face')
    kit.parent(face, card)
    card.rotation_euler = (-TILT, 0, 0)
    card.location = (0, SLOTS[i], BH - 0.0025)

kit.export(out, skip_uv=tuple(f'face{i}' for i in range(N)), ao=dict(dist=0.02, density=900, isolate=CARDS), anim=CARDS)
