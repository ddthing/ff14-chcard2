#!/usr/bin/env python3
"""Build local, glyph-range preview fonts without changing original font assets.

This is an offline preparation tool. The application does not invoke Python:
the generated WOFF2 files and their manifest are static public assets. Run it
with the pinned workspace fontTools runtime documented in the manifest.
"""

from __future__ import annotations

import argparse
import copy
from concurrent.futures import ProcessPoolExecutor
import hashlib
import io
import json
import re
import sys
from pathlib import Path
from typing import Any
import zipfile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = PROJECT_ROOT / "licenses/fonts/REQUESTED_FONT_AUDIT_2026-10-13.json"
MANIFEST_PATH = PROJECT_ROOT / "licenses/fonts/PREVIEW_FONT_SUBSETS_2026-10-13.json"
OUTPUT_ROOT = PROJECT_ROOT / "public/fonts/previews"
EXPECTED_FONTTOOLS = "4.66.1"
EXPECTED_BROTLI = "1.2.0"
MANIFEST_SCHEMA_VERSION = 1
DEFAULT_BLOCK_SIZE = 512
METADATA_NAME_IDS = (0, 5, 8, 9, 10, 11, 12, 13, 14)
FAMILY_NAME_IDS = (1, 3, 4, 6, 16, 17, 18, 21, 25)


# These are all checked-in local faces at or above 300 KB whose reviewed
# license permits a derivative. Original files remain the production faces.
# The preview aliases intentionally do not contain any upstream reserved name.
SOURCE_FAMILIES: list[dict[str, Any]] = [
    {
        "fontId": "gmarket-sans",
        "family": "Gmarket Sans",
        "previewFamily": "XIV Preview 001",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Gmarket-Sans-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Gmarket-Sans-OFL.txt",
        "reservedFontNames": ["Gmarket Sans Font"],
        "sourceUrl": "https://corp.gmarket.com/fonts/",
        "supplementalNotices": [],
        "faces": [
            {
                "path": "public/fonts/gmarket-sans-light.woff2",
                "expectedBytes": 374600,
                "cssWeight": 300,
            },
            {
                "path": "public/fonts/gmarket-sans-medium.woff2",
                "expectedBytes": 411932,
                "cssWeight": 500,
            },
            {
                "path": "public/fonts/gmarket-sans-bold.woff2",
                "expectedBytes": 422344,
                "cssWeight": 700,
            },
        ],
    },
    {
        "fontId": "pretendard",
        "family": "Pretendard Variable",
        "previewFamily": "XIV Preview 002",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Pretendard-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Pretendard-OFL.txt",
        "reservedFontNames": ["Pretendard"],
        "sourceUrl": "https://github.com/orioncactus/pretendard/tree/v1.3.9",
        "supplementalNotices": [],
        "faces": [{"path": "public/fonts/pretendard-variable.woff2", "expectedBytes": 2057688}],
    },
    {
        "fontId": "pretendard-jp",
        "family": "Pretendard JP Variable",
        "previewFamily": "XIV Preview 003",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Pretendard-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Pretendard-OFL.txt",
        "reservedFontNames": ["Pretendard"],
        "sourceUrl": "https://github.com/orioncactus/pretendard/tree/v1.3.9",
        "supplementalNotices": [],
        "faces": [{"path": "public/fonts/pretendard-jp-variable.woff2", "expectedBytes": 5348104}],
    },
    {
        "fontId": "maruminya-hangul",
        "family": "x12y12pxMaruMinyaHangul",
        "previewFamily": "XIV Preview 004",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/MaruMinya-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/MaruMinya-OFL.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://quiple.dev/font/maruminya-hangul",
        "supplementalNotices": [],
        "faces": [{"path": "public/fonts/maruminya-hangul.woff2", "expectedBytes": 497884, "cssWeight": 500}],
    },
    {
        "fontId": "mona-12",
        "family": "Mona12",
        "previewFamily": "XIV Preview 005",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Mona-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Mona-OFL.txt",
        "reservedFontNames": ["Mona"],
        "sourceUrl": "https://github.com/MonadABXY/mona-font",
        "supplementalNotices": ["licenses/fonts/Mona-Third-Party-Notices.txt"],
        "faces": [
            {"path": "public/fonts/mona-12.woff2", "expectedBytes": 1253032, "cssWeight": 400},
            {"path": "public/fonts/mona-12-bold.woff2", "expectedBytes": 1308056, "cssWeight": 700},
        ],
    },
    {
        "fontId": "limgul-12",
        "family": "Limgul 12",
        "previewFamily": "XIV Preview 006",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Limgul-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Limgul-OFL.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://github.com/MonadABXY/limgul-font",
        "supplementalNotices": [],
        "faces": [
            {"path": "public/fonts/limgul-12.woff2", "expectedBytes": 416564, "cssWeight": 400},
            {"path": "public/fonts/limgul-12-bold.woff2", "expectedBytes": 361976, "cssWeight": 700},
        ],
    },
    {
        "fontId": "suhgung-12",
        "family": "Suhgung 12",
        "previewFamily": "XIV Preview 007",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Suhgung-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Suhgung-OFL.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://github.com/MonadABXY/suhgung-font",
        "supplementalNotices": [],
        "faces": [
            {"path": "public/fonts/suhgung-12.woff2", "expectedBytes": 435512, "cssWeight": 400},
            {"path": "public/fonts/suhgung-12-bold.woff2", "expectedBytes": 368108, "cssWeight": 700},
        ],
    },
    {
        "fontId": "tangba-12",
        "family": "Tangba 12",
        "previewFamily": "XIV Preview 008",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Tangba-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Tangba-OFL.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://github.com/MonadABXY/tangba-font",
        "supplementalNotices": [],
        "faces": [
            {"path": "public/fonts/tangba-12.woff2", "expectedBytes": 422320, "cssWeight": 400},
            {"path": "public/fonts/tangba-12-bold.woff2", "expectedBytes": 367832, "cssWeight": 700},
        ],
    },
    {
        "fontId": "umdot-12",
        "family": "Umdot 12",
        "previewFamily": "XIV Preview 009",
        "license": "SIL Open Font License 1.1",
        "licenseFile": "licenses/fonts/Umdot-OFL.txt",
        "publicLicenseFile": "public/fonts/licenses/Umdot-OFL.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://github.com/MonadABXY/umdot-font",
        "supplementalNotices": [],
        "faces": [
            {"path": "public/fonts/umdot-12.woff2", "expectedBytes": 409428, "cssWeight": 400},
            {"path": "public/fonts/umdot-12-bold.woff2", "expectedBytes": 361188, "cssWeight": 700},
        ],
    },
    {
        "fontId": "seoul-hangang",
        "family": "SeoulHangang",
        "previewFamily": "XIV Preview 010",
        "license": "KOGL Type 1",
        "licenseFile": "licenses/fonts/Seoul-KOGL-Type-1.txt",
        "publicLicenseFile": "public/fonts/licenses/Seoul-KOGL-Type-1.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://www.seoul.go.kr/seoul/font.do",
        "sourceAttribution": "Seoul Metropolitan Government",
        "supplementalNotices": [],
        "faces": [
            {
                "path": "public/fonts/seoul-hangang-light.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulHangangL.ttf",
                "expectedBytes": 1366320,
                "cssWeight": 300,
            },
            {
                "path": "public/fonts/seoul-hangang-medium.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulHangangM.ttf",
                "expectedBytes": 1659940,
                "cssWeight": 500,
            },
            {
                "path": "public/fonts/seoul-hangang-bold.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulHangangB.ttf",
                "expectedBytes": 1475336,
                "cssWeight": 700,
            },
            {
                "path": "public/fonts/seoul-hangang-extrabold.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulHangangEB.ttf",
                "expectedBytes": 1704132,
                "cssWeight": 800,
            },
        ],
    },
    {
        "fontId": "seoul-namsan",
        "family": "SeoulNamsan",
        "previewFamily": "XIV Preview 011",
        "license": "KOGL Type 1",
        "licenseFile": "licenses/fonts/Seoul-KOGL-Type-1.txt",
        "publicLicenseFile": "public/fonts/licenses/Seoul-KOGL-Type-1.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://www.seoul.go.kr/seoul/font.do",
        "sourceAttribution": "Seoul Metropolitan Government",
        "supplementalNotices": [],
        "faces": [
            {
                "path": "public/fonts/seoul-namsan-light.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulNamsanL.ttf",
                "expectedBytes": 1090508,
                "cssWeight": 300,
            },
            {
                "path": "public/fonts/seoul-namsan-medium.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulNamsanM.ttf",
                "expectedBytes": 1158528,
                "cssWeight": 500,
            },
            {
                "path": "public/fonts/seoul-namsan-bold.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulNamsanB.ttf",
                "expectedBytes": 1130876,
                "cssWeight": 700,
            },
            {
                "path": "public/fonts/seoul-namsan-extrabold.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulNamsanEB.ttf",
                "expectedBytes": 1247012,
                "cssWeight": 800,
            },
        ],
    },
    {
        "fontId": "seoul-alrim",
        "family": "SeoulAlrim",
        "previewFamily": "XIV Preview 012",
        "license": "KOGL Type 1",
        "licenseFile": "licenses/fonts/Seoul-KOGL-Type-1.txt",
        "publicLicenseFile": "public/fonts/licenses/Seoul-KOGL-Type-1.txt",
        "reservedFontNames": [],
        "sourceUrl": "https://www.seoul.go.kr/seoul/font.do",
        "sourceAttribution": "Seoul Metropolitan Government",
        "supplementalNotices": [],
        "faces": [
            {
                "path": "public/fonts/seoul-alrim-medium.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulAlrim-Medium.otf",
                "expectedBytes": 528848,
                "cssWeight": 500,
            },
            {
                "path": "public/fonts/seoul-alrim-bold.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulAlrim-Bold.otf",
                "expectedBytes": 681836,
                "cssWeight": 700,
            },
            {
                "path": "public/fonts/seoul-alrim-extrabold.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulAlrim-ExtraBold.otf",
                "expectedBytes": 680012,
                "cssWeight": 800,
            },
            {
                "path": "public/fonts/seoul-alrim-heavy.woff2",
                "subsetSourceArchive": "tmp/font-seoul-ownglyph/seoul_font3.zip",
                "subsetSourceMemberSuffix": "SeoulAlrim-Heavy.otf",
                "expectedBytes": 563896,
                "cssWeight": 900,
            },
        ],
    },
]


