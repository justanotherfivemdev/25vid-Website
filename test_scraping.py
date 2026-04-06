import httpx
import re
import json
import sys

WORKSHOP_BASE = "https://reforger.armaplatform.com"
WORKSHOP_URL = f"{WORKSHOP_BASE}/workshop"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

def extract_next_data(html):
    match = re.search(
        r'<script[^>]*\bid=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if match:
        try:
            return json.loads(match.group(1))
        except (json.JSONDecodeError, TypeError) as e:
            print(f"FAILED to parse __NEXT_DATA__ JSON: {e}")
    return None

def thumbnail_from_asset(asset):
    previews = asset.get("previews") or asset.get("images") or []
    if isinstance(previews, list):
        for preview in previews:
            if not isinstance(preview, dict):
                continue
            thumbs = preview.get("thumbnails", {})
            if isinstance(thumbs, dict):
                for _mime, variants in thumbs.items():
                    if isinstance(variants, list):
                        for v in variants:
                            url = v.get("url", "") if isinstance(v, dict) else ""
                            if url:
                                return url
            url = preview.get("url", "")
            if url:
                return url
    return ""

def parse_mod_details_from_json(data):
    page_props = data.get("props", {}).get("pageProps", {})
    asset = page_props.get("asset")
    if not asset or not isinstance(asset, dict):
        print("ERROR: No asset in pageProps")
        return None

    mod_id = asset.get("id", "")
    if not mod_id:
        print("ERROR: No mod_id in asset")
        return None

    # Author
    author_raw = asset.get("author") or asset.get("creator") or {}
    if isinstance(author_raw, dict):
        author = author_raw.get("username", "") or author_raw.get("name", "")
    else:
        author = str(author_raw)

    # Tags
    tags = []
    for t in (asset.get("tags") or []):
        tag_name = t.get("name", "") if isinstance(t, dict) else str(t)
        if tag_name:
            tags.append(tag_name)

    # Dependencies
    dependencies = []
    for dep in (asset.get("dependencies") or []):
        if not isinstance(dep, dict):
            continue
        dep_asset = dep.get("asset") or {}
        dependencies.append({
            "mod_id": dep_asset.get("id", ""),
            "name": dep_asset.get("name", ""),
            "version": dep.get("version", ""),
        })

    # Scenarios
    scenarios = []
    for sc in (asset.get("scenarios") or []):
        if not isinstance(sc, dict):
            continue
        scenarios.append({
            "scenario_id": sc.get("gameId", ""),
            "name": sc.get("name", ""),
            "game_mode": sc.get("gameMode", ""),
            "player_count": sc.get("playerCount", 0),
        })

    scenario_ids = [s["scenario_id"] for s in scenarios if s.get("scenario_id")]

    # Versions
    versions = []
    for v in (asset.get("versions") or []):
        if not isinstance(v, dict):
            continue
        versions.append({
            "version": v.get("version", ""),
            "game_version": v.get("gameVersion", ""),
            "file_size": v.get("totalFileSize", 0),
            "created_at": v.get("createdAt", ""),
        })

    # Changelog
    version_detail = page_props.get("assetVersionDetail") or {}
    changelog = version_detail.get("changelog", "")

    # Downloads
    download_info = page_props.get("getAssetDownloadTotal") or {}
    downloads = download_info.get("total", 0)

    thumbnail_url = thumbnail_from_asset(asset)

    return {
        "mod_id": mod_id,
        "name": asset.get("name", ""),
        "author": author,
        "summary": asset.get("summary", ""),
        "version": asset.get("currentVersionNumber", ""),
        "game_version": asset.get("gameVersion", ""),
        "current_version_size": asset.get("currentVersionSize", 0),
        "license": asset.get("license", ""),
        "tags": tags,
        "thumbnail_url": thumbnail_url,
        "rating": asset.get("averageRating", 0),
        "rating_count": asset.get("ratingCount", 0),
        "subscribers": asset.get("subscriberCount", 0),
        "downloads": downloads,
        "created_at": asset.get("createdAt", ""),
        "updated_at": asset.get("updatedAt", ""),
        "dependencies": dependencies,
        "scenarios": scenarios,
        "scenario_ids": scenario_ids,
        "versions": versions,
        "changelog": changelog,
    }

# Test with a known mod
mod_id = "59D64ADD6FC59CBF"
url = f"{WORKSHOP_URL}/{mod_id}"
print(f"Fetching: {url}")

try:
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        resp = client.get(url, headers=BROWSER_HEADERS)
        resp.raise_for_status()
        html = resp.text
        print(f"HTML length: {len(html)}")
        print(f"Status: {resp.status_code}")
except Exception as e:
    print(f"HTTP FAILED: {e}")
    sys.exit(1)

# Extract __NEXT_DATA__
next_data = extract_next_data(html)
if next_data:
    print(f"__NEXT_DATA__ found: True")
    print(f"__NEXT_DATA__ top keys: {list(next_data.keys())}")
    pp = next_data.get("props", {}).get("pageProps", {})
    print(f"pageProps keys: {list(pp.keys())}")
    asset = pp.get("asset", {})
    print(f"asset keys: {sorted(asset.keys())}")
else:
    print("__NEXT_DATA__ found: False")
    # Try to find any script tags
    scripts = re.findall(r'<script[^>]*id=["\']([^"\']+)["\']', html)
    print(f"Script IDs found: {scripts}")
    sys.exit(1)

# Parse
details = parse_mod_details_from_json(next_data)
if details:
    print("\n=== PARSED DETAILS ===")
    for key in sorted(details.keys()):
        val = details[key]
        if isinstance(val, list):
            print(f"  {key}: [{len(val)} items]")
            if val and len(val) <= 3:
                for item in val:
                    print(f"    - {item}")
            elif val:
                print(f"    - {val[0]}")
                print(f"    ... ({len(val)-1} more)")
        elif isinstance(val, str) and len(val) > 100:
            print(f"  {key}: {val[:100]}...")
        else:
            print(f"  {key}: {val}")
else:
    print("PARSING FAILED - returned None")
