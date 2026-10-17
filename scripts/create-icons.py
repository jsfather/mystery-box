"""Raster sizes of our code-native heart icon for iOS / the web manifest.
Run with Pillow installed; generated PNGs are tracked, no build dependency.
"""
from PIL import Image, ImageDraw
from pathlib import Path
import math
out = Path(__file__).resolve().parent.parent / 'web/public/icons'
out.mkdir(parents=True, exist_ok=True)
for name,size in [('icon-192.png',192),('icon-512.png',512),('maskable-512.png',512),('apple-touch-icon.png',180)]:
    scale=3
    image=Image.new('RGB',(size*scale,size*scale),'#a34c64')
    draw=ImageDraw.Draw(image)
    points=[]
    for i in range(361):
        t=i*2*math.pi/360
        x=16*math.sin(t)**3
        y=13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t)
        points.append(((.5+x*.018)*size*scale,(.47-y*.018)*size*scale))
    draw.polygon(points,fill='#fff4e7')
    center=.77*size*scale; radius=.025*size*scale
    draw.ellipse((center-radius,.23*size*scale-radius,center+radius,.23*size*scale+radius),fill='#f1c99e')
    image.resize((size,size),Image.Resampling.LANCZOS).save(out/name)
