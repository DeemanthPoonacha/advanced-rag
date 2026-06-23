"""Check all metadata fields for Beyond Semantic Similarity.pdf image chunks"""
import urllib.request
import json

def inspect():
    url = "http://localhost:8000/api/chunks?limit=10000"
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode('utf-8'))
        chunks = data.get("chunks", [])

    beyond_images = [
        c for c in chunks
        if c.get("metadata", {}).get("element_type") == "image"
        and "Beyond" in (c.get("metadata", {}).get("file_name") or "")
    ]
    
    latent_images = [
        c for c in chunks
        if c.get("metadata", {}).get("element_type") == "image"
        and "Latent" in (c.get("metadata", {}).get("file_name") or "")
    ]

    print(f"Beyond Semantic Similarity.pdf image chunks: {len(beyond_images)}")
    print(f"LatentRAG.pdf image chunks: {len(latent_images)}")
    
    print("\n=== Beyond Semantic Similarity.pdf - Image Chunk 0 (FULL METADATA) ===")
    if beyond_images:
        meta = beyond_images[0].get("metadata", {})
        for k, v in sorted(meta.items()):
            if k == "image_base64" and v:
                print(f"  {k}: (len={len(v)}) {v[:40]}...")
            else:
                print(f"  {k}: {v}")
    
    print("\n=== LatentRAG.pdf - Image Chunk 0 (FULL METADATA) ===")
    if latent_images:
        meta = latent_images[0].get("metadata", {})
        for k, v in sorted(meta.items()):
            if k == "image_base64" and v:
                print(f"  {k}: (len={len(v)}) {v[:40]}...")
            else:
                print(f"  {k}: {v}")

    # Also check: are there ANY non-image chunks from "Beyond" that have page_number?
    beyond_all = [c for c in chunks if "Beyond" in (c.get("metadata", {}).get("file_name") or "")]
    pages = set()
    for c in beyond_all:
        pn = c.get("metadata", {}).get("page_number")
        if pn:
            pages.add(pn)
    print(f"\nBeyond chunks total: {len(beyond_all)}")
    print(f"Beyond chunks with page_number: {len([c for c in beyond_all if c.get('metadata', {}).get('page_number')])}")
    print(f"Unique page numbers: {sorted(pages)}")

if __name__ == "__main__":
    inspect()
