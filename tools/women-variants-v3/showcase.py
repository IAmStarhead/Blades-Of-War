"""Extend the verified offline viewer with aligned face and ear comparisons."""
from __future__ import annotations
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('_women_v2_showcase', ROOT / 'tools/women-variants-v2/showcase.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous showcase builder')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
once = previous.once


def make_showcase(models: dict[str, bytes], well_archive: Path, build) -> bytes:
    html = previous.make_showcase(models, well_archive, build).decode('utf-8')
    html = once(html, 'Ева и четыре женские пробы · общее сравнение',
                'Ева и четыре женские пробы · лица и рост')
    html = once(html, '<p class="light-note">Выберите модель для крупного плана. Цвет кожи, лицо и корпус различаются; '
                'рост задан равномерным масштабом всей фигуры.</p>',
                '<p class="light-note">Лица и уши можно сравнить рядом: головы выровнены по высоте. '
                'Для сравнения роста используйте общий пол. Брови нарисованы на текстуре.</p>')
    html = once(html, '        <button type="button" data-mode="compare" class="wide">Сравнить рост · все пять</button>',
                '        <button type="button" data-mode="compare" class="wide">Сравнить рост · все пять</button>\n'
                '        <button type="button" data-mode="compare-faces">Сравнить лица</button>\n'
                '        <button type="button" data-mode="compare-ears">Сравнить уши</button>')
    html = once(html, '<p class="light-note">Проба мягкого хвата: флажок или ползунок возвращает исходные открытые кисти.</p>',
                '<p class="light-note">Обе кисти сгибаются вместе морфами; костей в GLB нет. '
                'Флажок или ползунок возвращает открытые кисти.</p>')
    html = once(html, 'Действует в режимах «Персонаж» и «Сравнить рост».',
                'Действует на персонажей и все виды сравнения.')
    html = once(html, '  const comparisonX = Object.fromEntries(comparisonOrder.map((key, i) => [key, (i - 2) * .64]));',
                '  const comparisonX = Object.fromEntries(comparisonOrder.map((key, i) => [key, (i - 2) * .64]));\n'
                '  const detailX = Object.fromEntries(comparisonOrder.map((key, i) => [key, (i - 2) * .245]));\n'
                "  const isComparison = mode => ['compare', 'compare-faces', 'compare-ears'].includes(mode);")
    html = once(html, "    if (state.mode !== 'compare' || !comparisonReady) return;\n    for (const model of Object.values(comparisonModels))",
                "    if (!isComparison(state.mode) || !comparisonReady) return;\n    for (const model of Object.values(comparisonModels))")
    html = once(html, "    const active = ['female', 'compare'].includes(state.mode) && state.softLight;",
                "    const active = (state.mode === 'female' || isComparison(state.mode)) && state.softLight;")
    html = once(html, "    document.querySelector('#soft-light').disabled = !['female', 'compare'].includes(state.mode);",
                "    document.querySelector('#soft-light').disabled = state.mode !== 'female' && !isComparison(state.mode);")
    html = once(html, "    const compare = state.mode === 'compare';\n    const angles = {front: 0, angle: Math.PI / 4, side: Math.PI / 2, back: Math.PI};\n    const angle = angles[state.view] || 0;",
                "    const compare = isComparison(state.mode);\n"
                "    const detail = compare && state.mode !== 'compare';\n"
                "    const angles = {front: 0, angle: Math.PI / 4, side: Math.PI / 2, back: Math.PI};\n"
                "    const angle = (state.mode === 'compare-ears' ? -Math.PI / 2 : 0) + (angles[state.view] || 0);")
    html = once(html, '        model.position.set(comparisonX[key], 0, 0);',
                '        model.position.set(detail ? detailX[key] : comparisonX[key],\n'
                '          detail ? 1.56 * (1 - womanScales[key]) : 0, 0);')
    html = once(html, "    wellProp.group.visible = !['female', 'compare'].includes(state.mode);",
                "    wellProp.group.visible = state.mode !== 'female' && !compare;")
    html = once(html, "      compare: comparisonReady ? 'Все пять моделей: общий пол, одна камера и шкала роста.' : 'Загрузка пяти моделей для сравнения…',",
                "      compare: comparisonReady ? 'Все пять моделей: общий пол, одна камера и шкала роста.' : 'Загрузка пяти моделей для сравнения…',\n"
                "      'compare-faces': 'Головы выровнены по глазам для сравнения лиц. Для роста вернитесь к общему полу.',\n"
                "      'compare-ears': 'Уши сбоку; головы выровнены. Ракурсы вращают каждую модель на месте.',")
    html = once(html, "  function frameView() {\n    const face =",
                "  function frameView() {\n"
                "    // A long lens keeps the end faces nearly frontal instead of\n"
                "    // turning them into apparent three-quarter views by parallax.\n"
                "    camera.fov = isComparison(state.mode) && state.mode !== 'compare' ? 8 : 30;\n"
                "    camera.updateProjectionMatrix();\n"
                "    const face =")
    html = once(html, "    } else if (state.mode === 'well') {\n      center = [-0.10, 1.22, 0.08];",
                "    } else if (isComparison(state.mode)) {\n"
                "      center = [0, 1.565, 0.02]; width = 1.22; height = 0.37; depthAllowance = 0.12;\n"
                "    } else if (state.mode === 'well') {\n      center = [-0.10, 1.22, 0.08];")
    html = once(html, "    if (state.mode !== 'compare') {\n      if (state.view === 'angle')",
                "    if (!isComparison(state.mode)) {\n      if (state.view === 'angle')")
    html = once(html, '    camera.position.set(center[0] + dist * dx, center[1] + ((singleHand || singleEar) ? 0 : face ? 0.01 : 0.12), center[2] + dist * dz);',
                "    camera.position.set(center[0] + dist * dx, center[1] + ((singleHand || singleEar || (isComparison(state.mode) && state.mode !== 'compare')) ? 0 : face ? 0.01 : 0.12), center[2] + dist * dz);")
    html = once(html, '  async function prepareComparison() {', "  async function prepareComparison(mode = 'compare') {")
    html = once(html, "    state.mode = 'compare'; state.view = 'front';", "    state.mode = mode; state.view = 'front';")
    html = once(html, "      if (serial !== loadSerial || state.mode !== 'compare') return false;",
                "      if (serial !== loadSerial || state.mode !== mode) return false;")
    html = once(html, "    if (mode === 'compare') return prepareComparison().catch(error => console.error(error));",
                "    if (isComparison(mode)) return prepareComparison(mode).catch(error => console.error(error));")
    html = once(html, "      if (state.mode === 'compare') ++loadSerial;", "      if (isComparison(state.mode)) ++loadSerial;")
    html = once(html, "    if (state.mode === 'compare') { state.mode = 'female'; state.view = 'front'; applyMode(); frameView(); }",
                "    if (isComparison(state.mode)) { state.mode = 'female'; state.view = 'front'; applyMode(); frameView(); }")
    html = once(html, "    if (state.mode !== 'compare' || !comparisonReady) return;\n    camera.updateMatrixWorld();",
                "    if (!isComparison(state.mode) || !comparisonReady) return;\n"
                "    const detail = state.mode !== 'compare';\n"
                "    guide.style.display = detail ? 'none' : '';\n"
                "    camera.updateMatrixWorld();")
    html = once(html, '      const p = project(comparisonX[key], womanHeights[key] / 100 + .055);\n      const element = labels[key];',
                '      const p = project(detail ? detailX[key] : comparisonX[key], detail ? 1.70 : womanHeights[key] / 100 + .055);\n'
                '      const element = labels[key];\n'
                "      element.querySelector('b').style.display = detail ? 'none' : '';")
    return html.encode('utf-8')
