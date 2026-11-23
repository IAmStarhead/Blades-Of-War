#!/usr/bin/env python3
"""Make a self-contained Russian visual report from diagnose.mjs output.

Requires Pillow and a Cyrillic-capable DejaVu Sans font. Destination must not
already exist; the delivered scene and GLB are never opened for writing.
"""
from __future__ import annotations
import base64
import html
import io
import json
from pathlib import Path
import shutil
import sys
from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) != 3:
    raise SystemExit('Usage: python make-report.py DIAGNOSTIC-DIRECTORY NEW-OUTPUT-DIRECTORY')
src, dst = map(lambda p: Path(p).resolve(), sys.argv[1:])
if not src.is_dir() or dst.exists():
    raise SystemExit('Input must exist and output must be a new directory')
d = json.loads((src / 'diagnosis.json').read_text(encoding='utf8'))
if d['schema'] != 'bow-leg-diagnosis-v1':
    raise SystemExit('Unexpected diagnostic schema')
dst.mkdir(parents=True)
shutil.copyfile(src / 'diagnosis.json', dst / 'diagnosis.json')
font_dir = Path('/usr/share/fonts/truetype/dejavu')
regular, bold = font_dir / 'DejaVuSans.ttf', font_dir / 'DejaVuSans-Bold.ttf'
if not regular.exists() or not bold.exists():
    raise SystemExit('DejaVu Sans with Cyrillic is required')

def font(size, strong=False):
    return ImageFont.truetype(str(bold if strong else regular), size)

def fmt(value, decimals=1):
    return f'{value:.{decimals}f}'.replace('.', ',')

f68, f293 = d['frames']['68'], d['frames']['293']
sep = lambda variant: abs(variant['bones']['L']['ankle'][2] - variant['bones']['R']['ankle'][2]) * 100
oldsep, newsep = sep(f68['variants']['zero']), sep(f68['variants']['hybrid'])
base = f293['baseline']
ring_on, ring_off = f293['on']['R'][2], f293['off']['R'][2]
weight = f293['weightExperiment']
source_idle = d['sourceProbes'][0]['legs']['R']

# Pairs use the same crop within each pair: no viewpoint or relative scaling
# changes are applied to either image. They are crops of actual WebGL renders.
groups = [
    {'title':'1. Скелет: кости не растягиваются',
     'note':'Цветные линии — кости. Длины сегментов одинаковы в обоих кадрах.',
     'box':(305, 95, 640, 505),
     'cells':[('frame68-skeleton.png','На месте · 2,27 с'),('frame293-skeleton.png','В движении · 9,77 с')]},
    {'title':'2. Поза: новая смесь глубже и асимметричнее',
     'note':'Кадр 2,27 с: одна модель, ракурс и фаза. Это не готовое исправление.',
     'box':(305, 95, 640, 505),
     'cells':[('frame68-pose-zero.png','0 % новой анимации'),('frame68-pose-hybrid.png','45 % · поза из видео')]},
    {'title':'3. Сетка: веса меняют форму при той же позе',
     'note':'Скелет и морф одинаковы. Экспериментальные веса не являются готовым решением.',
     'box':(345, 265, 570, 500),
     'cells':[('frame293-side.png','Исходные веса'),('frame293-sharpWeights.png','Экспериментальные веса')]},
    {'title':'4. Коррекция колена не исправляет всю форму',
     'note':f'Проекция кольца: {fmt(ring_off["width"]*1000,0)} мм без морфа, {fmt(ring_on["width"]*1000,0)} мм с ним.',
     'box':(345, 265, 570, 500),
     'cells':[('frame293-noMorph.png','Коррекция выключена'),('frame293-side.png','Коррекция включена в видео')]},
]

def cropped(filename, box, width):
    with Image.open(src / filename) as im:
        im = im.convert('RGB').crop(box)
    return im.resize((width, round(width * im.height / im.width)), Image.Resampling.LANCZOS)

def png64(im):
    output = io.BytesIO()
    im.save(output, 'PNG', optimize=True)
    return base64.b64encode(output.getvalue()).decode('ascii')