# These sources are intentionally not transformed. Their locally reviewed
# terms either prohibit font-file modification or do not authorize conversion.
EXCLUDED_FONTS: list[dict[str, str]] = [
    {
        "fontId": "ownglyph-yeongrong",
        "sourcePath": "public/fonts/ownglyph-yeongrong.woff2",
        "reason": "Ownglyph Original Font License permits embedding/distribution but prohibits font-file modification.",
        "licenseFile": "licenses/fonts/Ownglyph-Original-License.txt",
    },
    {
        "fontId": "ownglyph-park-dahyeon",
        "sourcePath": "public/fonts/ownglyph-park-dahyeon.woff2",
        "reason": "Ownglyph Original Font License permits embedding/distribution but prohibits font-file modification.",
        "licenseFile": "licenses/fonts/Ownglyph-Original-License.txt",
    },
    {
        "fontId": "chai-hwaljjak",
        "sourcePath": "public/fonts/chai-hwaljjak-regular.woff2",
        "reason": "CHAI font terms require the original official WOFF2 and prohibit conversion/subsetting.",
        "licenseFile": "licenses/fonts/CHAI-Hwaljjak-License.txt",
    },
    {
        "fontId": "chai-rising",
        "sourcePath": "public/fonts/chai-rising-light.woff2",
        "reason": "CHAI font terms require the original official WOFF2 and prohibit conversion/subsetting.",
        "licenseFile": "licenses/fonts/CHAI-Rising-License.txt",
    },
    {
        "fontId": "ok-dandan",
        "sourcePath": "public/fonts/ok-dandan-bold.ttf",
        "reason": "App-specific permission does not authorize conversion or font-file redistribution.",
        "licenseFile": "licenses/fonts/Ok-Dandan-Permission.txt",
    },
]


