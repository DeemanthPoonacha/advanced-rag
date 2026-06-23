import urllib.request
import json

def inspect_api():
    try:
        url = "http://localhost:8000/api/chunks?limit=1000"
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode('utf-8'))
            chunks = data.get("chunks", [])
            print(f"Total chunks: {len(chunks)}")
            
            image_chunks = [c for c in chunks if c.get("metadata", {}).get("element_type") == "image"]
            print(f"Total image chunks: {len(image_chunks)}")
            
            for idx, c in enumerate(image_chunks[:10]):
                meta = c.get("metadata", {})
                img_b64 = meta.get("image_base64")
                print(f"Image {idx}:")
                print(f"  id: {c.get('id')}")
                print(f"  file_name: {meta.get('file_name')}")
                print(f"  page_number: {meta.get('page_number')}")
                print(f"  image_extracted: {meta.get('image_extracted')}")
                print(f"  image_base64_len: {len(img_b64) if img_b64 else 'None'}")
                if img_b64:
                    print(f"  image_base64_snippet: {img_b64[:60]}...")
            
            # Print a list of all unique element types
            types = set(c.get("metadata", {}).get("element_type") for c in chunks)
            print(f"All element types in DB: {types}")
            
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    inspect_api()
