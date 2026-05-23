import os
try:
    from PIL import Image
    import random
    os.makedirs('assets/images', exist_ok=True)
    img = Image.new('RGBA', (200, 200), (0,0,0,0))
    pixels = img.load()
    for y in range(200):
        for x in range(200):
            # Film grain is just random grayscale noise with alpha
            v = random.randint(0, 255)
            pixels[x, y] = (v, v, v, 255)
    img.save('assets/images/grain.png')
    print("grain.png generated")
except ImportError:
    print("Pillow not installed. Installing and running...")
    os.system("pip3 install Pillow && python3 scripts/generate_grain.py")
