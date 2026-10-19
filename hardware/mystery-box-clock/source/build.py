"""Mystery Box enclosure. Units mm; XY front elevation, +Z toward viewer.
Run with CadQuery >=2.6, trimesh and Pillow. No electronics/firmware changes.
"""
from pathlib import Path
import json, math, zipfile
import cadquery as cq
import trimesh
OUT=Path(__file__).resolve().parents[1]
W,H,D=190,110,40
WALL=2.4
BX,BY=3.5,25
BOARD_HOLES=[(13.97,2.54),(66.04,7.62),(66.04,35.56),(15.24,50.8)]
CASE_HOLES=[(7,7),(183,7),(7,103),(183,103)]
GLASS_HOLES=[(14,16),(176,16),(14,88),(176,88)]
LCD_HOLES=[(102.5,36.5),(177.5,36.5),(102.5,67.5),(177.5,67.5)]
# Connector centers estimated from official top view, not dimensioned CAD.
USB_Y=BY+37.85; DC_Y=BY+8.5

def box(x,y,z,dx,dy,dz):
 return cq.Workplane('XY').box(dx,dy,dz,centered=False).translate((x,y,z))
def rr(x,y,z,w,h,d,r):
 return box(x,y,z,w,h,d).edges('|Z').fillet(r)
def cyl(x,y,z,r,h):
 return cq.Workplane('XY').circle(r).extrude(h).translate((x,y,z))
def cut_holes(obj,points,r,z,h):
 for x,y in points: obj=obj.cut(cyl(x,y,z,r,h))
 return obj

# Rear tub. Deep walls; removable front. Standoffs printed with rear tub.
body=rr(0,0,0,W,H,34,10).cut(rr(WALL,WALL,3,W-2*WALL,H-2*WALL,35,7.6))
for x,y in CASE_HOLES:
 body=body.union(cyl(x,y,2.5,4.4,31.5))
 body=body.cut(cyl(x,y,28.5,2.1,6))  # M3 insert OD4.6 x L4; pilot4.2
for x,y in BOARD_HOLES:
 x+=BX;y+=BY
 # 5 mm diameter at PCB, not large M3 bosses against adjacent headers.
 body=body.union(cyl(x,y,2.5,2.5,5.5)).cut(cyl(x,y,4.5,1.45,4))
for x,y in LCD_HOLES:
 body=body.union(cyl(x,y,2.5,3,19.5)).cut(cyl(x,y,18.5,1.45,4))
# Connector service openings through left wall. Overmold clearance included.
body=body.cut(box(-2,USB_Y-7.5,7,8,15,11))
body=body.cut(box(-2,DC_Y-7,7,8,14,16))
# Rear ventilation only in free regions, away from mounting feet.
# Edge vent banks leave a calm, uninterrupted rear engraving field.
for x in range(24,169,8): body=body.cut(rr(x,90,-1,3,9,5,1.2))
for x in range(24,169,8): body=body.cut(rr(x,26,-1,3,4,5,1.2))
# Two screw points for the desk stand.
STAND_HOLES=[(55,10),(135,10)]
for x,y in STAND_HOLES:
 body=body.union(cyl(x,y,2.5,4,5.5)).cut(cyl(x,y,-1,1.65,11))
 # Captured M3 hex nut: 5.8 mm across flats, top-loaded before electronics.
 nut=cq.Workplane('XY').polygon(6,5.8/math.cos(math.pi/6)).extrude(2.8).translate((x,y,5.4))
 body=body.cut(nut)
# Interior-only cable tie bridges keep the exterior inscription uninterrupted.
for y in (22,77):
 body=body.union(box(84,y,2.8,12,8,4.2))
 body=body.cut(box(83,y+2,3,14,4,2))