# The previously measured cold popup requested these real font weights for
# an ASCII-only card name. This reports a reproducible WOFF2 asset-byte
# estimate; it is not a browser transfer measurement.
LATIN_POPUP_REQUESTS = [
    ("limgul-12", "public/fonts/limgul-12.woff2"),
    ("maruminya-hangul", "public/fonts/maruminya-hangul.woff2"),
    ("mona-12", "public/fonts/mona-12.woff2"),
    ("suhgung-12", "public/fonts/suhgung-12.woff2"),
    ("seoul-namsan", "public/fonts/seoul-namsan-medium.woff2"),
    ("seoul-alrim", "public/fonts/seoul-alrim-medium.woff2"),
    ("seoul-hangang", "public/fonts/seoul-hangang-medium.woff2"),
    ("ownglyph-park-dahyeon", "public/fonts/ownglyph-park-dahyeon.woff2"),
]
LATIN_POPUP_CODEPOINTS = [0x0043, 0x006F, 0x006E, 0x0065, 0x0072]
_FILE_HASH_CACHE: dict[Path, str] = {}


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cached_sha256_path(path: Path) -> str:
    path = path.resolve()
    if path not in _FILE_HASH_CACHE:
        _FILE_HASH_CACHE[path] = sha256_path(path)
    return _FILE_HASH_CACHE[path]


def project_path(relative_path: str) -> Path:
    path = (PROJECT_ROOT / relative_path).resolve()
    try:
        path.relative_to(PROJECT_ROOT.resolve())
    except ValueError as error:
        raise RuntimeError(f"Manifest path escapes the project: {relative_path}") from error
    return path


def output_path_for(root: Path, relative_path: str) -> Path:
    relative = Path(relative_path)
    prefix = Path("public/fonts/previews")
    try:
        local = relative.relative_to(prefix)
    except ValueError as error:
        raise RuntimeError(f"Preview output must stay under {prefix}: {relative_path}") from error
    root = root.resolve()
    result = (root / local).resolve()
    try:
        result.relative_to(root)
    except ValueError as error:
        raise RuntimeError(f"Preview output escapes its root: {relative_path}") from error
    return result


def require_font_tools():
    try:
        import brotli
        import fontTools
        from fontTools.subset import Options, Subsetter
        from fontTools.ttLib import TTFont
    except ImportError as error:
        raise RuntimeError(
            "fontTools and Brotli are required only for this offline generator. "
            "Use the pinned workspace runtime with PYTHONPATH=tmp/font-tools-runtime."
        ) from error

    if fontTools.__version__ != EXPECTED_FONTTOOLS:
        fail(f"Expected fontTools {EXPECTED_FONTTOOLS}, found {fontTools.__version__}")
    if brotli.__version__ != EXPECTED_BROTLI:
        fail(f"Expected Brotli {EXPECTED_BROTLI}, found {brotli.__version__}")
    return TTFont, Options, Subsetter, fontTools.__version__, brotli.__version__


def read_audit_assets() -> dict[str, dict[str, Any]]:
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    return {asset["path"]: asset for asset in audit["assets"]}


def read_subset_input(face: dict[str, Any], TTFont: Any) -> tuple[Any, dict[str, Any]]:
    """Use a locally reviewed original TTF/OTF when present; otherwise WOFF2."""
    if face.get("subsetSourcePath") and project_path(face["subsetSourcePath"]).is_file():
        relative = face["subsetSourcePath"]
        source_path = project_path(relative)
        data = source_path.read_bytes()
        source = TTFont(io.BytesIO(data), recalcTimestamp=False, recalcBBoxes=False)
        return source, {
            "method": "original-font-file",
            "path": relative,
            "bytes": len(data),
            "sha256": sha256_bytes(data),
        }

    if face.get("subsetSourceArchive") and project_path(face["subsetSourceArchive"]).is_file():
        archive_relative = face["subsetSourceArchive"]
        archive_path = project_path(archive_relative)
        archive_digest = cached_sha256_path(archive_path)
        suffix = face["subsetSourceMemberSuffix"]
        with zipfile.ZipFile(archive_path) as archive:
            candidates = [
                info for info in archive.infolist()
                if not info.is_dir() and info.filename.endswith(suffix)
            ]
            if len(candidates) != 1:
                fail(f"Expected one {suffix} member in {archive_relative}, found {len(candidates)}")
            info = candidates[0]
            data = archive.read(info)
        source = TTFont(io.BytesIO(data), recalcTimestamp=False, recalcBBoxes=False)
        return source, {
            "method": "reviewed-original-archive-member",
            "archivePath": archive_relative,
            "archiveSha256": archive_digest,
            "memberSuffix": suffix,
            "memberBytes": len(data),
            "memberSha256": sha256_bytes(data),
        }

    # The original containers under tmp/ are optional regeneration sources.
    # Their checked-in WOFF2 equivalents remain sufficient to verify outputs
    # and can regenerate them, albeit with slower one-time glyf reconstruction.
    if face.get("subsetSourcePath") or face.get("subsetSourceArchive"):
        print(
            f"subset source unavailable for {face['sourcePath']}; using audited delivered WOFF2",
            file=sys.stderr,
        )

    relative = face["sourcePath"]
    source_path = project_path(relative)
    data = source_path.read_bytes()
    source = TTFont(io.BytesIO(data), recalcTimestamp=False, recalcBBoxes=False)
    return source, {
        "method": "delivered-original-woff2",
        "path": relative,
        "bytes": len(data),
        "sha256": sha256_bytes(data),
    }


def verify_subset_input_matches_delivery(
    source_font: Any,
    delivered_font: Any,
    source_path: str,
) -> None:
    source_cmap = get_unicode_cmap(source_font)
    delivered_cmap = get_unicode_cmap(delivered_font)
    if set(source_cmap) != set(delivered_cmap):
        fail(f"Subset input and shipped WOFF2 cmap differ: {source_path}")
    if metric_digest(source_font, source_cmap) != metric_digest(delivered_font, delivered_cmap):
        fail(f"Subset input and shipped WOFF2 metrics differ: {source_path}")
    if source_font["head"].unitsPerEm != delivered_font["head"].unitsPerEm:
        fail(f"Subset input and shipped WOFF2 unitsPerEm differ: {source_path}")
    if get_axes(source_font) != get_axes(delivered_font):
        fail(f"Subset input and shipped WOFF2 variation axes differ: {source_path}")


