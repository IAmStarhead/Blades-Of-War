#!/usr/bin/env python3
"""Build research contact sheets from the exact scratch captures.

Sources must already be downloaded and attributed as in README.md; this script
only composes the extracts. It does not modify the source images or scenes.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('reference',type=Path,help='scratch directory containing named reference captures and extracted video frames')
p.add_argument('selected',type=Path,help='scratch directory from capture-poses.mjs')
p.add_argument('output',type=Path,help='new or empty output directory')
a=p.parse_args(); src=a.reference; selected=a.selected; out=a.output
out.mkdir(parents=True,exist_ok=True)
regular='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
F=ImageFont.truetype(regular,17); FB=ImageFont.truetype(bold,20); SMALL=ImageFont.truetype(regular,14); TINY=ImageFont.truetype(regular,12)
BG='#17271f'; FG='#edf2eb'; SUB='#c7d3c6'; ACCENT='#e5c996'
angles=['side','three','front','rear']; labels=['Сбоку','Три четверти','Спереди','Сзади']

def crop_image(path,box,size):
    im=Image.open(path).convert('RGB').crop(box);im.thumbnail(size,Image.Resampling.LANCZOS)
    result=Image.new('RGB',size,'#35473c');result.paste(im,((size[0]-im.width)//2,(size[1]-im.height)//2));return result

def header(w,title,subtitle,height):
    im=Image.new('RGB',(w,height),BG);d=ImageDraw.Draw(im);d.text((24,16),title,font=FB,fill=FG);d.text((24,46),subtitle,font=F,fill=SUB);return im,d

def save(im,name):
    target=out/name
    if target.exists(): raise SystemExit(f'Refusing to overwrite {target}')
    im.save(target,format='JPEG',quality=87,optimize=True,progressive=True)
    print(target, target.stat().st_size)

def mocap_sheet(prefix,frames,title,source):
    tile=(260,235);margin=20;top=104;row=270;w=2*margin+tile[0]*4;h=top+row*4+12
    im,d=header(w,title,source,h)
    for col,label in enumerate(labels):d.text((margin+col*tile[0]+8,76),label,font=F,fill=ACCENT)
    for row_i,frame in enumerate(frames):
        for col,angle in enumerate(angles):
            x=margin+col*tile[0];y=top+row_i*row
            im.paste(crop_image(src/f'{prefix}-{frame}-{angle}.png',(90,165,430,465),tile),(x,y))
            if col==0:d.text((x+5,y+tile[1]+5),f'Кадр исходного клипа {frame}',font=SMALL,fill=SUB)
    save(im,f'reference-{prefix}.jpg')

mocap_sheet('walk-12',[28,38,48,58],'Ходьба: четыре фазы и четыре ракурса','100STYLE → манекен HumanMotionCraft; один актёр, реконструкция, не видео')
mocap_sheet('run-9',[30,36,42,48],'Бег: четыре фазы и четыре ракурса','CMU → манекен HumanMotionCraft; реконструкция, не видео')
mocap_sheet('crouch7',[42,50,60,68],'Ходьба в приседе: четыре фазы и четыре ракурса','100STYLE → манекен HumanMotionCraft; намеренно стилизованное движение')

def comparison_gait():
    tile=(260,235);margin=20;top=104;row=270;w=2*margin+4*tile[0];h=top+row*4+16
    im,d=header(w,'Ходьба и бег: референс и персонаж','Ракурсы одинаковые; подобранные фазы приблизительны, люди и скорости различаются.',h)
    for col,label in enumerate(labels):d.text((margin+col*tile[0]+8,76),label,font=F,fill=ACCENT)
    rows=[('walk-12',28,'walk',28,'Ходьба · 100STYLE',True),('walk-12',28,'walk',28,'Ходьба · персонаж',False),
          ('run-9',30,'run',30,'Бег · CMU',True),('run-9',30,'run',30,'Бег · персонаж',False)]
    for r,(prefix,frame,kind,n,label,is_ref) in enumerate(rows):
        for col,angle in enumerate(angles):
            file=src/f'{prefix}-{frame}-{angle}.png' if is_ref else selected/f'{kind}-{n}-old-{angle}.png'
            box=(50,155,465,475) if kind=='run' and not is_ref and angle=='side' else (90,165,430,465)
            x=margin+col*tile[0];y=top+r*row;im.paste(crop_image(file,box,tile),(x,y))
            if col==0:d.text((x+5,y+tile[1]+5),label,font=SMALL,fill=SUB)
    save(im,'compare-walk-run.jpg')
comparison_gait()

def comparison_crouch():
    tile=(300,265);margin=24;top=108;row=300;w=margin*2+tile[0]*3;h=top+row*4+10
    im,d=header(w,'Присед в движении: одна сопоставленная фаза','Референс → прежняя проба → новая; фазы совмещены приблизительно.',h)
    for i,label in enumerate(['100STYLE · модель захвата','Прежняя проба','Новая проба']):d.text((margin+i*tile[0]+6,78),label,font=SMALL,fill=ACCENT)
    for r,angle in enumerate(angles):
        files=[src/f'crouch7-42-{angle}.png',selected/f'crouch-42-old-{angle}.png',selected/f'crouch-42-trial-{angle}.png']
        for c,file in enumerate(files):im.paste(crop_image(file,(90,165,430,465),tile),(margin+c*tile[0],top+r*row))
        d.text((margin+5,top+r*row+tile[1]+5),labels[r],font=SMALL,fill=SUB)
    save(im,'compare-crouch.jpg')
comparison_crouch()

def comparison_idle():
    tile=(300,265);margin=24;top=108;row=300;w=margin*2+tile[0]*2;h=top+row*4+10
    im,d=header(w,'Присед на месте: до и после','Не запись человека: одна модель; одинаковый ракурс и состояние.',h)
    for i,label in enumerate(['Прежняя проба','Новая симметричная поза']):d.text((margin+i*tile[0]+6,78),label,font=SMALL,fill=ACCENT)
    for r,angle in enumerate(angles):
        for c,label in enumerate(['old','trial']):im.paste(crop_image(selected/f'idle-0-{label}-{angle}.png',(90,165,430,465),tile),(margin+c*tile[0],top+r*row))
        d.text((margin+5,top+r*row+tile[1]+5),labels[r],font=SMALL,fill=SUB)
    save(im,'compare-idle.jpg')
comparison_idle()

def people_walk():
    tile=(260,260);margin=20;top=103;row=300;w=2*margin+4*tile[0];h=top+row*2+20
    im,d=header(w,'Настоящая ходьба: две синхронные камеры','Один человек и одни моменты; выбранные кадры OWN03, 30 кадров/с.',h)
    times=['11.8','12.0','12.2','12.4']
    for i,t in enumerate(times):d.text((margin+i*tile[0]+8,75),f'{t} с',font=F,fill=ACCENT)
    for i,t in enumerate(times):
        n=float(t)-11.8;x=int(68+205*n);f=src/f'walk-{t}.jpg'
        im.paste(crop_image(f,(x,340,x+300,640),tile),(margin+i*tile[0],top))
        im.paste(crop_image(f,(1170,250,1410,600),tile),(margin+i*tile[0],top+row))
    d.text((margin+5,top+tile[1]+7),'Боковая камера',font=SMALL,fill=SUB)
    d.text((margin+5,top+row+tile[1]+7),'Камера сзади',font=SMALL,fill=SUB)
    save(im,'people-walk.jpg')
people_walk()

def people_run():
    tile=(260,260);margin=20;top=103;row=300;w=2*margin+4*tile[0];h=top+row*2+20
    im,d=header(w,'Настоящий бег: два примера','Это разные люди, разные записи и скорости; кадры не синхронны.',h)
    side=['4.00','4.10','4.20','4.30'];rear=['3.00','3.17','3.33','3.50']
    for i,t in enumerate(side):
        im.paste(crop_image(src/f'run-man-{t}.jpg',(40,650,680,1270),tile),(margin+i*tile[0],top))
        d.text((margin+i*tile[0]+8,75),f'{t} с',font=SMALL,fill=ACCENT)
    for i,t in enumerate(rear):
        im.paste(crop_image(src/f'run-rear-{t}.jpg',(110,440,610,1220),tile),(margin+i*tile[0],top+row))
        d.text((margin+i*tile[0]+5,top+row+tile[1]+6),f'{t} с',font=SMALL,fill=SUB)
    d.text((margin+5,top+tile[1]+4),'Мужчина, сбоку, 30 кадр/с',font=SMALL,fill=SUB)
    d.text((margin+5,top+row-16),'Женщина, сзади, 120 кадр/с',font=TINY,fill=SUB)
    save(im,'people-run.jpg')
people_run()

def cmu_skeleton():
    data=json.loads((src/'cmu-136_09-poses.json').read_text());tile=(260,215);margin=20;top=104;row=250;w=2*margin+tile[0]*4;h=top+row*4+10
    im,d=header(w,'Ещё один референс приседа: CMU 136_09','Жёлтая — левая нога, голубая — правая; линии суставов, не поверхность тела.',h)
    for i,label in enumerate(labels):d.text((margin+i*tile[0]+8,76),label,font=F,fill=ACCENT)
    for r,t in enumerate([1.5,4.0,4.4,5.0]):
        state=data[round(t*30)]
        for c,angle in enumerate(angles):
            x=margin+c*tile[0];y=top+r*row;d.rectangle((x,y,x+tile[0]-1,y+tile[1]-1),fill='#33483d')
            def project(v):
                vx,vy,vz=v
                if angle=='side':horiz=vz
                elif angle=='front':horiz=-vx
                elif angle=='rear':horiz=vx
                else:horiz=(vz-vx)*.7071
                return (x+130+horiz*12.0,y+12-vy*12.0)
            for side,color in [('L','#f4c665'),('R','#66d1e5')]:
                points=[project(state[side][key]) for key in ('hip','knee','ankle')];d.line(points,fill=color,width=7,joint='curve')
                for px,py in points:d.ellipse((px-5,py-5,px+5,py+5),fill=color)
            h1=project(state['L']['hip']);h2=project(state['R']['hip']);d.line([h1,h2],fill='#e4e9e1',width=6)
            if c==0:d.text((x+5,y+tile[1]+5),f'{t:.1f} с · L {state["L"]["bend"]:.0f}° / R {state["R"]["bend"]:.0f}°',font=SMALL,fill=SUB)
    save(im,'reference-cmu-crouch.jpg')
cmu_skeleton()
