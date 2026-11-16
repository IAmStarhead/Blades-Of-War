#!/usr/bin/env python3
"""Package three complementary ZIPs for an independent laboratory-game repo.

Only explicitly selected files are read. Inputs are checked by SHA-256; no
source model, image, or earlier archive is modified. Extract all three ZIPs
into the same project root. Uses only the Python standard library.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
GAME = 'work/eva-laboratory-game/'
EYE = 'work/character-model-search/selected-a/eye-study/'
EAR = 'work/character-model-search/selected-a/ear-study/'
OUTPUT = ROOT / GAME / 'handoff'

# Snapshot as it existed in the previous published commit. In particular, the
# untracked/rejected concept art and third-party photo references are excluded.
SHA256 = {
    GAME + 'README.md': '3de471f411ac76fabb8eae186305f6ec089c85bc577177bc5912d32a08fae9bf',
    GAME + 'CHARACTER_DESIGN.md': '8ab563266fda62df5671b3995f656e0e320fc4e54fe886373e4c362b2e449ea9',
    GAME + 'NAME_CHECK.md': 'cd6c3d0ff60f22456aa8c1b1f557c38fd15b6e453d0d5365cb7975973ad1c36a',
    GAME + 'concept-art/README.md': '145c749a6f5ee3b1711478f5f5b1058881be64efbffc854c3f064bd4ba89d373',
    GAME + 'concept-art/02-white-pod-chamber.png': 'ac95e0f7550af80182ef6ff94a44c204f3d7d60d1f6768b1242d4f5d11b13c12',
    GAME + 'concept-art/03-white-research-hub.png': '83fd746bad56765374bc5498a891031325835509f7bccfee471d5ccec54b747f',
    GAME + 'concept-art/04-eva-patient-gown.png': '6aa6ae9c94cf39f92b59b1eda39fa7236474c3de3c43b80dc2fd369579794bad',
    GAME + 'concept-art/05-eva-security-uniform.png': 'c7cae2cd83816cc04365f59a230851120d4ee7f7d581c16c3c7ff06377e698c2',
    EYE + 'female_A_eyes_refined.glb': '69d3818596d67037445a87fcc89e6aeacccf035a97c218cf139d117444139d10',
    EAR + 'female_A_ears_refined.glb': '531c2abfd67eccbcb21ab804f660abf533ce6d4f8091ecb8f17c222b15d3013d',
    EAR + 'female_A_ears_refined_and_well.zip': '08648f2ea63c0ebc9d6497dfe17d5ea97e48c5cf7d630a91c6b5528425f330c5',
    EAR + 'review/01-front.png': '9730151a3b4f1c339a66cd08c18359e3fc16eb59df4efb7ef3b269f18a48aa5f',
    EAR + 'review/02-front-ear-detail.png': 'db8898870c6ad2f172cb5c31b8a32ba65c831ae2e6bbf25e59048f57de4eb807',
    EAR + 'review/03-left-ear.png': '568312297fa5c7bec1f1582edb0dc0ad408f4915657be28be12361943dad9ef0',
    EAR + 'review/04-right-ear.png': 'e2f74a6961ad20060650acb0ef57d4caf71d00fa26f3883a80607bff3a28e07e',
    EAR + 'review/05-three-quarter.png': '6d4b204ddb85cd06972cc865ab015535a787ba3f89b550ccc673e2688896292d',
    EAR + 'review/06-back.png': 'e7b73ba82e02f21bcd91117665e28f5680ec98ec9c8fee57a7597d702a333b4b',
    'tools/model-a-refinement/makehuman/LICENSE.ASSETS.md': 'f6089cba01cb570a24712b41ab8a586ccd3cc5ef53dc266ca50b95c288956d2c',
    'tools/eva-laboratory-handoff/licenses/THREE_R187_LICENSE.txt': '8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc',
}


def checked(name: str) -> bytes:
    data = (ROOT / name).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != SHA256[name]:
        raise ValueError(f'Source checksum mismatch: {name}: {digest}')
    return data


def replace_exact(text: str, old: str, new: str, expected: int = 1) -> str:
    if text.count(old) != expected:
        raise ValueError(f'Unexpected document/viewer layout: {old!r}')
    return text.replace(old, new)


def portable_docs() -> dict[str, bytes]:
    readme = checked(GAME + 'README.md').decode('utf-8')
    readme = replace_exact(readme, 'Черновик временно хранится в этом репозитории, пока у игры нет своего.',
                           'Это комплект материалов для нового самостоятельного репозитория.')
    for old, new in [
        ('../character-model-search/selected-a/eye-study/README.md', 'models/heroine/README.md'),
        ('../character-model-search/selected-a/eye-study/female_A_eyes_refined.glb', 'models/heroine/female_A_eyes_refined.glb'),
        ('../character-model-search/selected-a/ear-study/README.md', 'models/heroine/README.md'),
    ]:
        readme = replace_exact(readme, old, new)
    anchor = '\n## Основная идея\n'
    readme = replace_exact(readme, anchor,
        '\n[Состав комплекта и перенос](TRANSFER_NOTE.md) · [Концепт-арты](concept-art/README.md) · '
        '[Модель героини](models/heroine/README.md)\n\n## Основная идея\n')

    design = checked(GAME + 'CHARACTER_DESIGN.md').decode('utf-8')
    for old, new, count in [
        ('../character-model-search/selected-a/eye-study/README.md', 'models/heroine/README.md', 1),
        ('../character-model-search/selected-a/eye-study/female_A_eyes_refined.glb', 'models/heroine/female_A_eyes_refined.glb', 1),
        ('../character-model-search/selected-a/ear-study/README.md', 'models/heroine/README.md', 2),
    ]:
        design = replace_exact(design, old, new, count)
    return {
        'README.md': readme.encode('utf-8'),
        'CHARACTER_DESIGN.md': design.encode('utf-8'),
        'NAME_CHECK.md': checked(GAME + 'NAME_CHECK.md'),
        'TRANSFER_NOTE.md': (HERE / 'TRANSFER_NOTE.md').read_bytes(),
    }


def portable_art() -> dict[str, bytes]:
    names = ['README.md', '02-white-pod-chamber.png', '03-white-research-hub.png',
             '04-eva-patient-gown.png', '05-eva-security-uniform.png']
    return {f'concept-art/{name}': checked(GAME + 'concept-art/' + name) for name in names}


def portable_model() -> dict[str, bytes]:
    model = checked(EAR + 'female_A_ears_refined.glb')
    baseline = checked(EYE + 'female_A_eyes_refined.glb')
    license_data = checked('tools/model-a-refinement/makehuman/LICENSE.ASSETS.md')
    with zipfile.ZipFile(io.BytesIO(checked(EAR + 'female_A_ears_refined_and_well.zip'))) as archive:
        if archive.testzip() is not None or archive.read('female_A_ears_refined.glb') != model:
            raise ValueError('Original showcase archive is corrupt or has a different model')
        if archive.read('LICENSE_MAKEHUMAN_ASSETS.md') != license_data:
            raise ValueError('Original showcase contains a different asset license')
        html = archive.read('BladesOfWar_Showcase.html').decode('utf-8')
    if html.count(base64.b64encode(model).decode('ascii')) != 1:
        raise ValueError('The viewer does not contain exactly the delivered model')
    # Only rebrand visible title/header; leave the renderer and embedded model
    # unchanged. The old well is explicitly described as a viewing prop.
    for old, new in [
        ('Blades of War — проба ушей героини', 'Просмотр героини — проба ушей'),
        ('<span class="mark" aria-hidden="true">B</span>', '<span class="mark" aria-hidden="true">3D</span>'),
        ('<h1>BLADES OF WAR</h1>', '<h1>ПРОБА ГЕРОИНИ</h1>'),
    ]:
        html = replace_exact(html, old, new)
    result = {
        'models/heroine/README.md': (HERE / 'model_README.md').read_bytes(),
        'models/heroine/female_A_ears_refined.glb': model,
        'models/heroine/female_A_eyes_refined.glb': baseline,
        'models/heroine/Heroine_Showcase.html': html.encode('utf-8'),
        'models/heroine/LICENSE_MAKEHUMAN_ASSETS.md': license_data,
        'models/heroine/LICENSE_THREEJS.md': checked('tools/eva-laboratory-handoff/licenses/THREE_R187_LICENSE.txt'),
    }
    for name in ['01-front.png', '02-front-ear-detail.png', '03-left-ear.png',
                 '04-right-ear.png', '05-three-quarter.png', '06-back.png']:
        result['models/heroine/review/' + name] = checked(EAR + 'review/' + name)
    return result


def make_zip(entries: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
    return out.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    # Compute and validate everything before writing any result.
    bundles = {
        '01_game_documents.zip': make_zip(portable_docs()),
        '02_concept_art.zip': make_zip(portable_art()),
        '03_heroine_model.zip': make_zip(portable_model()),
    }
    args.output.mkdir(parents=True, exist_ok=True)
    sums = []
    for name, data in bundles.items():
        (args.output / name).write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        sums.append(f'{digest}  {name}')
        print(f'{name}: {len(data)} bytes, SHA-256 {digest}')
    (args.output / 'SHA256SUMS').write_text('\n'.join(sums) + '\n', encoding='ascii')


if __name__ == '__main__':
    main()
