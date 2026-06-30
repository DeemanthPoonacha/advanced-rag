# Architectural Comparison: Codebase vs. Notebook

This document provides a detailed comparison between our current RAG pipeline architecture and the architecture used in the Jupyter notebook [multi_modal_rag.ipynb](file:///home/deemanth/repos/rough/js-ai/multi_modal_rag.ipynb).

---

## 1. Pipeline Flow Comparison

| Feature / Step | Our Current Architecture | Notebook's Architecture |
| :--- | :--- | :--- |
| **Pipeline Flow** | `Parse` ➔ `Enrich` ➔ `Chunk` ➔ `Embed` ➔ `Upsert` | `Parse` ➔ `Chunk` ➔ `Enrich (Summarize)` ➔ `Embed` ➔ `Upsert` |
| **Enrichment Scope** | **Element-Level Enrichment**: LLM processes tables/images *individually* as standalone documents before chunking. | **Chunk-Level Enrichment**: LLM processes the entire section chunk (text, tables, and images together) at once. |
| **Primary Index Content** | The chunk text directly contains the prepended summary + original raw content (HTML table). | The chunk text contains *only* the LLM-generated search summary. Raw data is stored in metadata. |
| **Parser Dependency** | Decoupled and modular (works with PyMuPDF, Docling, LlamaParse, Unstructured). | Highly coupled to the `unstructured` Python library's `CompositeElement.metadata.orig_elements` field. |

---

## 2. In-Depth Comparison of Key Differences

### A. Placement of the Multimodal Enricher
*   **Our Architecture (Before Chunking)**:
    *   The parser outputs clean, distinct `Document` objects for text, tables, and images. The enricher processes these visual elements individually and updates their contents. 
    *   The chunkers then take the enriched documents and combine/split them into final chunks based on size constraints.
*   **Notebook Architecture (After Chunking)**:
    *   The raw elements are chunked first using Unstructured's `chunk_by_title`. This creates composite chunks. 
    *   The enricher loops through each chunk, looks inside its `metadata.orig_elements` to find any tables/images that were packed into that chunk, and calls the Vision LLM on the entire chunk's combined content to write a single unified summary.

### B. Index Content vs. Metadata Payload
*   **Our Architecture**:
    *   The index (`page_content` of the vector store chunk) contains both the summary and the raw data (e.g. the HTML table structure).
    *   **Pros**: Standard RAG pipelines work out of the box. When retrieved, the LLM receives the actual, raw table cells for generation, ensuring high precision.
*   **Notebook Architecture**:
    *   The index (`page_content`) contains *only* the LLM-generated searchable summary. The raw text, HTML tables, and image base64 are serialized as a JSON string inside a metadata field (`original_content`).
    *   **Pros**: The index is clean and optimized for keyword/semantic matching.
    *   **Cons**: Custom code is required at retrieval time to extract the raw text/HTML from the metadata and feed it to the generator LLM; otherwise, the generator LLM only sees the search description.

### C. Parser Tight Coupling
*   **Our Architecture**:
    *   Extremely modular. Because elements are converted to standard `Document` objects early on, the pipeline works identically whether using Docling, PyMuPDF, LlamaParse, or Unstructured.
*   **Notebook Architecture**:
    *   Highly dependent on Unstructured's internal object schema. It relies on the python memory reference `chunk.metadata.orig_elements` to retrieve the tables/images *after* the chunker has grouped them. If you swap to a different parser or run the parsing stage as an independent REST API, this list is lost, and the enricher fails.

---

## 3. Which approach is better?

### Why the Notebook works fine for local prototyping:
*   It utilizes unstructured's `orig_elements` memory references to bypass the file-splitting issues we observed. 
*   By summarizing the entire chunk (context text + image + table), the LLM has all nearby context to write a highly descriptive summary.

### Why our architecture is better suited for a production-grade system:
1.  **Modular Parsers**: We can swap parsers dynamically based on file type (e.g., Docling for PDF layout, PyMuPDF for quick text, Unstructured for images) without breaking the chunking or enrichment stage.
2.  **No Data Loss**: Standard retrieval directly exposes the HTML table to the generator LLM without needing custom metadata deserialization logic.
3.  **Cross-Platform/API Friendly**: We do not rely on local Python memory object pointers (like `orig_elements`) to pass layout references, allowing parser services to run independently.
