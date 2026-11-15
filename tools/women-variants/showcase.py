"""Turn the existing self-contained Eve showcase into a four-model selector."""
from __future__ import annotations
import base64
import json
from pathlib import Path


def once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise ValueError(f'Unexpected showcase template ({text.count(old)} matches): {old[:100]!r}')
    return text.replace(old, new, 1)


def make_showcase(models: dict[str, bytes], well_archive: Path, build) -> bytes:
    if set(models) != {'eve', *[v.key for v in build.VARIANTS]}:
        raise ValueError('Expected Eve plus the three individual studies')
    html = build.eye.make_showcase(models['eve'], well_archive).decode('utf-8')
    for old, new in [
        ('Blades of War — проба глаз Евы', 'Blades of War — Ева и женские пробы'),
        ('Ева · проба глаз + колодец', 'Ева и три женские пробы · колодец'),
        ('<button type="button" data-mode="female">Женщина А</button>',
         '<button type="button" data-mode="female">Персонаж</button>'),
        ('<div class="group motion-controls" aria-label="Движения Евы">',
         '<div class="group motion-controls" aria-label="Движения персонажа">'),
        ('<p class="eyebrow">Движения Евы</p>', '<p class="eyebrow">Движения</p>'),
        ('Мягкий свет для Евы', 'Мягкий свет для персонажа'),
        ('Действует только в режиме «Женщина А».', 'Действует только в режиме «Персонаж».'),
        ("    mode: 'pair', view: 'front', spin: false, animateWell: true, softLight: true,",
         "    mode: 'female', view: 'front', spin: false, animateWell: true, softLight: true,"),
        ("      female: 'Женщина А · проба глаз',", "      female: `${womanLabels[activeWoman]} · отдельная 3D-проба`,"),
        ("      pair: 'Женщина А и детализированный колодец',", "      pair: `${womanLabels[activeWoman]} и детализированный колодец`,"),
    ]:
        html = once(html, old, new)

    selector = '''    <div class="group" aria-label="Выбор женской модели">
      <p class="eyebrow">Персонаж</p>
      <div class="buttons">
        <button type="button" data-woman="eve" class="active" aria-pressed="true">Ева</button>
        <button type="button" data-woman="north" aria-pressed="false">Северянка</button>
        <button type="button" data-woman="central" aria-pressed="false">Централка</button>
        <button type="button" data-woman="east" aria-pressed="false">Японский мотив</button>
      </div>
      <p class="light-note">Предварительные пробы: лицо, грудь и ягодицы изменены локально; рост задан равномерным масштабом.</p>
    </div>
'''
    html = once(html, '    <div class="group">\n      <p class="eyebrow">Сцена</p>',
                selector + '    <div class="group">\n      <p class="eyebrow">Сцена</p>')

    uris = {v.key: 'data:model/gltf-binary;base64,' + base64.b64encode(models[v.key]).decode('ascii')
            for v in build.VARIANTS}
    scales = {'eve': 1., **{v.key: v.scale for v in build.VARIANTS}}
    labels = {'eve': 'Ева', **{v.key: v.label for v in build.VARIANTS}}
    definitions = (f'const womanUris = {json.dumps(uris, ensure_ascii=False, separators=(",", ":"))};\n'
                   f'const womanScales = {json.dumps(scales, ensure_ascii=False, separators=(",", ":"))};\n'
                   f'const womanLabels = {json.dumps(labels, ensure_ascii=False, separators=(",", ":"))};\n')
    html = once(html, "const vpEl = document.querySelector('#view');", definitions + "const vpEl = document.querySelector('#view');")
    html = once(html, '  const loaded = await new jd().loadAsync(FEMALE_URI);\n  const female = loaded.scene;',
                '''  const gltfLoader = new jd();
  let loaded = await gltfLoader.loadAsync(FEMALE_URI);
  let female = loaded.scene;
  const womanCache = { eve: Promise.resolve(loaded) };
  let activeWoman = 'eve', loadSerial = 0;''')
    html = once(html, "  const bodyMesh = female.getObjectByName('basemesh_female_body');",
                "  let bodyMesh = female.getObjectByName('basemesh_female_body');")
    html = once(html, "  const faceMesh = female.getObjectByName('face_blink');",
                "  let faceMesh = female.getObjectByName('face_blink');")
    html = once(html, "  const lineMesh = female.getObjectByName('upper_eyelid_line');",
                "  let lineMesh = female.getObjectByName('upper_eyelid_line');")
    html = once(html, '  const ids = {\n    fists:', '  let ids = {\n    fists:')
    html = once(html, '    const dist = fit(height, width) + depthAllowance;',
                '''    if (state.mode === 'female') {
      // Root scale changes height without non-uniformly reshaping limbs. Frame
      // the chosen model's face, hands and ears at the correct world position.
      const size = womanScales[activeWoman];
      center = center.map(value => value * size);
      width *= size; height *= size; depthAllowance *= size;
    }
    const dist = fit(height, width) + depthAllowance;''')

    select_fn = '''  async function selectWoman(key) {
    if (!(key in womanScales)) return false;
    const serial = ++loadSerial;
    document.querySelector('#error').textContent = '';
    if (!womanCache[key]) {
      document.querySelector('#status').textContent = `Загрузка: ${womanLabels[key]}…`;
      womanCache[key] = gltfLoader.loadAsync(womanUris[key]);
    }
    let next;
    try { next = await womanCache[key]; }
    catch (error) {
      delete womanCache[key];
      if (serial === loadSerial) {
        document.querySelector('#status').textContent = 'Не удалось загрузить выбранную модель.';
        document.querySelector('#error').textContent = String(error?.message || error);
      }
      throw error;
    }
    if (serial !== loadSerial) return false;
    const candidate = next.scene;
    const nextBody = candidate.getObjectByName('basemesh_female_body');
    const nextFace = candidate.getObjectByName('face_blink');
    const nextLine = candidate.getObjectByName('upper_eyelid_line');
    const nextIds = {
      fists: target(nextBody, 'Fists'),
      fistQuarter: target(nextBody, 'FistQuarterCorrection'),
      fistHalf: target(nextBody, 'FistHalfCorrection'),
      fistThreeQuarter: target(nextBody, 'FistThreeQuarterCorrection'),
      blink: target(nextFace, 'Blink'),
      lineBlink: target(nextLine, 'Blink'), lineNarrow: target(nextLine, 'BlinkLineNarrow'),
    };
    candidate.traverse(object => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = false; object.frustumCulled = false; }
    });
    scene.remove(female);
    female = candidate; loaded = next; bodyMesh = nextBody; faceMesh = nextFace; lineMesh = nextLine;
    ids = nextIds; activeWoman = key;
    scene.add(female);
    setBlinkWeight(state.blinkWeight); setFistWeight(state.fistWeight);
    applyMode(); frameView();
    document.querySelectorAll('[data-woman]').forEach(button => {
      const active = button.dataset.woman === activeWoman;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (window.preview) Object.assign(window.preview, { female, bodyMesh, faceMesh, lineMesh,
      clips: loaded.animations, woman: activeWoman });
    return true;
  }
  document.querySelectorAll('[data-woman]').forEach(button => button.addEventListener('click', () => {
    selectWoman(button.dataset.woman).catch(error => console.error(error));
  }));
'''
    html = once(html, "  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));",
                select_fn + "  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));")
    html = once(html, '    setMode, setView, bodyMesh, faceMesh, lineMesh, clips: loaded.animations, setBlinkWeight, setFistWeight };',
                "    setMode, setView, bodyMesh, faceMesh, lineMesh, clips: loaded.animations, setBlinkWeight, setFistWeight, selectWoman, woman: activeWoman };")
    return html.encode('utf-8')
