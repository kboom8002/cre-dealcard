import os
import shutil
from PIL import Image, ImageDraw, ImageFont

raw_path = "docs/test/real-broker-im/sinsa-media/image6.png"
output_path = "docs/golden-test-data/p2-sinsa-trading/r3-verified/images/cadastral_map.png"

img = Image.open(raw_path).convert("RGBA")
overlay = Image.new("RGBA", img.size, (255, 255, 255, 0))
draw = ImageDraw.Draw(overlay)

# Vertices on 1247x771
points = [
    (458.6, 357.3),
    (715.6, 258.7),
    (771.2, 401.1),
    (784.3, 396.3),
    (811.1, 470.3),
    (675.0, 525.0),
    (663.4, 491.5),
    (448.3, 572.3),
]

# Semi-transparent red fill
draw.polygon(points, fill=(239, 68, 68, 25))
# Bold red outline
draw.polygon(points, outline=(239, 68, 68, 255), width=6)

# Badge on top left
bx, by, bw, bh = 40, 35, 320, 95
draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=8, fill=(255, 255, 255, 240), outline=(203, 213, 225, 255), width=2)

try:
    font1 = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 22)
    font2 = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 18)
except Exception:
    font1 = font2 = ImageFont.load_default()

def draw_check(x, y, color):
    draw.line([(x, y + 8), (x + 5, y + 14), (x + 14, y + 2)], fill=color, width=3)

draw_check(bx + 20, by + 20, (16, 185, 129, 255))
draw.text((bx + 42, by + 16), "3종일반주거지역", fill=(15, 23, 42, 255), font=font1)

draw_check(bx + 20, by + 56, (16, 185, 129, 255))
draw.text((bx + 42, by + 52), "일조권 사선제한 / 정량 적합", fill=(51, 65, 85, 255), font=font2)

out = Image.alpha_composite(img, overlay).convert("RGB")
out.save(output_path, "PNG")
print("Successfully generated outlined cadastral map at:", output_path)