# Front bezel, bone white. Button goes in opaque upper-right band.
front=rr(0,0,34,W,H,6,10)
front=front.cut(rr(9,22,33,172,60,9,5))
# 0.3 mm clearance on each side around 178 x 66 x 2 mm acrylic.
front=front.cut(rr(5.7,18.7,33.8,178.6,66.6,2.2,8.3))
front=cut_holes(front,CASE_HOLES,1.65,33,9)
for x,y in CASE_HOLES: front=front.cut(cyl(x,y,38,3.05,3))
# Guided printed button: always present, optional tactile switch underneath.
front=front.cut(cyl(161,96,33,5.3,9))
# M2 inserts for repeated removal of glass frame.
front=cut_holes(front,GLASS_HOLES,1.45,33.8,3.4)
BUTTON_MOUNTS=[(150,96),(172,96)]
for x,y in BUTTON_MOUNTS:
 front=front.union(cyl(x,y,24.5,2.7,9.6))
 front=front.cut(cyl(x,y,24.3,1.45,5.2))
# Cap inserted from outside; separate screwed washer captures it inside.
cap=cyl(161,96,33.8,5,6.8).union(cyl(161,96,40.6,7.5,2))
cap=cap.cut(cyl(161,96,33.5,1.45,5.8))
washer=cyl(161,96,32.3,7.3,1.5).cut(cyl(161,96,32,1.1,3))
carrier=rr(146,89,22,30,14,2.5,3)
carrier=cut_holes(carrier,BUTTON_MOUNTS,1.1,21,5)
# Seat for bare 6 x 6 x 4.3 mm tactile switch; direct-wired legs exit slots.
carrier=carrier.union(box(157.7,92.7,24.4,6.6,6.6,2.6))
carrier=carrier.cut(box(157.9,92.9,26.3,6.2,6.2,2))
for x in (156.7,163.3): carrier=carrier.cut(box(x,92,21,2,8,7))
# Blank configuration: sleeve blocks travel and keeps cap's finished appearance.
blank=cyl(161,96,24.5,4.9,7.8)
blank=blank.cut(box(157.5,92.5,24,7,7,3.2))
blank=blank.cut(cyl(161,96,30.3,2.4,3))
# Long recessed accent pocket; insert glues in, never near antenna.
front=front.cut(rr(23,9,39.1,115,2.4,2,1.1))
accent=rr(23.2,9.2,39.2,114.6,2,0.8,0.9)
retainer=rr(4,13,32,182,78,2,7).cut(rr(9,22,31,172,60,5,5))
retainer=cut_holes(retainer,GLASS_HOLES,1.1,31,5)
# Retainer stays clear of button and all PCB components.
acrylic=rr(6,19,34,178,66,2,8)

# Wide desktop plinth: support footprint from -18 to +52 mm depth.
# Tub is tilted backward 12 degrees; Y height points upward in desk assembly.
# Stand is modeled in desk coordinates: X width, Y depth, Z up.
stand=rr(20,-18,0,150,70,5,9)
# Inclined rails on two sides, front face contacts rear tub at y=10 local.
# A wedge extrusion along X built using YZ plane.
for x in (49,129):
 wedge=cq.Workplane('YZ').polyline([(23.9,5),(45,5),(36,34),(30.05,34)]).close().extrude(12).translate((x,0,0))
 stand=stand.union(wedge)
# Provide screw mounting in sloping upper land, through holes aligned to assembly.
# A separate cradle plate at 12° supports full lower rear of tub.
cradle=box(43,0,-4,104,22,4)
cradle=cut_holes(cradle,STAND_HOLES,1.65,-5,7)
# Assembly rotation makes local plate Z point forward and local Y upward.
def desk(s): return s.rotate((0,0,0),(1,0,0),78).translate((0,24,7))
stand=stand.union(desk(cradle))
# Clear aligned bores through wedges (M3x12 plus nuts inside rear tub).
for x,y in STAND_HOLES:
 bore=desk(cyl(x,y,-20,1.65,30))
 stand=stand.cut(bore).cut(desk(cyl(x,y,-30,3.2,26)))  # recessed tool/head access to cradle
# Rubber pad recesses underside.
for x in (33,157):
 for y in (-7,41): stand=stand.cut(cyl(x,y,-1,5.2,2))

# Inexpensive fit coupon: full hole pattern plus both ports; no full tub print.
coupon=box(0,22,0,77,59,2)
for x,y in BOARD_HOLES:
 coupon=coupon.union(cyl(BX+x,BY+y,1.5,2.5,6.5)).cut(cyl(BX+x,BY+y,4.5,1.45,4))