# A single annotated image is convenient for opening and zooming on a phone.
W, margin, gap = 1200, 48, 24
col = (W - 2 * margin - gap) // 2
heights = [round(col * (g['box'][3]-g['box'][1]) / (g['box'][2]-g['box'][0])) for g in groups]
H = 142 + sum(124 + h for h in heights) + 32
sheet = Image.new('RGB', (W, H), '#f3f6f2')
draw = ImageDraw.Draw(sheet)
draw.text((margin, 22), 'Почему ноги кажутся «спагетти»', font=font(39, True), fill='#182d21')
draw.text((margin, 84), 'Проверка двух кадров. Сцена и модель не изменены.', font=font(23), fill='#43574b')
y = 142
for group, height in zip(groups, heights):
    draw.text((margin, y), group['title'], font=font(27, True), fill='#183c2b')
    for i, (filename, label) in enumerate(group['cells']):
        x = margin + i * (col + gap)
        draw.text((x, y + 42), label, font=font(21, True), fill='#203d2d')
        image = cropped(filename, group['box'], col)
        sheet.paste(image, (x, y + 76))
    draw.text((margin, y + 84 + height), group['note'], font=font(19), fill='#405349')
    y += 124 + height
sheet.save(dst / 'razbor-nog.png', optimize=True)

# Inline all render crops so the HTML works as a single offline file.
sections = []
for group in groups:
    cells = []
    for filename, label in group['cells']:
        image = cropped(filename, group['box'], 540)
        cells.append(f'<figure><figcaption>{html.escape(label)}</figcaption>'
                     f'<img width="{image.width}" height="{image.height}" alt="{html.escape(label)}" '
                     f'src="data:image/png;base64,{png64(image)}"></figure>')
    sections.append(f'<section><h2>{html.escape(group["title"])}</h2><div class="pair">{"".join(cells)}</div>'
                    f'<p class="note">{html.escape(group["note"])}</p></section>')

