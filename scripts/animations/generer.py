# Génère une animation fluide (MP4) par exercice à partir des 2 photos de Free Exercise DB (domaine public).
# Les images intermédiaires sont calculées par interpolation IA (RIFE, via rife-ncnn-vulkan) :
# position de départ -> position d'arrivée, puis le même trajet à l'envers, avec une pause à chaque extrémité.
# Usage : python3 scripts/animations/generer.py <dossier rife-ncnn-vulkan> [nb_processus]
# Sortie : public/anim/s{planche}-{ligne}.mp4 (même repère que les planches de sprites)
import json, os, sys, shutil, subprocess, tempfile, urllib.request, concurrent.futures as cf
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, '..', '..', 'public', 'anim')
RIFE = sys.argv[1]
W, H = 360, 240
ETAPES = 8          # images par trajet (aller ou retour)
PAUSE, PASSAGE = 10, 2  # durée d'affichage (en images à 25 i/s) des extrémités et des images intermédiaires

def photo(source, i, dossier):
    p = os.path.join(dossier, f'{i}.jpg')
    urllib.request.urlretrieve(f'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/{source}/{i}.jpg', p)
    im = Image.open(p).convert('RGB'); r = W / H
    if im.width / im.height > r: nw = int(im.height * r); im = im.crop(((im.width - nw) // 2, 0, (im.width - nw) // 2 + nw, im.height))
    else: nh = int(im.width / r); im = im.crop((0, (im.height - nh) // 2, im.width, (im.height - nh) // 2 + nh))
    return im

def generer(item):
    source, planche, ligne = item
    cible = os.path.join(SORTIE, f's{planche}-{ligne}.mp4')
    if os.path.exists(cible): return None
    with tempfile.TemporaryDirectory() as t:
        ent, sor, seq = (os.path.join(t, d) for d in ('in', 'out', 'seq'))
        for d in (ent, sor, seq): os.mkdir(d)
        a, b = photo(source, 0, t), photo(source, 1, t)
        a.save(os.path.join(ent, '1.png')); b.save(os.path.join(ent, '2.png'))
        # 2 images A, B interpolées en 2 x ETAPES : la première moitié va de A à B (la suite répète B)
        subprocess.run([os.path.join(RIFE, 'rife-ncnn-vulkan'), '-i', ent, '-o', sor, '-m', os.path.join(RIFE, 'rife-v4.6'), '-n', str(2 * ETAPES)],
                       check=True, capture_output=True)
        k = 0
        for i in list(range(ETAPES + 1)) + list(range(ETAPES - 1, 0, -1)):
            im = Image.open(os.path.join(sor, f'{i + 1:08d}.png')).convert('RGB').resize((W, H), Image.LANCZOS)
            for _ in range(PAUSE if i % ETAPES == 0 else PASSAGE):
                im.save(os.path.join(seq, f'{k:04d}.png')); k += 1
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', '25', '-i', os.path.join(seq, '%04d.png'),
                        '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'veryslow',
                        '-movflags', '+faststart', '-an', cible + '.tmp.mp4'], check=True)
        os.replace(cible + '.tmp.mp4', cible)
    return source

if __name__ == '__main__':
    os.makedirs(SORTIE, exist_ok=True)
    items = json.load(open(os.path.join(ICI, 'exercices.json')))
    with cf.ThreadPoolExecutor(int(sys.argv[2]) if len(sys.argv) > 2 else 2) as ex:
        for n, (item, fut) in enumerate(zip(items, [ex.submit(generer, it) for it in items]), 1):
            try: fut.result(); print(n, item[0], flush=True)
            except Exception as e: print(n, item[0], 'ÉCHEC', e, flush=True)
