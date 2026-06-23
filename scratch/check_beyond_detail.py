"""Check what element types the fast strategy produces vs hi_res"""
import urllib.request
import json

url = "http://localhost:8000/api/chunks?limit=10000"
with urllib.request.urlopen(url) as response:
    data = json.loads(response.read().decode('utf-8'))
    chunks = data.get("chunks", [])

beyond = [c for c in chunks if "Beyond" in (c.get("metadata", {}).get("file_name") or "")]
print(f"Beyond chunks total: {len(beyond)}")

# Count element types
types = {}
for c in beyond:
    et = c.get("metadata", {}).get("element_type", "unknown")
    types[et] = types.get(et, 0) + 1
print(f"Element types: {types}")

# Show sample text of image chunks
imgs = [c for c in beyond if c.get("metadata", {}).get("element_type") == "image"]
for idx, c in enumerate(imgs[:3]):
    print(f"\nImage chunk {idx}:")
    print(f"  Content (first 200 chars): {c.get('content', '')[:200]}")
    meta = c.get("metadata", {})
    print(f"  page_number: {meta.get('page_number')}")
    print(f"  image_extracted: {meta.get('image_extracted')}")
    print(f"  image_base64 is None: {meta.get('image_base64') is None}")
    print(f"  summary_text (first 200): {(meta.get('summary_text') or '')[:200]}")