idle_old = f68['variants']['zero']['bones']
idle_new = f68['variants']['hybrid']['bones']
walk_old = f293['variants']['zero']['bones']
walk_new = f293['variants']['hybrid']['bones']
angles = lambda b: f'{fmt(b["L"]["bendDegrees"],0)}° / {fmt(b["R"]["bendDegrees"],0)}°'
shinlow = f293['on']['R'][0]['shinBlend'] * 100
shinhigh = f293['on']['R'][4]['shinBlend'] * 100
page = f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Почему ноги кажутся «спагетти» — разбор</title>
<style>
:root{{color-scheme:light; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; background:#f1f5f0; color:#172a20}}
*{{box-sizing:border-box}} body{{margin:0; line-height:1.56}} main{{max-width:1020px; margin:auto; padding:24px clamp(16px,4vw,38px) 64px}}
h1{{font-size:clamp(1.7rem,5vw,2.6rem); line-height:1.13; margin:.25em 0 .35em}} h2{{font-size:clamp(1.22rem,3vw,1.55rem); line-height:1.25}}
.lead{{font-size:1.08rem}} .summary{{background:#e1efe3; border-left:5px solid #438458; border-radius:6px; padding:14px 18px; margin:22px 0}}
section{{margin:30px 0; padding:20px; border:1px solid #d3dfd5; border-radius:14px; background:white; box-shadow:0 3px 18px #264d2e0c}}
.pair{{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px}} figure{{margin:0; min-width:0}} figcaption{{font-weight:700; font-size:.94rem; margin:0 0 8px; overflow-wrap:anywhere}}
img{{display:block; width:100%; height:auto; border-radius:7px}} .note{{color:#455c4d; margin:12px 0 0; font-size:.93rem}}
code{{font-size:.93em; overflow-wrap:anywhere}} table{{border-collapse:collapse; width:100%; font-size:.94rem}} td,th{{padding:8px; text-align:left; border-bottom:1px solid #dce7dd}}
small{{color:#506355}} @media(max-width:600px){{section{{padding:14px}} .pair{{gap:8px}} figcaption{{font-size:.83rem; min-height:3.9em; line-height:1.3; display:flex; align-items:end}}}}
</style></head><body><main>
<h1>Почему ноги кажутся «спагетти»</h1>
<p class="lead">Разобраны два ваших скриншота новой пробы: примерно <b>2,27 с</b> и <b>9,77 с</b> видео.</p>
<div class="summary"><b>Вывод:</b> здесь складываются два эффекта — неудачно выглядящая поза выбранной анимации и деформация поверхности ноги при сгибании. Измеримого растяжения костей в этих двух позах нет. Прежние технические проверки не оценивали естественность силуэта.</div>
{sections[0]}
<p>Жёлтым и голубым показаны цепочки бедро → колено → лодыжка → пальцы. В обоих кадрах длина каждого сегмента бедра — {fmt(base['L']['thighLength']*100,1)} см, голени — {fmt(base['L']['shinLength']*100,1)} см, как у исходного рига. Это относится только к проверенным позам и не гарантирует правильную форму кожи.</p>
{sections[1]}
<p>В статичном кадре расстояние между центрами лодыжек вдоль направления движения выросло с {fmt(oldsep)} до {fmt(newsep)} см: получился асимметричный, похожий на выпад присед. Углы изменения направления бедра к голени (L / R) были {angles(idle_old)}, стали {angles(idle_new)}. В движении — {angles(walk_old)} и {angles(walk_new)} соответственно. Ноль градусов означал бы прямую линию; сами числа не являются нормативом анатомии.</p>
<p>Контроль с 0 % — прежняя поза в той же новой сцене, 45 % — выпущенный гибрид с ретаргетом и подгонкой к полу. Это не доказательство, что старая поза идеальна. В исходном клипе у правой ноги в соответствующей фазе уже примерно {fmt(source_idle['sourceBend'],1)}° сгиба; сырой перенос на модель даёт {fmt(source_idle['rawRetargetBend'],1)}°. Значит, в этой фазе перенос не создал этот изгиб с нуля, хотя остальные особенности ретаргета здесь не исчерпывающе проверены.</p>
{sections[2]}
<p>В исходной сетке влияние голени распределено широко: на контрольных кольцах примерно в 7 см ниже и выше центра колена её средний вес составляет около {fmt(shinlow,0)} % и {fmt(shinhigh,0)} %. При сильном сгибе меш плавно усредняет преобразования бедра и голени. В диагностике мы изменили только соотношение этих весов: скелет и морф остались прежними, но {weight['affectedVertices']} вершин сместились в среднем на {fmt(weight['meanShift']*1000,1)} мм, максимум на {fmt(weight['maxShift']*1000,1)} мм. Это показывает вклад сетки, но не доказывает, что такой вариант весов годится для игры.</p>
{sections[3]}
<p>Коррекция объёма колена <b>уже включена в ролике</b>. Для одного отслеживаемого кольца в кадре 9,77 с передне-задняя проекция составляла {fmt(ring_on['rest']*1000,1)} мм в исходной сетке, {fmt(ring_off['width']*1000,1)} мм без морфа и {fmt(ring_on['width']*1000,1)} мм с ним. Это проекция кольца, а не измерение полного объёма или всей анатомии ноги. Морф уменьшает измеренное сжатие, но положение костей и остальной силуэт он не исправляет.</p>
<section><h2>Что проверять при исправлении</h2><ol>
<li>Пересобрать позу приседа: спокойная опора в неподвижном состоянии и отдельные фазы шага, а не сильный выпад по умолчанию.</li>
<li>Отдельно проверить привязку сетки и корректирующие формы на серии сгибов, не только на одном кольце.</li>
<li>Оценивать сбоку, спереди и под углом весь вход, цикл и выход, включая контакт стоп и регрессии ходьбы и бега.</li></ol>
<p class="note">В этих двух кадрах runtime-IK защиты пола не вносил поправку; при переходах он может работать. Авторская подгонка стопы при создании статичного клипа меняла изгиб правого колена примерно на 2°, поэтому отделять этапы важно.</p></section>
<p><small>Кадры выбраны сопоставлением цветовой маски со скриншотами; соседние кадры первого момента похожи. Значения и воспроизводимые инструменты находятся в <code>diagnosis.json</code> и <code>tools/male-leg-diagnosis/</code>. Скриншоты с телефона в репозиторий не добавлены. Модель, анимация и выпущенная сцена не изменялись.</small></p>
</main></body></html>'''
(dst / 'index.html').write_text(page, encoding='utf8')
print(f'Created {dst / "index.html"}, {dst / "razbor-nog.png"}, and diagnosis.json')
