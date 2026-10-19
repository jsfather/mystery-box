"""Orthographic illustration from actual CAD meshes; electronics are envelopes."""
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
import trimesh
import sys
import build
REAR="--rear" in sys.argv
PORTS="--ports" in sys.argv
O=build.OUT
S=2; im=Image.new('RGB',(1600*S,1060*S),'#eee9df'); d=ImageDraw.Draw(im)
font='/System/Library/Fonts/Supplemental/Arial.ttf'
def f(n):return ImageFont.truetype(font,n*S)
d.text((95*S,64*S),'M Y S T E R Y   B O X',font=f(42),fill='#193e37')
d.text((98*S,125*S),'The words behind the clock.' if REAR else 'A little time. A little world.',font=f(20),fill='#7c8076')
# Camera from front-left and above.
eye=np.array([.30,1.7,.65] if REAR else ([-1.7,-.5,.65] if PORTS else [-.45,-1.7,.70]));eye/=np.linalg.norm(eye)
right=np.cross([0,0,1],eye);right/=np.linalg.norm(right);up=np.cross(eye,right)
scale=5.0*S; center=np.array([95,14,58])
def project(v):
 q=v-center
 return np.column_stack([800*S+q@right*scale,570*S-q@up*scale])
def desk_vertices(v):
 a=np.deg2rad(78);r=np.array([[1,0,0],[0,np.cos(a),-np.sin(a)],[0,np.sin(a),np.cos(a)]])
 return v@r.T+[0,24,7]
triangles=[]
light=np.array([-.5,-1,1.5]);light/=np.linalg.norm(light)
def add(mesh,color,desk=True):
 v=desk_vertices(mesh.vertices) if desk else mesh.vertices
 for tri in mesh.faces:
  pts=v[tri];n=np.cross(pts[1]-pts[0],pts[2]-pts[0]);nl=np.linalg.norm(n)
  if nl<1e-12:continue
  n/=nl
  if n@eye<-.01:continue
  shade=.66+.34*max(0,n@light)
  rgb=tuple(int(c*shade) for c in color)
  triangles.append((pts@eye,project(pts),rgb))
colors=[(26,71,60),(229,221,202),(26,71,60),(183,104,65),(26,71,60)]
for i,(name,p) in enumerate(list(build.parts.items())[:5]):
 m=trimesh.load(O/'preview'/f'{name}.stl',force='mesh');add(m,colors[i],i!=4)
def solid(part,color):
 verts,faces=part.val().tessellate(.15)
 add(trimesh.Trimesh([[v.x,v.y,v.z] for v in verts],faces,process=False),color)
# Optional paint infill shows actual engraved glyph geometry.
for lettering,color in build.paint_letters: solid(lettering,color)
# Electronics envelopes use actual support coordinates.
solid(build.box(build.BX,build.BY,8,68.58,53.34,1),(26,102,82))
for y,w in [(build.BY+1.1,44),(build.BY+49.2,49)]: solid(build.box(21,y,9,w,3,8.5),(39,42,39))
solid(build.box(3,build.USB_Y-4.5,9,6.5,9,3),(172,177,171))
solid(build.box(1.5,build.DC_Y-4.5,9,13,9,11),(36,39,36))
solid(build.box(5,39,9,18,15,3),(150,157,148))
solid(build.box(51,56,9,10,10,1.5),(42,45,40))
heart=['001100001100','011110011110','111111111111','111111111111','011111111110','001111111100','000111111000','000011110000']
for row in range(8):
 for col in range(12):
  solid(build.cyl(build.BX+34+col*2.05,build.BY+25-row*2.05,10,.55,.5),(247,77,48) if heart[row][col]=='1' else (90,70,52))
solid(build.box(100,34,22,80,36,1.6),(24,91,67))
solid(build.box(104,39,23.6,72,26,7.5),(34,39,35))
solid(build.box(108,43,31.1,64,18,.2),(132,167,118))
# Printed cap, identical in switch and blank configurations.
solid(build.cap,(188,113,77))
# Screw heads.
for x,y in build.CASE_HOLES: solid(build.cyl(x,y,38,2.8,1.4),(107,115,106))
shadow=Image.new('RGBA',im.size);sd=ImageDraw.Draw(shadow);sd.ellipse((220*S,780*S,1350*S,970*S),fill=(34,46,36,50));shadow=shadow.filter(ImageFilter.GaussianBlur(28*S));im=Image.alpha_composite(im.convert('RGBA'),shadow);d=ImageDraw.Draw(im)
# Depth-buffer rasterization avoids painter artifacts across wide CAD faces.
canvas=np.array(im.convert('RGB')); depth=np.full((im.height,im.width),-np.inf)
for zz,p,c in triangles:
 lo=np.maximum(np.floor(p.min(axis=0)).astype(int),0);hi=np.minimum(np.ceil(p.max(axis=0)).astype(int),[im.width-1,im.height-1])
 if np.any(hi<lo):continue
 x0,y0=lo;x1,y1=hi
 a,b,cc=p
 den=(b[1]-cc[1])*(a[0]-cc[0])+(cc[0]-b[0])*(a[1]-cc[1])
 if abs(den)<1e-8:continue
 yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
 u=((b[1]-cc[1])*(xx-cc[0])+(cc[0]-b[0])*(yy-cc[1]))/den
 v=((cc[1]-a[1])*(xx-cc[0])+(a[0]-cc[0])*(yy-cc[1]))/den
 w=1-u-v;z=u*zz[0]+v*zz[1]+w*zz[2]
 old=depth[y0:y1+1,x0:x1+1];mask=(u>=-1e-7)&(v>=-1e-7)&(w>=-1e-7)&(z>old)
 old[mask]=z[mask];canvas[y0:y1+1,x0:x1+1][mask]=c
im=Image.fromarray(canvas).convert('RGBA');d=ImageDraw.Draw(im)
if not REAR and not PORTS:
 # LCD text transformed through front-plane basis, matches displayed envelope.
 textim=Image.new('RGBA',(640,180));td=ImageDraw.Draw(textim);tf=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',65)
 td.text((10,0),'21:08:36',font=tf,fill=(28,54,31));td.text((10,90),'OUR STORY',font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',52),fill=(28,54,31))
 # Map rectangular LCD image into projected parallelogram by inverse affine.
 p0,p1,p2=project(desk_vertices(np.array([[108,61,31.4],[172,61,31.4],[108,43,31.4]])))
 A=np.column_stack([(p1-p0)/640,(p2-p0)/180]);inv=np.linalg.inv(A);offs=-inv@p0
 warped=textim.transform(im.size,Image.Transform.AFFINE,tuple([*inv[0],offs[0],*inv[1],offs[1]]),resample=Image.Resampling.BICUBIC)
 im=Image.alpha_composite(im,warped);d=ImageDraw.Draw(im)
d.text((100*S,982*S),'190 × 110 × 40 mm   /   12° desk stand   /   clear 2 mm acrylic',font=f(18),fill='#4e665b')
d.text((100*S,1015*S),'CAD geometry preview • Optional paint-filled engraving shown • Prototype fit required',font=f(13),fill='#7b8177')
im.resize((1600,1060),Image.Resampling.LANCZOS).convert('RGB').save(O/'preview'/('Mystery-Box-rear.png' if REAR else ('Mystery-Box-ports.png' if PORTS else 'Mystery-Box.png')))
print('Rendered Mystery-Box.png')
