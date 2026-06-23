import asyncio
from qdrant_client import AsyncQdrantClient

async def inspect():
    client = AsyncQdrantClient(path="data/qdrant_db")
    collections = await client.get_collections()
    print("Collections:", [c.name for c in collections.collections])
    
    if "documents" in [c.name for c in collections.collections]:
        info = await client.get_collection("documents")
        print("Documents collection points count:", info.points_count)
        
        # Scroll points
        records, _ = await client.scroll(
            collection_name="documents",
            limit=100,
            with_payload=True,
            with_vectors=False
        )
        print(f"Retrieved {len(records)} points.")
        categories = {}
        images_found = 0
        for idx, rec in enumerate(records):
            p = rec.payload or {}
            el_type = p.get("element_type", "unknown")
            categories[el_type] = categories.get(el_type, 0) + 1
            if el_type == "image":
                images_found += 1
                print(f"\n--- Image Chunk {idx} ---")
                print(f"ID: {rec.id}")
                print(f"Content: {p.get('content')[:100]}...")
                print(f"Metadata keys: {list(p.keys())}")
                print(f"image_extracted: {p.get('image_extracted')}")
                image_b64 = p.get('image_base64')
                if image_b64 is None:
                    print("image_base64 is: None")
                else:
                    print(f"image_base64 length: {len(image_b64)}, starts with: {image_b64[:30]}...")
        
        print("\nAll categories:", categories)
        print("Total images found in scrolled points:", images_found)
    else:
        print("Documents collection not found.")

if __name__ == "__main__":
    asyncio.run(inspect())