def preload_source_tables(font: Any) -> None:
    # WOFF2 reconstructs transformed glyf in Python. Loading all tables once
    # avoids a full WOFF2 reconstruction on every deep-copied Unicode shard.
    for table_tag in list(font.keys()):
        font[table_tag]


def verify_license(group: dict[str, Any]) -> None:
    license_path = project_path(group["licenseFile"])
    license_text = license_path.read_text(encoding="utf-8")
    if group["license"] == "SIL Open Font License 1.1":
        if not re.search(r"SIL\s+OPEN\s+FONT\s+LICENSE", license_text, re.IGNORECASE):
            fail(f"{group['fontId']} is tagged OFL but its license file is not OFL: {license_path}")
        if "Modified Version" not in license_text:
            fail(f"{group['fontId']} OFL notice does not retain modification terms: {license_path}")
        for reserved in group["reservedFontNames"]:
            if reserved.casefold() not in license_text.casefold():
                fail(f"{group['fontId']} reserved-name declaration is absent from {license_path}")
    elif group["license"] == "KOGL Type 1":
        if "KOGL Type 1" not in license_text or "derivative use" not in license_text:
            fail(f"{group['fontId']} KOGL derivative/attribution review is missing: {license_path}")
        if not group.get("sourceAttribution"):
            fail(f"{group['fontId']} requires source attribution in the preview manifest")
    else:
        fail(f"Unreviewed preview subset license: {group['license']}")

    public_license = group.get("publicLicenseFile")
    if public_license:
        if project_path(public_license).read_bytes() != license_path.read_bytes():
            fail(f"Public license copy is stale: {public_license}")
    for notice in group.get("supplementalNotices", []):
        if not project_path(notice).is_file():
            fail(f"Supplemental font notice is missing: {notice}")

    alias = group["previewFamily"]
    for reserved in group["reservedFontNames"]:
        if reserved.casefold() in alias.casefold():
            fail(f"Preview family {alias!r} uses reserved name {reserved!r}")


def get_unicode_cmap(font: Any) -> dict[int, str]:
    best = font.getBestCmap()
    if not best:
        fail("Font has no Unicode cmap")
    return best


def get_axes(font: Any) -> list[dict[str, int | str]]:
    if "fvar" not in font:
        return []
    return [
        {
            "tag": axis.axisTag,
            "minimum": float(axis.minValue),
            "default": float(axis.defaultValue),
            "maximum": float(axis.maxValue),
        }
        for axis in font["fvar"].axes
    ]


def get_name_values(font: Any, name_id: int) -> list[str]:
    if "name" not in font:
        return []
    values: set[str] = set()
    for record in font["name"].names:
        if record.nameID != name_id:
            continue
        try:
            values.add(record.toUnicode())
        except Exception:
            continue
    return sorted(values)


def get_subfamily(font: Any) -> str:
    values = get_name_values(font, 2)
    return values[0] if values else "Regular"


def set_name_value(font: Any, name_id: int, value: str, add_if_missing: bool = False) -> None:
    table = font["name"]
    records = [record for record in table.names if record.nameID == name_id]
    for record in records:
        table.setName(value, name_id, record.platformID, record.platEncID, record.langID)
    if not records and add_if_missing:
        table.setName(value, name_id, 3, 1, 0x409)


def rename_preview_font(font: Any, alias: str, unique_id: str) -> None:
    subfamily = get_subfamily(font)
    postscript_family = re.sub(r"[^A-Za-z0-9]", "", alias)
    postscript_style = re.sub(r"[^A-Za-z0-9]", "", subfamily) or "Regular"
    full_name = f"{alias} {subfamily}"

    # ID 17 is WWS subfamily, not a family name. Retain its regular/bold/etc.
    # value; CSS weight descriptors continue to carry the actual face weight.
    updates = {
        1: alias,
        3: unique_id,
        4: full_name,
        6: f"{postscript_family}-{postscript_style}",
        16: alias,
        17: subfamily,
        18: full_name,
        21: alias,
        25: postscript_family,
    }
    for name_id, value in updates.items():
        set_name_value(font, name_id, value, add_if_missing=name_id in (1, 3, 4, 6))


def names_digest(font: Any, name_ids: tuple[int, ...]) -> dict[str, list[str]]:
    return {str(name_id): get_name_values(font, name_id) for name_id in name_ids}


def assert_alias_names(font: Any, alias: str, reserved_names: list[str]) -> None:
    expected = {
        1: alias,
        16: alias,
        21: alias,
    }
    for name_id, expected_value in expected.items():
        values = get_name_values(font, name_id)
        if values and any(value != expected_value for value in values):
            fail(f"Preview nameID {name_id} is not the internal alias {alias!r}: {values}")

    for name_id in FAMILY_NAME_IDS:
        for value in get_name_values(font, name_id):
            for reserved in reserved_names:
                if reserved.casefold() in value.casefold():
                    fail(f"Preview family metadata nameID {name_id} contains reserved name {reserved!r}")


def metric_digest(font: Any, cmap: dict[int, str]) -> str:
    hmtx = font["hmtx"].metrics
    digest = hashlib.sha256()
    for codepoint, glyph_name in sorted(cmap.items()):
        if glyph_name not in hmtx:
            fail(f"Mapped glyph has no horizontal metrics: U+{codepoint:04X} {glyph_name}")
        advance, side_bearing = hmtx[glyph_name]
        digest.update(codepoint.to_bytes(4, "big"))
        digest.update(int(advance).to_bytes(4, "big", signed=False))
        digest.update(int(side_bearing).to_bytes(4, "big", signed=True))
    return digest.hexdigest()


