import asyncio
import sys
import structlog
from pathlib import Path

# Configure log to stdout
structlog.configure(
    processors=[structlog.processors.JSONRenderer()]
)

from src.rag.ingestion.parsers.unstructured_parser import UnstructuredParser

async def test_parse():
    pdf_path = "data/temp_uploads/Beyond Semantic Similarity.pdf"
    print(f"Testing parsing on: {pdf_path}")
    parser = UnstructuredParser(strategy="hi_res", extract_images=True)
    try:
        docs = await parser.parse(pdf_path)
        print(f"Success! Number of documents: {len(docs)}")
        categories = {}
        for idx, doc in enumerate(docs[:10]):
            el_type = doc.metadata.custom.get("element_type", "unknown")
            categories[el_type] = categories.get(el_type, 0) + 1
            print(f"Doc {idx}: type={el_type}, content_len={len(doc.content)}")
            if el_type == "table":
                print(f"Table content snippet: {doc.content[:200]}")
        print(f"Categories in first 10 docs: {categories}")
        
        # Check all docs
        all_categories = {}
        for doc in docs:
            el_type = doc.metadata.custom.get("element_type", "unknown")
            all_categories[el_type] = all_categories.get(el_type, 0) + 1
        print(f"All categories count: {all_categories}")
    except Exception as e:
        print(f"Failed with exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_parse())
