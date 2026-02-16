#!/usr/bin/env python3
"""
Validate per-language coverage and translation anomalies
for surveys in a GCS environment (dev/prod) or locally.

Checks:
- Missing language keys per localized object
- Empty strings for any language
- Strings identical to default (possible untranslated)
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Tuple


ENV_BUCKETS = {
    "dev": "levante-assets-dev",
    "prod": "levante-assets-prod",
}

DEFAULT_SURVEYS = [
    "parent_survey_child",
    "parent_survey_family",
]

# Ignore same-as-default matches for specific language/value pairs.
# Example: Spanish "No" is identical to default "No".
IGNORE_SAME_AS_DEFAULT = {
    "es-CO": {"No"},
}


def load_from_gcs(bucket: str, name: str) -> Dict[str, Any]:
    url = f"gs://{bucket}/surveys/{name}.json"
    try:
        data = subprocess.check_output(["gsutil", "cat", url])
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Failed to read {url}") from exc
    return json.loads(data)


def load_from_local(root: Path, name: str) -> Dict[str, Any]:
    path = root / f"{name}.json"
    if not path.exists():
        raise RuntimeError(f"Missing local file: {path}")
    return json.loads(path.read_text())


def list_gcs_surveys(bucket: str) -> List[str]:
    try:
        output = subprocess.check_output(
            ["gsutil", "ls", f"gs://{bucket}/surveys/*.json"]
        ).decode("utf-8")
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Failed to list surveys in gs://{bucket}/surveys") from exc

    names = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        name = line.rsplit("/", 1)[-1].removesuffix(".json")
        names.append(name)
    return sorted(names)


def collect_localized(obj: Any, path: str = "") -> List[Tuple[str, Dict[str, Any]]]:
    localized: List[Tuple[str, Dict[str, Any]]] = []
    if isinstance(obj, dict):
        if "default" in obj:
            localized.append((path, obj))
        for key, value in obj.items():
            new_path = f"{path}.{key}" if path else key
            localized.extend(collect_localized(value, new_path))
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            new_path = f"{path}[{idx}]"
            localized.extend(collect_localized(item, new_path))
    return localized


def analyze_survey(data: Dict[str, Any]) -> Dict[str, Any]:
    localized = collect_localized(data)

    # Build union of language keys
    language_keys = set()
    for _, obj in localized:
        for key in obj.keys():
            if key != "default":
                language_keys.add(key)

    missing_by_lang: Dict[str, List[str]] = {k: [] for k in language_keys}
    empty_by_lang: Dict[str, List[str]] = {k: [] for k in language_keys}
    same_as_default_by_lang: Dict[str, List[str]] = {k: [] for k in language_keys}

    for path, obj in localized:
        default_val = obj.get("default")
        for lang in language_keys:
            if lang not in obj:
                missing_by_lang[lang].append(path)
                continue
            val = obj.get(lang)
            if isinstance(val, str):
                if val.strip() == "":
                    empty_by_lang[lang].append(path)
                if default_val is not None and val == default_val and lang not in ("default", "en", "en-US"):
                    ignored_values = IGNORE_SAME_AS_DEFAULT.get(lang, set())
                    if default_val not in ignored_values:
                        same_as_default_by_lang[lang].append(path)

    return {
        "localized_count": len(localized),
        "language_keys": sorted(language_keys),
        "missing_by_lang": missing_by_lang,
        "empty_by_lang": empty_by_lang,
        "same_as_default_by_lang": same_as_default_by_lang,
    }


def print_report(name: str, report: Dict[str, Any], max_examples: int) -> None:
    print(f"=== {name} ===")
    print(f"localized objects: {report['localized_count']}")
    print(f"language keys: {', '.join(report['language_keys']) if report['language_keys'] else '(none)'}")

    def summarize(title: str, mapping: Dict[str, List[str]]) -> None:
        print(f"{title}:")
        for lang in report["language_keys"]:
            items = mapping.get(lang, [])
            print(f"  {lang}: {len(items)}")
            for path in items[:max_examples]:
                print(f"    - {path}")

    summarize("missing entries", report["missing_by_lang"])
    summarize("empty strings", report["empty_by_lang"])
    summarize("same as default (possible untranslated)", report["same_as_default_by_lang"])
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate surveys per-language coverage.")
    parser.add_argument(
        "--env",
        choices=ENV_BUCKETS.keys(),
        default="dev",
        help="Target environment (default: dev).",
    )
    parser.add_argument(
        "--source",
        choices=["gcs", "local"],
        default="gcs",
        help="Read surveys from GCS or local files (default: gcs).",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Validate all surveys in the source location.",
    )
    parser.add_argument(
        "--bucket",
        default=None,
        help="GCS bucket for surveys when --source gcs (default: env bucket).",
    )
    parser.add_argument(
        "--local-root",
        default="surveys",
        help="Local surveys directory when --source local (default: surveys).",
    )
    parser.add_argument(
        "--max-examples",
        type=int,
        default=5,
        help="Max example paths to show per language (default: 5).",
    )
    args = parser.parse_args()

    bucket = args.bucket or ENV_BUCKETS[args.env]
    if args.all:
        if args.source == "gcs":
            survey_names = list_gcs_surveys(bucket)
        else:
            root = Path(args.local_root)
            survey_names = sorted(p.stem for p in root.glob("*.json"))
    else:
        survey_names = DEFAULT_SURVEYS

    for name in survey_names:
        if args.source == "gcs":
            data = load_from_gcs(bucket, name)
        else:
            data = load_from_local(Path(args.local_root), name)
        report = analyze_survey(data)
        print_report(name, report, args.max_examples)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