def unicode_range_for(codepoints: list[int]) -> str:
    if not codepoints:
        fail("Cannot create a unicode-range for an empty shard")
    ranges: list[str] = []
    start = previous = codepoints[0]
    for codepoint in codepoints[1:]:
        if codepoint == previous + 1:
            previous = codepoint
            continue
        ranges.append(f"U+{start:04X}" if start == previous else f"U+{start:04X}-{previous:04X}")
        start = previous = codepoint
    ranges.append(f"U+{start:04X}" if start == previous else f"U+{start:04X}-{previous:04X}")
    return ", ".join(ranges)


def format_weight(value: int | float | None) -> str:
    if value is None:
        return "variable"
    if float(value).is_integer():
        return f"{int(value)}"
    return str(value).replace(".", "_")


def css_weight_for(font: Any, face: dict[str, Any]) -> str:
    if face.get("cssWeight") is not None:
        return str(face["cssWeight"])
    axes = get_axes(font)
    weight = next((axis for axis in axes if axis["tag"] == "wght"), None)
    if weight:
        return f"{weight['minimum']:g} {weight['maximum']:g}"
    return str(font["OS/2"].usWeightClass)


def source_style(font: Any) -> str:
    if "post" in font and getattr(font["post"], "italicAngle", 0):
        return "italic"
    return "normal"


def subset_font_bytes(source_font: Any, codepoints: list[int], alias: str, unique_id: str) -> bytes:
    from fontTools.subset import Options, Subsetter

    font = copy.deepcopy(source_font)
    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.layout_closure = True
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.glyph_names = True
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    options.recalc_timestamp = False
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    rename_preview_font(font, alias, unique_id)
    font.flavor = "woff2"
    font.recalcTimestamp = False
    stream = io.BytesIO()
    font.save(stream)
    result = stream.getvalue()
    if not result.startswith(b"wOF2"):
        fail(f"FontTools did not produce a WOFF2 subset for {unique_id}")
    return result


def verify_font_metrics(source_font: Any, preview_font: Any, expected_codepoints: set[int]) -> tuple[str, str]:
    source_cmap = get_unicode_cmap(source_font)
    preview_cmap = get_unicode_cmap(preview_font)
    source_expected = {cp: source_cmap[cp] for cp in expected_codepoints if cp in source_cmap}
    preview_expected = {cp: preview_cmap[cp] for cp in expected_codepoints if cp in preview_cmap}
    if set(preview_expected) != set(source_expected):
        missing = sorted(set(source_expected) - set(preview_expected))
        unexpected = sorted(set(preview_expected) - set(source_expected))
        fail(f"Preview cmap mismatch; missing={missing[:5]} unexpected={unexpected[:5]}")
    source_digest = metric_digest(source_font, source_expected)
    preview_digest = metric_digest(preview_font, preview_expected)
    if source_digest != preview_digest:
        fail("Preview horizontal metrics differ from the source cmap glyph metrics")
    if source_font["head"].unitsPerEm != preview_font["head"].unitsPerEm:
        fail("Preview unitsPerEm differs from the source font")
    if get_axes(source_font) != get_axes(preview_font):
        fail("Preview variable axes differ from the source font")
    return sha256_bytes(json.dumps(sorted(source_expected), separators=(",", ":")).encode("ascii")), source_digest


def verify_metadata_preserved(source_font: Any, preview_font: Any) -> dict[str, list[str]]:
    source = names_digest(source_font, METADATA_NAME_IDS)
    preview = names_digest(preview_font, METADATA_NAME_IDS)
    for name_id, source_values in source.items():
        preview_values = preview.get(name_id, [])
        if source_values and not set(source_values).issubset(set(preview_values)):
            fail(f"Preview dropped source notice/nameID {name_id}: {source_values}")
    return source


