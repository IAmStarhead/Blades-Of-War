"""Extend the offline v3 viewer for Eve plus five individual studies."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('_women_v3_showcase', ROOT / 'tools/women-variants-v3/showcase.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous showcase builder')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
once = previous.once


def make_showcase(models: dict[str, bytes], well_archive: Path, build) -> bytes:
    html = previous.make_showcase(models, well_archive, build).decode('utf-8')
    html = once(html, 'Ева и четыре женские пробы · лица и рост',
                'Ева и пять женских проб · лица и рост')
    html = once(html, '        <button type="button" data-woman="africa" aria-pressed="false">Африканка</button>',
                '        <button type="button" data-woman="africa" aria-pressed="false">Африканка</button>\n'
                '        <button type="button" data-woman="spain" aria-pressed="false">Испанский образ</button>')
    html = once(html, 'Сравнить рост · все пять', 'Сравнить рост · все шесть')
    html = once(html, 'Все пять моделей: общий пол, одна камера и шкала роста.',
                'Все шесть моделей: общий пол, одна камера и шкала роста.')
    html = once(html, 'Загрузка пяти моделей для сравнения…', 'Загрузка шести моделей для сравнения…')
    short = {'eve': 'Ева', 'north': 'Север', 'central': 'Центр', 'east': 'Япония', 'africa': 'Африка'}
    extended = {**short, 'spain': 'Испания'}
    html = once(html, f'const comparisonShort = {json.dumps(short, ensure_ascii=False)};',
                f'const comparisonShort = {json.dumps(extended, ensure_ascii=False)};')
    html = once(html, '(i - 2) * .64', '(i - 2.5) * .64')
    html = once(html, '(i - 2) * .245', '(i - 2.5) * .23')
    html = once(html, 'center = [0, 0.90, 0]; width = 3.55; height = 2.12; depthAllowance = 0.18;',
                'center = [0, 0.90, 0]; width = 4.15; height = 2.12; depthAllowance = 0.18;')
    html = once(html, 'center = [0, 1.565, 0.02]; width = 1.22; height = 0.37; depthAllowance = 0.12;',
                'center = [0, 1.565, 0.02]; width = 1.48; height = 0.37; depthAllowance = 0.12;')
    html = once(html, 'const a = project(-1.70, level), b = project(1.66, level);',
                'const a = project(-2.00, level), b = project(1.96, level);')
    # The embedded, hash-verified Three.js bundle names Vector3 and Plane G/Ir.
    # In aligned detail modes the shoulders otherwise overlap. This is a
    # rendering-only world-space cut below the neck; no model data is changed.
    html = once(html, '  const renderer = new Dd({antialias: true});',
                '  const renderer = new Dd({antialias: true});\n'
                '  const detailPlane = new Ir(new G(0, 1, 0), -1.42);')
    html = once(html, "    const detail = compare && state.mode !== 'compare';",
                "    const detail = compare && state.mode !== 'compare';\n"
                "    renderer.clippingPlanes = detail ? [detailPlane] : [];")
    html = once(html, "'compare-faces': 'Головы выровнены по глазам для сравнения лиц. Для роста вернитесь к общему полу.',",
                "'compare-faces': 'Головы выровнены, тела визуально скрыты ниже шеи. Для роста вернитесь к общему полу.',")
    html = once(html, "'compare-ears': 'Уши сбоку; головы выровнены. Ракурсы вращают каждую модель на месте.',",
                "'compare-ears': 'Головы выровнены, тела визуально скрыты ниже шеи. Ракурсы вращают каждую модель на месте.',")
    return html.encode('utf-8')
