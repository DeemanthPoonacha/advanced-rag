"""
Directly call unstructured partition to inspect raw element metadata
for image blocks. This bypasses the UnstructuredParser wrapper.
"""
import sys
from pathlib import Path

def main():
    pdf_path = "/home/deemanth/Downloads/Beyond Semantic Similarity.pdf"
    if not Path(pdf_path).exists():
        print("PDF not found at:", pdf_path)
        return

    print(f"Partitioning: {pdf_path}")
    print("Using hi_res strategy with extract_image_block_to_payload=True")
    print("=" * 60)

    try:
        from unstructured.partition.auto import partition
    except ImportError:
        print("unstructured not installed")
        return

    elements = partition(
        filename=pdf_path,
        strategy="hi_res",
        languages=["en"],
        include_page_breaks=True,
        infer_table_structure=True,
        extract_images_in_pdf=True,
        extract_image_block_to_payload=True,
        extract_image_block_types=["Image"],
    )

    print(f"Total elements: {len(elements)}")

    # Count by category
    cats = {}
    for el in elements:
        cat = getattr(el, "category", "Unknown")
        cats[cat] = cats.get(cat, 0) + 1
    print(f"Categories: {cats}")
    print("=" * 60)

    # Inspect Image elements in detail
    image_elements = [el for el in elements if getattr(el, "category", "") in ("Image", "Picture")]
    print(f"\nImage elements found: {len(image_elements)}")

    for idx, el in enumerate(image_elements):
        meta = el.metadata if hasattr(el, "metadata") else None
        print(f"\n--- Image Element {idx} ---")
        print(f"  category: {el.category}")
        print(f"  text (first 80 chars): {str(el)[:80]}")
        
        if meta:
            # List all metadata attributes
            meta_attrs = [attr for attr in dir(meta) if not attr.startswith("_")]
            print(f"  metadata attributes: {meta_attrs}")
            
            # Check specific image-related fields
            for field in ["image_base64", "image_path", "image_mime_type",
                          "image_url", "coordinates", "page_number",
                          "detection_class_prob"]:
                val = getattr(meta, field, "NOT_FOUND")
                if val == "NOT_FOUND":
                    continue
                if val is None:
                    print(f"  {field}: None")
                elif isinstance(val, str) and len(val) > 80:
                    print(f"  {field}: (len={len(val)}) {val[:60]}...")
                else:
                    print(f"  {field}: {val}")
            
            # Also check if there's a to_dict method
            if hasattr(meta, "to_dict"):
                d = meta.to_dict()
                img_keys = [k for k in d if "image" in k.lower() or "base64" in k.lower()]
                print(f"  to_dict() image-related keys: {img_keys}")
                for k in img_keys:
                    v = d[k]
                    if v is None:
                        print(f"    {k}: None")
                    elif isinstance(v, str) and len(v) > 80:
                        print(f"    {k}: (len={len(v)}) {v[:60]}...")
                    else:
                        print(f"    {k}: {v}")
        else:
            print("  NO METADATA")

    print("\n" + "=" * 60)
    print("Done.")

if __name__ == "__main__":
    main()