def load_source_configuration(audit_assets: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    configured_paths: set[str] = set()
    result: list[dict[str, Any]] = []
    for group in SOURCE_FAMILIES:
        verify_license(group)
        faces = []
        for face in group["faces"]:
            relative_path = face["path"]
            if relative_path in configured_paths:
                fail(f"Source font was configured twice: {relative_path}")
            configured_paths.add(relative_path)
            audit = audit_assets.get(relative_path)
            source_path = project_path(relative_path)
            if not source_path.is_file():
                fail(f"Source font is missing: {relative_path}")
            actual_hash = sha256_path(source_path)
            actual_bytes = source_path.stat().st_size
            if face.get("expectedBytes") is not None and actual_bytes != face["expectedBytes"]:
                fail(f"Source font byte count differs from the reviewed registry: {relative_path}")
            if audit and (actual_hash != audit["sha256"] or actual_bytes != audit["bytes"]):
                fail(f"Source font changed after the provenance audit: {relative_path}")
            faces.append({
                **face,
                "sourcePath": relative_path,
                "sourceBytes": actual_bytes,
                "sourceSha256": actual_hash,
                "auditRecordPresent": audit is not None,
                "auditOriginalUnmodified": audit.get("originalUnmodified") if audit else None,
            })
        result.append({**group, "faces": faces})
    return result


def source_face_output_path(group: dict[str, Any], face: dict[str, Any], block_start: int) -> str:
    base_name = Path(face["sourcePath"]).stem
    weight_label = format_weight(face.get("cssWeight"))
    return (
        f"public/fonts/previews/{group['fontId']}/"
        f"{base_name}-w{weight_label}-u{block_start:06x}.woff2"
    )


def build_source_face_records(
    task: tuple[dict[str, Any], dict[str, Any], int, Path, bool],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    group, face, block_size, output_root, write_assets = task
    TTFont, _, _, _, _ = require_font_tools()
    source_path = project_path(face["sourcePath"])
    source_font, subset_input = read_subset_input(face, TTFont)
    try:
        delivered_font = TTFont(str(source_path), recalcTimestamp=False, recalcBBoxes=False)
        try:
            if subset_input["method"] != "delivered-original-woff2":
                verify_subset_input_matches_delivery(source_font, delivered_font, face["sourcePath"])
        finally:
            delivered_font.close()

        # Each process opens and preloads one source face once, then clones
        # its decoded tables per shard. This avoids repeating WOFF2 decoding
        # while keeping work for separate source faces parallel.
        preload_source_tables(source_font)
        source_cmap = get_unicode_cmap(source_font)
        source_codepoints = sorted(source_cmap)
        blocks: dict[int, list[int]] = {}
        for codepoint in source_codepoints:
            block_start = codepoint // block_size * block_size
            blocks.setdefault(block_start, []).append(codepoint)

        axes = get_axes(source_font)
        css_weight = css_weight_for(source_font, face)
        source_metrics = metric_digest(source_font, source_cmap)
        source_notice_names = names_digest(source_font, METADATA_NAME_IDS)
        source_face_record = {
            "fontId": group["fontId"],
            "sourceFamily": group["family"],
            "previewFamily": group["previewFamily"],
            "sourcePath": face["sourcePath"],
            "sourceBytes": face["sourceBytes"],
            "sourceSha256": face["sourceSha256"],
            "license": group["license"],
            "licenseFile": group["licenseFile"],
            "publicLicenseFile": group.get("publicLicenseFile"),
            "supplementalNotices": group.get("supplementalNotices", []),
            "sourceUrl": group["sourceUrl"],
            "sourceAttribution": group.get("sourceAttribution"),
            "reservedFontNames": group["reservedFontNames"],
            "cssWeight": css_weight,
            "style": source_style(source_font),
            "sourceCmapCodepointCount": len(source_codepoints),
            "sourceCmapSha256": sha256_bytes(
                json.dumps(source_codepoints, separators=(",", ":")).encode("ascii")
            ),
            "sourceMetricsSha256": source_metrics,
            "unitsPerEm": source_font["head"].unitsPerEm,
            "variableAxes": axes,
            "sourceMetadataNames": source_notice_names,
            "auditOriginalUnmodified": face.get("auditOriginalUnmodified"),
            "subsetInput": subset_input,
            "outputs": [],
        }

        output_records: list[dict[str, Any]] = []
        for block_start, codepoints in sorted(blocks.items()):
            block_end = min(block_start + block_size - 1, 0x10FFFF)
            codepoint_set = set(codepoints)
            output_relative_path = source_face_output_path(group, face, block_start)
            output = output_path_for(output_root, output_relative_path)
            preview_number = group["previewFamily"].rsplit(" ", 1)[-1]
            unique_id = (
                f"XIV-PREVIEW-{preview_number}-"
                f"W{format_weight(face.get('cssWeight'))}-U{block_start:06X}"
            )

            # Preserve valid shards from an interrupted generation. Reopen
            # each one and prove its glyph coverage, metrics, notices and
            # internal alias before accepting it into the new manifest.
            if write_assets and output.is_file():
                subset_bytes = output.read_bytes()
                if not subset_bytes.startswith(b"wOF2"):
                    fail(f"Existing preview shard is not WOFF2: {output_relative_path}")
            else:
                subset_bytes = subset_font_bytes(
                    source_font,
                    codepoints,
                    group["previewFamily"],
                    unique_id,
                )
                if write_assets:
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(subset_bytes)

            preview_font = TTFont(io.BytesIO(subset_bytes), recalcTimestamp=False, recalcBBoxes=False)
            try:
                cmap_digest, metrics_digest = verify_font_metrics(source_font, preview_font, codepoint_set)
                verify_metadata_preserved(source_font, preview_font)
                assert_alias_names(preview_font, group["previewFamily"], group["reservedFontNames"])
            finally:
                preview_font.close()

            output_record = {
                "fontId": group["fontId"],
                "sourcePath": face["sourcePath"],
                "previewFamily": group["previewFamily"],
                "cssWeight": css_weight,
                "style": source_style(source_font),
                "path": output_relative_path,
                "sourceBlock": [block_start, block_end],
                "unicodeRange": unicode_range_for(codepoints),
                "codepointCount": len(codepoints),
                "cmapSha256": cmap_digest,
                "metricsSha256": metrics_digest,
                "bytes": len(subset_bytes),
                "sha256": sha256_bytes(subset_bytes),
            }
            source_face_record["outputs"].append(output_relative_path)
            output_records.append(output_record)

        return source_face_record, output_records
    finally:
        source_font.close()


def build_records(
    block_size: int,
    output_root: Path,
    write_assets: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    TTFont, _, _, fonttools_version, brotli_version = require_font_tools()
    audit_assets = read_audit_assets()
    groups = load_source_configuration(audit_assets)

    tasks = [
        (group, face, block_size, output_root, write_assets)
        for group in groups
        for face in group["faces"]
    ]
    # Only two source faces are processed at once to shorten offline WOFF2
    # generation without overwhelming the editor and browser QA running here.
    with ProcessPoolExecutor(max_workers=2) as executor:
        completed = list(executor.map(build_source_face_records, tasks))

    group_records = [face_record for face_record, _ in completed]
    output_records = [record for _, face_records in completed for record in face_records]

    summary = {
        "sourceFaceCount": len(group_records),
        "sourceBytes": sum(face["sourceBytes"] for group in groups for face in group["faces"]),
        "previewAssetCount": len(output_records),
        "previewBytes": sum(asset["bytes"] for asset in output_records),
        "fontToolsVersion": fonttools_version,
        "brotliVersion": brotli_version,
    }
    return group_records, output_records, summary


def excluded_asset_records(audit_assets: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for item in EXCLUDED_FONTS:
        audit = audit_assets.get(item["sourcePath"])
        path = project_path(item["sourcePath"])
        result.append({
            **item,
            "bytes": audit["bytes"] if audit else path.stat().st_size,
            "sha256": audit["sha256"] if audit else sha256_path(path),
        })
    return result


def latin_popup_estimate(
    output_records: list[dict[str, Any]],
    audit_assets: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    requested: list[dict[str, Any]] = []
    preview_by_source: dict[str, list[dict[str, Any]]] = {}
    for asset in output_records:
        preview_by_source.setdefault(asset["sourcePath"], []).append(asset)

    total_bytes = 0
    for font_id, source_path in LATIN_POPUP_REQUESTS:
        if font_id == "ownglyph-park-dahyeon":
            audit = audit_assets[source_path]
            item = {
                "fontId": font_id,
                "sourcePath": source_path,
                "mode": "original-full-font (no modification permitted)",
                "bytes": audit["bytes"],
            }
        else:
            containing = [
                asset for asset in preview_by_source.get(source_path, [])
                if any(cp in range(asset["sourceBlock"][0], asset["sourceBlock"][1] + 1)
                       for cp in LATIN_POPUP_CODEPOINTS)
            ]
            if not containing:
                fail(f"No preview shard covers the Latin popup sample for {source_path}")
            item = {
                "fontId": font_id,
                "sourcePath": source_path,
                "mode": "preview-only Unicode-range shard(s)",
                "paths": [asset["path"] for asset in containing],
                "bytes": sum(asset["bytes"] for asset in containing),
            }
        total_bytes += item["bytes"]
        requested.append(item)

    return {
        "scenario": "measured-name-popup-ascii-glyph-set",
        "glyphCodepoints": [f"U+{codepoint:04X}" for codepoint in LATIN_POPUP_CODEPOINTS],
        "requests": requested,
        "estimatedFontAssetBytes": total_bytes,
        "measurementNote": (
            "Static WOFF2 asset bytes selected by Unicode-range matching, not a network trace. "
            "The unmodified protected Park Dahyeon source is counted at its full file size."
        ),
    }


def create_manifest(
    block_size: int,
    group_records: list[dict[str, Any]],
    output_records: list[dict[str, Any]],
    summary: dict[str, Any],
    audit_assets: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    excluded = excluded_asset_records(audit_assets)
    summary["excludedProtectedAssetCount"] = len(excluded)
    summary["excludedProtectedBytes"] = sum(item["bytes"] for item in excluded)
    return {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "generation": {
            "tool": "tools/generate-font-previews.py",
            "fontToolsVersion": summary["fontToolsVersion"],
            "brotliVersion": summary["brotliVersion"],
            "unicodeBlockSize": block_size,
            "unicodeRangePolicy": (
                "Each shard contains exactly the source cmap codepoints in one fixed scalar-value block. "
                "The @font-face unicode-range is compressed from those exact codepoints."
            ),
            "familyAliasPolicy": (
                "Preview fonts use distinct XIV Preview NNN internal family names. "
                "Source family labels remain catalog metadata only."
            ),
            "originalAssetsPolicy": (
                "Every source WOFF2 remains unchanged and remains the only face used after a font is applied."
            ),
        },
        "summary": summary,
        "families": group_records,
        "assets": output_records,
        "excludedProtectedAssets": excluded,
        "coldSampleEstimate": latin_popup_estimate(output_records, audit_assets),
    }


def verify_manifest(
    manifest: dict[str, Any],
    output_root: Path,
    audit_assets: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    if manifest.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        fail("Unsupported preview manifest schema")
    generation = manifest.get("generation", {})
    block_size = generation.get("unicodeBlockSize")
    if not isinstance(block_size, int) or block_size < 128 or block_size > 4096:
        fail("Manifest unicode block size is invalid")

    TTFont, _, _, fonttools_version, brotli_version = require_font_tools()
    if generation.get("fontToolsVersion") != fonttools_version:
        fail("Manifest fontTools version does not match the checked runtime")
    if generation.get("brotliVersion") != brotli_version:
        fail("Manifest Brotli version does not match the checked runtime")

    groups_by_source: dict[str, dict[str, Any]] = {}
    current_groups = load_source_configuration(audit_assets)
    for group in current_groups:
        for face in group["faces"]:
            groups_by_source[face["sourcePath"]] = {**group, "face": face}

    manifest_sources = {
        face["sourcePath"]: face
        for face in manifest.get("families", [])
    }
    if set(manifest_sources) != set(groups_by_source):
        fail("Manifest source face set differs from the reviewed local font inventory")

    actual_output_paths: set[str] = set()
    expected_total_bytes = 0
    output_root = output_root.resolve()
    records_by_source: dict[str, list[dict[str, Any]]] = {}
    for record in manifest.get("assets", []):
        source_path = record["sourcePath"]
        group_face = groups_by_source.get(source_path)
        if not group_face:
            fail(f"Manifest output references an unapproved source: {source_path}")
        group = group_face
        face = group["face"]
        if record["fontId"] != group["fontId"] or record["previewFamily"] != group["previewFamily"]:
            fail(f"Manifest preview identity changed for {source_path}")
        if record["sourcePath"] != face["sourcePath"]:
            fail(f"Manifest source path changed for {source_path}")
        if record["path"] in actual_output_paths:
            fail(f"Duplicate preview output path: {record['path']}")
        actual_output_paths.add(record["path"])
        records_by_source.setdefault(source_path, []).append(record)

    # Decode and preload each source face only once, then validate all of its
    # shards. This keeps --check useful for WOFF2 sources with large glyf maps.
    for source_path, group_face in groups_by_source.items():
        group = group_face
        face = group["face"]
        manifest_face = manifest_sources[source_path]
        if (
            manifest_face.get("fontId") != group["fontId"]
            or manifest_face.get("sourceSha256") != face["sourceSha256"]
            or manifest_face.get("sourceBytes") != face["sourceBytes"]
            or manifest_face.get("license") != group["license"]
            or manifest_face.get("licenseFile") != group["licenseFile"]
            or manifest_face.get("previewFamily") != group["previewFamily"]
            or manifest_face.get("sourceUrl") != group["sourceUrl"]
        ):
            fail(f"Manifest source hash/license/alias changed for {source_path}")

        records = records_by_source.get(source_path, [])
        expected_paths = manifest_face.get("outputs")
        record_paths = [record["path"] for record in records]
        if not records or sorted(record_paths) != sorted(expected_paths or []):
            fail(f"Manifest output list is incomplete for {source_path}")

        source_font, subset_input = read_subset_input(face, TTFont)
        try:
            delivered_font = TTFont(str(project_path(source_path)), recalcTimestamp=False, recalcBBoxes=False)
            try:
                if subset_input["method"] != "delivered-original-woff2":
                    verify_subset_input_matches_delivery(source_font, delivered_font, source_path)
            finally:
                delivered_font.close()
            preload_source_tables(source_font)
            source_cmap = get_unicode_cmap(source_font)
            source_codepoints = sorted(source_cmap)
            source_cmap_digest = sha256_bytes(json.dumps(source_codepoints, separators=(",", ":")).encode("ascii"))
            source_metrics_digest = metric_digest(source_font, source_cmap)
            if (
                len(source_codepoints) != manifest_face.get("sourceCmapCodepointCount")
                or source_cmap_digest != manifest_face.get("sourceCmapSha256")
                or source_metrics_digest != manifest_face.get("sourceMetricsSha256")
                or get_axes(source_font) != manifest_face.get("variableAxes")
                or source_font["head"].unitsPerEm != manifest_face.get("unitsPerEm")
                or names_digest(source_font, METADATA_NAME_IDS) != manifest_face.get("sourceMetadataNames")
            ):
                fail(f"Manifest source cmap/metrics/metadata changed for {source_path}")

            for record in sorted(records, key=lambda item: item["sourceBlock"][0]):
                start, end = record["sourceBlock"]
                if start % block_size != 0 or end != min(start + block_size - 1, 0x10FFFF):
                    fail(f"Manifest source block is invalid: {record['path']}")
                if record["path"] != source_face_output_path(group, face, start):
                    fail(f"Manifest output path is inconsistent with its source: {record['path']}")
                output = output_path_for(output_root, record["path"])
                if not output.is_file():
                    fail(f"Generated preview asset is missing: {record['path']}")
                data = output.read_bytes()
                if len(data) != record["bytes"] or sha256_bytes(data) != record["sha256"]:
                    fail(f"Generated preview asset hash/size mismatch: {record['path']}")
                if not data.startswith(b"wOF2"):
                    fail(f"Generated preview asset is not WOFF2: {record['path']}")

                expected_cps = {cp for cp in source_cmap if start <= cp <= end}
                if not expected_cps or record.get("codepointCount") != len(expected_cps):
                    fail(f"Manifest Unicode shard coverage count changed: {record['path']}")
                if unicode_range_for(sorted(expected_cps)) != record["unicodeRange"]:
                    fail(f"Preview Unicode range no longer describes its exact source cmap: {record['path']}")

                preview_font = TTFont(io.BytesIO(data), recalcTimestamp=False, recalcBBoxes=False)
                try:
                    cmap_digest, metrics_digest = verify_font_metrics(source_font, preview_font, expected_cps)
                    if cmap_digest != record["cmapSha256"] or metrics_digest != record["metricsSha256"]:
                        fail(f"Preview coverage/metric proof changed: {record['path']}")
                    if get_axes(source_font) != get_axes(preview_font):
                        fail(f"Preview axes no longer match the source: {record['path']}")
                    assert_alias_names(preview_font, group["previewFamily"], group["reservedFontNames"])
                    verify_metadata_preserved(source_font, preview_font)
                finally:
                    preview_font.close()
                expected_total_bytes += len(data)
        finally:
            source_font.close()

    disk_files = {
        str(path.relative_to(output_root)).replace("\\", "/")
        for path in output_root.rglob("*.woff2")
    } if output_root.exists() else set()
    manifest_files = {
        str(Path(path).relative_to("public/fonts/previews")).replace("\\", "/")
        for path in actual_output_paths
    }
    if disk_files != manifest_files:
        fail(
            "Preview output directory contains missing or unmanifested WOFF2 files: "
            f"missing={sorted(manifest_files - disk_files)[:5]} "
            f"unmanifested={sorted(disk_files - manifest_files)[:5]}"
        )

    expected_summary = manifest.get("summary", {})
    if expected_summary.get("previewAssetCount") != len(actual_output_paths):
        fail("Manifest preview asset count is stale")
    if expected_summary.get("previewBytes") != expected_total_bytes:
        fail("Manifest preview byte total is stale")
    if manifest.get("excludedProtectedAssets") != excluded_asset_records(audit_assets):
        fail("Manifest protected-font exclusions differ from the reviewed license inventory")
    if manifest.get("coldSampleEstimate") != latin_popup_estimate(manifest["assets"], audit_assets):
        fail("Manifest cold sample byte estimate is stale")

    return {
        "checkedAssetCount": len(actual_output_paths),
        "checkedPreviewBytes": expected_total_bytes,
        "sourceFaceCount": len(manifest_sources),
    }


def print_summary(manifest: dict[str, Any]) -> None:
    summary = manifest["summary"]
    cold = manifest["coldSampleEstimate"]
    print(json.dumps({
        "mode": "generated",
        "blockSize": manifest["generation"]["unicodeBlockSize"],
        "sourceFaceCount": summary["sourceFaceCount"],
        "sourceBytes": summary["sourceBytes"],
        "previewAssetCount": summary["previewAssetCount"],
        "previewBytes": summary["previewBytes"],
        "excludedProtectedBytes": summary["excludedProtectedBytes"],
        "asciiPopupEstimatedFontBytes": cold["estimatedFontAssetBytes"],
        "fontToolsVersion": summary["fontToolsVersion"],
        "brotliVersion": summary["brotliVersion"],
    }, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--generate", action="store_true", help="write preview assets and their manifest")
    mode.add_argument("--check", action="store_true", help="validate checked-in preview assets and manifest")
    mode.add_argument("--measure-only", action="store_true", help="subset in memory and print size/count totals without writing files")
    parser.add_argument("--block-size", type=int, default=DEFAULT_BLOCK_SIZE)
    parser.add_argument("--output-root", type=Path, default=OUTPUT_ROOT)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args()
    if args.block_size < 128 or args.block_size > 4096 or args.block_size & (args.block_size - 1):
        fail("--block-size must be a power of two from 128 through 4096")

    audit_assets = read_audit_assets()
    if args.check:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        summary = verify_manifest(manifest, args.output_root, audit_assets)
        print(json.dumps({"mode": "checked", **summary}, indent=2))
        return

    group_records, output_records, summary = build_records(
        args.block_size,
        args.output_root,
        write_assets=not args.measure_only,
    )
    manifest = create_manifest(args.block_size, group_records, output_records, summary, audit_assets)
    if not args.measure_only:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    print_summary(manifest)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"font-preview generator: {error}", file=sys.stderr)
        raise