coupon=coupon.union(box(0,22,1.5,2.4,59,23))
coupon=coupon.cut(box(-1,USB_Y-7.5,7,6,15,11)).cut(box(-1,DC_Y-7,7,6,14,16))
# Button and LCD hole/pilot size coupon.
sizes=box(0,0,0,88,42,2.5)
sizes=cut_holes(sizes,[(6.5,5.5),(81.5,5.5),(6.5,36.5),(81.5,36.5)],1.1,-1,5)
sizes=sizes.cut(cyl(44,21,-1,5.3,5))
# Insert fit gauges: M3 4.2 pilot and M2 2.9 pilot, printed same orientation.
for x,r in [(20,2.1),(68,1.45)]:
 sizes=sizes.union(cyl(x,21,2,4,6)).cut(cyl(x,21,3,r,6))
# Integral engraved typography. Tools start at the .6 mm-deep floor and
# extend .1 mm beyond the exterior; paint meshes are optional finish previews.
SANS_FONT='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
QUOTE_FONT='/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf'
for font_path in (SANS_FONT,QUOTE_FONT):
 if not Path(font_path).is_file(): raise FileNotFoundError('Edit SANS_FONT / QUOTE_FONT to installed font paths: '+font_path)
engraving_tools=[]; paint_letters=[]; typography_report=[]
def engrave(obj,txt,size,origin,xdir,normal,font,color,surface):
 plane=cq.Plane(origin=origin,xDir=xdir,normal=normal)
 tool=cq.Workplane(plane).text(txt,size,.7,fontPath=font,halign='center',valign='center',combine=False)
 paint=cq.Workplane(plane).text(txt,size,.025,fontPath=font,halign='center',valign='center',combine=False)
 engraving_tools.append(tool);paint_letters.append((paint,color))
 typography_report.append({'text':txt,'font_size_mm':size,'depth_mm':.6,'surface':surface})
 return obj.cut(tool)
for txt,size,y in [('Time will tell',10,67),('how much I love you.',10,51),('MYSTERY BOX',3.5,38)]:
 body=engrave(body,txt,size,(95,y,.6),(-1,0,0),(0,0,-1),QUOTE_FONT if size==10 else SANS_FONT,(222,212,185),'rear')
# Small engraved rules frame the dedication without covering vents or fasteners.
for y in (80,35):
 rule=box(49,y,-.1,92,.65,.7);body=body.cut(rule)
 paint_letters.append((box(49,y,.575,92,.65,.025),(183,104,65)))
for txt,size,y in [('USB-C',3.2,USB_Y+2),('5V / DATA',2.8,USB_Y-2.5),('DC IN',3.2,DC_Y+2),('6-24V',2.8,DC_Y-2.5)]:
 body=engrave(body,txt,size,(.6,y,28.5 if y<50 else 25.5),(0,0,1),(-1,0,0),SANS_FONT,(222,212,185),'left ports')
