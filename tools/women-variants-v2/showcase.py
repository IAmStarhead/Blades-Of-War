"""Add a common-floor five-woman comparison to the existing offline viewer."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('_first_women_showcase', ROOT / 'tools/women-variants/showcase.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load previous showcase builder')
first = importlib.util.module_from_spec(spec)
spec.loader.exec_module(first)
once = first.once


def make_showcase(models: dict[str, bytes], well_archive: Path, build) -> bytes:
    html = first.make_showcase(models, well_archive, build).decode('utf-8')
    all_keys = ['eve', *[v.key for v in build.VARIANTS]]
    short_names = {'eve': 'Ева', 'north': 'Север', 'central': 'Центр', 'east': 'Япония', 'africa': 'Африка'}
    scales = {'eve': 1., **{v.key: v.scale for v in build.VARIANTS}}
    labels = {'eve': 'Ева', **{v.key: v.label for v in build.VARIANTS}}
    heights = {}
    for key in all_keys:
        doc, binary = build.helpers.read_glb(models[key])
        points = build.helpers.accessor(doc, binary, 0)
        heights[key] = round(float((points[:, 1].max() - points[:, 1].min()) * scales[key] * 100), 1)
    legend = ' · '.join(f"{labels[k]} {str(heights[k]).replace('.', ',')} см" for k in all_keys)
    definitions = (f'const comparisonOrder = {json.dumps(all_keys, ensure_ascii=False)};\n'
                   f'const comparisonShort = {json.dumps(short_names, ensure_ascii=False)};\n'
                   f'const womanHeights = {json.dumps(heights, ensure_ascii=False)};\n')
    html = once(html, "const vpEl = document.querySelector('#view');",
                definitions + "const vpEl = document.querySelector('#view');")
    html = once(html, 'Ева и три женские пробы · колодец', 'Ева и четыре женские пробы · общее сравнение')
    html = once(html, '        <button type="button" data-woman="east" aria-pressed="false">Японский мотив</button>',
                '        <button type="button" data-woman="east" aria-pressed="false">Японский мотив</button>\n'
                '        <button type="button" data-woman="africa" aria-pressed="false">Африканка</button>')
    html = once(html, '<p class="light-note">Предварительные пробы: лицо, грудь и ягодицы изменены локально; рост задан равномерным масштабом.</p>',
                '<p class="light-note">Выберите модель для крупного плана. Цвет кожи, лицо и корпус различаются; '
                'рост задан равномерным масштабом всей фигуры.</p>')
    html = once(html, '        <button type="button" data-mode="female">Персонаж</button>',
                '        <button type="button" data-mode="compare" class="wide">Сравнить рост · все пять</button>\n'
                '        <button type="button" data-mode="female">Персонаж</button>')
    html = once(html, '      <p class="eyebrow">Ракурс</p>',
                f'      <p class="height-legend"><strong>Рост:</strong> {legend}. Измерено от пола до макушки.</p>\n'
                '      <p class="eyebrow">Ракурс</p>')
    html = once(html, '  .touch-hint { display: none; }', '''  .touch-hint { display: none; }
  .height-legend { margin: 0 0 17px; color: #b8c1c7; font-size: 11px; line-height: 1.65; }
  #comparison-overlay { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  #comparison-overlay[hidden] { display: none; }
  #height-guide { position: absolute; width: 100%; height: 100%; overflow: visible; }
  #height-guide line { stroke: #ddd3c1; stroke-width: 1; stroke-dasharray: 4 6; opacity: .25; }
  #height-guide text { fill: #e6d9c3; font: 10px system-ui, sans-serif; opacity: .85; }
  .model-label { position: absolute; transform: translate(-50%, -100%); white-space: nowrap;
    text-align: center; font-size: 11px; line-height: 1.25; color: #f7eee0;
    text-shadow: 0 1px 3px #000; background: #182029d9; border: 1px solid #777362;
    border-radius: 4px; padding: 3px 5px; }
  .model-label b { display: block; color: #e6cfa8; font-weight: 600; }
  .short-name { display: none; }
  @media (max-width: 720px) {
    .model-label { font-size: 9px; padding: 2px 3px; }
    .full-name { display: none; }
    .short-name { display: inline; }
    /* The 10 cm ticks are too close together to label legibly on phones;
       each figure and the text legend still show its exact height. */
    #height-guide text { display: none; }
  }''')
    html = once(html, '    .stage { height: 61vh; min-height: 340px; }',
                '    .stage { height: 51vh; min-height: 340px; }')
    html = once(html, '    <div id="view"></div>', '''    <div id="view"></div>
    <div id="comparison-overlay" aria-hidden="true" hidden><svg id="height-guide"></svg></div>''')
    html = once(html, 'const studioFloor = new X(new sa(2.6, 48)', 'const studioFloor = new X(new sa(4, 48)')
    html = once(html, "  let activeWoman = 'eve', loadSerial = 0;", '''  let activeWoman = 'eve', loadSerial = 0;
  const comparisonModels = {};
  const comparisonX = Object.fromEntries(comparisonOrder.map((key, i) => [key, (i - 2) * .64]));
  let comparisonReady = false;
  function getWoman(key) {
    if (!womanCache[key]) {
      womanCache[key] = gltfLoader.loadAsync(womanUris[key]).catch(error => {
        delete womanCache[key];
        throw error;
      });
    }
    return womanCache[key];
  }''')
    html = once(html, '    lineMesh.morphTargetInfluences[ids.lineNarrow] = Math.min(1, 2 * b);',
                '    lineMesh.morphTargetInfluences[ids.lineNarrow] = Math.min(1, 2 * b);\n    syncComparisonMotion();')
    html = once(html, "    document.querySelector('#fist-range').value = String(Math.round(f * 100));",
                "    syncComparisonMotion();\n    document.querySelector('#fist-range').value = String(Math.round(f * 100));")
    html = once(html, '  function startBlink(now = performance.now()) {', '''  function syncComparisonMotion() {
    if (state.mode !== 'compare' || !comparisonReady) return;
    for (const model of Object.values(comparisonModels)) {
      if (model === female) continue;
      for (const [name, source] of [['basemesh_female_body', bodyMesh],
        ['face_blink', faceMesh], ['upper_eyelid_line', lineMesh]]) {
        const destination = model.getObjectByName(name);
        if (!destination || destination.morphTargetInfluences.length !== source.morphTargetInfluences.length)
          throw new Error('Несовместимые морфы сравниваемых моделей');
        source.morphTargetInfluences.forEach((value, index) => { destination.morphTargetInfluences[index] = value; });
      }
    }
  }
  function startBlink(now = performance.now()) {''')
    html = once(html, "    const active = state.mode === 'female' && state.softLight;",
                "    const active = ['female', 'compare'].includes(state.mode) && state.softLight;")
    html = once(html, "    document.querySelector('#soft-light').disabled = state.mode !== 'female';",
                "    document.querySelector('#soft-light').disabled = !['female', 'compare'].includes(state.mode);")
    html = once(html, 'Действует только в режиме «Персонаж».', 'Действует в режимах «Персонаж» и «Сравнить рост».')
    html = once(html, '''    const pair = state.mode === 'pair';
    female.visible = state.mode !== 'well';
    wellProp.group.visible = state.mode !== 'female';
    studioFloor.visible = state.mode === 'female';
    female.position.set(pair ? 1.0 : 0, 0, pair ? 0.15 : 0);
    female.rotation.set(0, 0, 0);''', '''    const pair = state.mode === 'pair';
    const compare = state.mode === 'compare';
    const angles = {front: 0, angle: Math.PI / 4, side: Math.PI / 2, back: Math.PI};
    const angle = angles[state.view] || 0;
    if (compare && comparisonReady) {
      for (const key of comparisonOrder) {
        const model = comparisonModels[key];
        scene.add(model);
        model.visible = true;
        model.position.set(comparisonX[key], 0, 0);
        model.rotation.set(0, angle, 0);
      }
    } else {
      for (const model of Object.values(comparisonModels)) if (model !== female) scene.remove(model);
      scene.add(female);
      female.visible = state.mode !== 'well';
      female.position.set(compare ? comparisonX[activeWoman] : pair ? 1.0 : 0, 0, pair ? 0.15 : 0);
      female.rotation.set(0, compare ? angle : 0, 0);
    }
    wellProp.group.visible = !['female', 'compare'].includes(state.mode);
    studioFloor.visible = ['female', 'compare'].includes(state.mode);
    document.querySelector('#comparison-overlay').hidden = !compare || !comparisonReady;''')
    html = once(html, "      well: 'Детализированный колодец из последней витрины',",
                "      well: 'Детализированный колодец из последней витрины',\n"
                "      compare: comparisonReady ? 'Все пять моделей: общий пол, одна камера и шкала роста.' : 'Загрузка пяти моделей для сравнения…',")
    html = once(html, "    } else if (state.mode === 'well') {\n      center = [-0.10, 1.22, 0.08];",
                "    } else if (state.mode === 'compare') {\n"
                "      center = [0, 0.90, 0]; width = 3.55; height = 2.12; depthAllowance = 0.18;\n"
                "    } else if (state.mode === 'well') {\n      center = [-0.10, 1.22, 0.08];")
    html = once(html, "    if (state.view === 'angle') { dx = 0.50; dz = 0.8660254; }\n    if (state.view === 'side') { dx = 1; dz = 0; }\n    if (state.view === 'back') { dx = 0; dz = -1; }",
                "    if (state.mode !== 'compare') {\n"
                "      if (state.view === 'angle') { dx = 0.50; dz = 0.8660254; }\n"
                "      if (state.view === 'side') { dx = 1; dz = 0; }\n"
                "      if (state.view === 'back') { dx = 0; dz = -1; }\n"
                "    }")
    html = once(html, '''  function setMode(mode) {
    if (!['female', 'well', 'pair'].includes(mode)) return;
    state.mode = mode;
    state.view = 'front';
    applyMode();
    frameView();
  }''', '''  async function prepareComparison() {
    const serial = ++loadSerial;
    state.mode = 'compare'; state.view = 'front';
    document.querySelector('#error').textContent = '';
    applyMode(); frameView();
    try {
      const all = await Promise.all(comparisonOrder.map(getWoman));
      if (serial !== loadSerial || state.mode !== 'compare') return false;
      all.forEach((gltf, index) => {
        const model = gltf.scene;
        model.traverse(object => {
          if (object.isMesh) { object.castShadow = true; object.receiveShadow = false; object.frustumCulled = false; }
        });
        comparisonModels[comparisonOrder[index]] = model;
      });
      comparisonReady = true;
      applyMode(); syncComparisonMotion(); frameView();
      return true;
    } catch (error) {
      if (serial === loadSerial) {
        state.mode = 'female'; applyMode(); frameView();
        document.querySelector('#status').textContent = 'Не удалось загрузить сравнение.';
        document.querySelector('#error').textContent = String(error?.message || error);
      }
      throw error;
    }
  }
  function setMode(mode) {
    if (mode === 'compare') return prepareComparison().catch(error => console.error(error));
    if (!['female', 'well', 'pair'].includes(mode)) return;
    ++loadSerial;
    state.mode = mode;
    state.view = 'front';
    applyMode();
    frameView();
  }''')
    html = once(html, "    if (['face', 'hands', 'left-hand', 'right-hand', 'left-ear', 'right-ear'].includes(view)) state.mode = 'female';",
                "    if (['face', 'hands', 'left-hand', 'right-hand', 'left-ear', 'right-ear'].includes(view)) {\n"
                "      if (state.mode === 'compare') ++loadSerial;\n"
                "      state.mode = 'female';\n"
                "    }")
    html = once(html, "    const serial = ++loadSerial;\n    document.querySelector('#error').textContent = '';\n    if (!womanCache[key]) {\n      document.querySelector('#status').textContent = `Загрузка: ${womanLabels[key]}…`;\n      womanCache[key] = gltfLoader.loadAsync(womanUris[key]);\n    }\n    let next;\n    try { next = await womanCache[key]; }",
                "    const serial = ++loadSerial;\n"
                "    if (state.mode === 'compare') { state.mode = 'female'; state.view = 'front'; applyMode(); frameView(); }\n"
                "    document.querySelector('#error').textContent = '';\n"
                "    if (!womanCache[key]) document.querySelector('#status').textContent = `Загрузка: ${womanLabels[key]}…`;\n"
                "    let next;\n    try { next = await getWoman(key); }")
    html = once(html, '  function resize() {', '''  const overlay = document.querySelector('#comparison-overlay');
  const guide = document.querySelector('#height-guide');
  const svgNS = 'http://www.w3.org/2000/svg';
  const guideRows = [0, 1.5, 1.6, 1.7, 1.8].map(height => {
    const line = document.createElementNS(svgNS, 'line');
    const text = document.createElementNS(svgNS, 'text');
    text.textContent = `${Math.round(height * 100)} см`;
    guide.append(line, text);
    return {height, line, text};
  });
  const labels = Object.fromEntries(comparisonOrder.map(key => {
    const element = document.createElement('div');
    element.className = 'model-label';
    const full = document.createElement('span'); full.className = 'full-name'; full.textContent = womanLabels[key];
    const short = document.createElement('span'); short.className = 'short-name'; short.textContent = comparisonShort[key];
    const size = document.createElement('b'); size.textContent = `${womanHeights[key].toFixed(1).replace('.', ',')} см`;
    element.append(full, short, size); overlay.appendChild(element);
    return [key, element];
  }));
  const point = controls.target.clone();
  function updateComparisonOverlay() {
    if (state.mode !== 'compare' || !comparisonReady) return;
    camera.updateMatrixWorld();
    const width = vpEl.clientWidth, height = vpEl.clientHeight;
    guide.setAttribute('viewBox', `0 0 ${width} ${height}`);
    function project(x, y, z = 0) {
      point.set(x, y, z).project(camera);
      return {x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2, z: point.z};
    }
    for (const {height: level, line, text} of guideRows) {
      const a = project(-1.70, level), b = project(1.66, level);
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      text.setAttribute('x', a.x + 3); text.setAttribute('y', a.y - 3);
    }
    for (const key of comparisonOrder) {
      const p = project(comparisonX[key], womanHeights[key] / 100 + .055);
      const element = labels[key];
      element.style.left = `${p.x}px`; element.style.top = `${p.y}px`;
      element.style.visibility = p.z < 1 ? 'visible' : 'hidden';
    }
  }
  function resize() {''')
    html = once(html, '    controls.update();\n    renderer.render(scene, camera);',
                '    controls.update();\n    updateComparisonOverlay();\n    renderer.render(scene, camera);')
    html = once(html, "    setMode, setView, bodyMesh, faceMesh, lineMesh, clips: loaded.animations, setBlinkWeight, setFistWeight, selectWoman, woman: activeWoman };\n  window.ready = true;",
                "    setMode, setView, bodyMesh, faceMesh, lineMesh, clips: loaded.animations, setBlinkWeight, setFistWeight, selectWoman, woman: activeWoman, comparisonModels, womanHeights };\n"
                "  Object.defineProperty(window.preview, 'comparisonReady', {get: () => comparisonReady});\n"
                "  window.ready = true;\n  setMode('compare');")
    return html.encode('utf-8')
