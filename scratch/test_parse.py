import asyncio
import sys
import logging
from pathlib import Path

# Add src to python path
sys.path.append(str(Path(__file__).parent.parent / "src"))

from rag.ingestion.parsers.unstructured_parser import UnstructuredParser

# Set up logging to stdout
logging.basicConfig(level=logging.INFO)

async def main():
    parser = UnstructuredParser(strategy="hi_res", extract_images=True)
    pdf_path = "/home/deemanth/Downloads/Beyond Semantic Similarity.pdf"
    
    # Check if file exists
    if not Path(pdf_path).exists():
        print("PDF file does not exist at Downloads.")
        return

    try:
        print("Parsing document...")
        docs = await parser.parse(pdf_path)
        print(f"Successfully parsed {len(docs)} documents.")
        
        # Count elements by type
        types = {}
        for idx, doc in enumerate(docs[:30]):
            el_type = doc.metadata.custom.get("element_type", "unknown")
            types[el_type] = types.get(el_type, 0) + 1
            if el_type == "image":
                print(f"Image Doc {idx}: content_len={len(doc.content)}, has_base64={doc.metadata.custom.get('image_base64') is not None}")
                if doc.metadata.custom.get('image_base64'):
                    print(f"  Base64 starts with: {doc.metadata.custom['image_base64'][:50]}...")
            elif el_type == "table":
                print(f"Table Doc {idx}: has_table_html={doc.metadata.custom.get('table_extracted')}")
                
        print("All parsed element types:", types)
    except Exception as e:
        print("Error during parsing:", e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