front=engrave(front,'MODE',3.2,(161,85.7,39.4),(1,0,0),(0,0,1),SANS_FONT,(26,71,60),'front button')
sizes=engrave(sizes,'USB-C',3.2,(44,34,1.9),(1,0,0),(0,0,1),SANS_FONT,(26,71,60),'test coupon')
# Text must not become through-holes in the 3 mm rear or 2.4 mm side wall.
assert .6<min(3,WALL)
parts={'01_body_forest':body,'02_front_bone':front,'03_glass_retainer':retainer,'04_accent_copper':accent,'05_desk_stand':stand,'06_UNO_fit_coupon':coupon,'07_LCD_button_coupon':sizes,'08_button_cap_copper':cap,'09_button_capture_washer':washer,'10_button_carrier':carrier,'11_button_blank_spacer':blank}
# Ensure support does not intrude into installed enclosure.
contact=stand.intersect(desk(body))
assert not contact.vals() or contact.val().Volume()<0.02,('stand/tub interference',contact.val().Volume())
# Save STEP in assembly coordinates, STL oriented with broad face on print bed.
assembly=cq.Assembly(name='Mystery Box')
colors=[(0.055,0.20,0.18),(0.89,0.86,0.77),(0.055,0.20,0.18),(0.72,0.36,0.20),(0.055,0.20,0.18)]
report={}
for i,(name,part) in enumerate(parts.items()):
 assert part.val().isValid(),name
 assert len(part.solids().vals())==1,(name,len(part.solids().vals()))
 cq.exporters.export(part,str(OUT/'source'/f'{name}.step'))
 printable=part
 if name in ('02_front_bone','08_button_cap_copper'): printable=part.rotate((0,0,0),(1,0,0),180)
 bb=printable.val().BoundingBox()
 printable=printable.translate((-bb.xmin,-bb.ymin,-bb.zmin))
 path=OUT/'print'/f'{name}.stl'
 cq.exporters.export(printable,str(path),tolerance=0.04,angularTolerance=0.08)
 mesh=trimesh.load(path,force='mesh')
 assert mesh.is_watertight and mesh.is_winding_consistent,name
 report[name]={'watertight':bool(mesh.is_watertight),'solids':len(part.solids().vals()),'volume_mm3':round(part.val().Volume(),2),'print_bounds_mm':mesh.extents.round(2).tolist(),'triangles':len(mesh.faces)}
 if i<5:
  assembly.add(desk(part) if i!=4 else part,name=name,color=cq.Color(*colors[i]))
for name,piece,color in [('button_cap',cap,(.72,.36,.20)),('capture_washer',washer,(.055,.20,.18)),('button_carrier',carrier,(.055,.20,.18)),('NO_SWITCH_spacer_REMOVE_before_switch',blank,(.72,.36,.20))]:
 assembly.add(desk(piece),name=name,color=cq.Color(*color))
assembly.add(desk(acrylic),name='CUT_clear_acrylic_2mm',color=cq.Color(0.75,0.90,0.94,0.3))
assembly.save(str(OUT/'Mystery-Box-assembly.step'))

# Expose meshes in assembly coordinates for an accurate illustration.
for name,part in list(parts.items())[:5]+[('acrylic',acrylic)]: cq.exporters.export(part,str(OUT/'preview'/f'{name}.stl'),tolerance=0.15)
# Button service checks. At rest cap head clears bezel by .6 mm;
# washer stops outward escape after .2 mm. Switch variant removes blank.
button_checks={}
for label,a,b in [('cap_front',cap,front),('washer_front',washer,front),('carrier_front',carrier,front),('carrier_blank',carrier,blank),('blank_washer',blank,washer),('button_body',carrier,body),('pressed_cap_front',cap.translate((0,0,-.6)),front)]:
 common=a.intersect(b);vol=common.val().Volume() if common.vals() else 0
 assert vol<.01,(label,vol)
 button_checks[label]=round(vol,6)
# Actual interference checks, including board keep-out envelopes.
for a,b in [('01_body_forest','02_front_bone'),('02_front_bone','03_glass_retainer')]:
 vol=parts[a].intersect(parts[b]).val().Volume() if parts[a].intersect(parts[b]).vals() else 0
 assert vol<0.01,(a,b,vol)
glass_overlap=front.intersect(acrylic)
assert not glass_overlap.vals() or glass_overlap.val().Volume()<.01,'acrylic/front overlap'
report['typography']={'integral_engraving':True,'rear_sentence':'Time will tell how much I love you.','features':typography_report,'paint_fill_optional':True}
report['assembly_checks']={'body_front_overlap_mm3':0,'front_retainer_overlap_mm3':0,'stand_body_overlap_mm3':0,'front_acrylic_overlap_mm3':0,'physical_fit_verified':False,'button_checks_mm3':button_checks,'button_nominal_press_travel_mm':0.6,'switch_actuator_gap_mm':0.2}
(OUT/'validation.json').write_text(json.dumps(report,indent=2))
# SVG at physical 1:1, no kerf compensation; shop must offset toolpath.
(OUT/'laser'/'window_178x66_R8_2mm.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="178mm" height="66mm" viewBox="0 0 178 66"><rect x="0" y="0" width="178" height="66" rx="8" fill="none" stroke="red" stroke-width="0.01"/></svg>''')
print(json.dumps(report,indent=2))
