import pytest
import numpy as np
from rag.core.types import Document, Chunk
from rag.core.interfaces import BaseEmbeddingModel
from rag.ingestion.chunkers.recursive_chunker import RecursiveChunker
from rag.ingestion.chunkers.semantic_chunker import SemanticChunker, _cosine_similarity, _split_sentences
from rag.ingestion.chunkers.hierarchical_chunker import HierarchicalChunker
from rag.ingestion.chunkers.markdown_header_chunker import MarkdownHeaderChunker
from rag.ingestion.chunkers.by_title_chunker import ByTitleChunker


class MockEmbeddingModel(BaseEmbeddingModel):
    def __init__(self, sentence_embeddings=None):
        self.sentence_embeddings = sentence_embeddings or []
        self.call_count = 0

    async def embed(self, texts):
        self.call_count += 1
        # Return a list of fake embeddings matching the text lengths or returning predefined ones
        if self.sentence_embeddings:
            return self.sentence_embeddings[:len(texts)]
        # Return random/dummy embeddings of dimension 3
        return [[1.0, 0.0, 0.0] for _ in texts]

    async def embed_query(self, query):
        return [1.0, 0.0, 0.0]

    @property
    def dimensions(self):
        return 3


def test_cosine_similarity():
    v1 = np.array([1.0, 0.0, 0.0])
    v2 = np.array([1.0, 0.0, 0.0])
    v3 = np.array([0.0, 1.0, 0.0])
    v4 = np.array([0.0, 0.0, 0.0])
    
    assert _cosine_similarity(v1, v2) == pytest.approx(1.0)
    assert _cosine_similarity(v1, v3) == pytest.approx(0.0)
    assert _cosine_similarity(v1, v4) == pytest.approx(0.0)


def test_split_sentences():
    text = "Hello world. This is sentence two! And sentence three? Yes."
    sentences = _split_sentences(text)
    assert sentences == [
        "Hello world.",
        "This is sentence two!",
        "And sentence three?",
        "Yes."
    ]


@pytest.mark.asyncio
async def test_recursive_chunker():
    chunker = RecursiveChunker(max_chunk_size=50, chunk_overlap=10)
    doc = Document(content="Line one of text.\n\nLine two of text which is much longer.\nLine three here.")
    
    chunks = await chunker.chunk(doc)
    assert len(chunks) > 0
    for chunk in chunks:
        assert isinstance(chunk, Chunk)
        assert len(chunk.content) <= 50
        assert chunk.document_id == doc.id
        assert chunk.token_count == len(chunk.content.split())
        
    # Test batch chunking
    docs = [
        Document(content="Hello world from doc one."),
        Document(content="Hello world from doc two.")
    ]
    batch_chunks = await chunker.chunk_batch(docs)
    assert len(batch_chunks) >= 2


@pytest.mark.asyncio
async def test_semantic_chunker():
    # 1. Un-injected embedding model should raise RuntimeError
    chunker = SemanticChunker(breakpoint_threshold=0.5)
    doc = Document(content="Sentence one. Sentence two.")
    with pytest.raises(RuntimeError):
        await chunker.chunk(doc)

    # 2. Inject embedding model
    # Mock embeddings: first two sentences are highly similar (1.0),
    # third sentence is orthogonal (0.0 similarity to the second).
    embeddings = [
        [1.0, 0.0, 0.0],  # Sentence one
        [1.0, 0.0, 0.0],  # Sentence two
        [0.0, 1.0, 0.0],  # Sentence three
    ]
    mock_embed = MockEmbeddingModel(sentence_embeddings=embeddings)
    chunker = SemanticChunker(embedding_model=mock_embed, breakpoint_threshold=0.5, min_chunk_size=10)
    
    doc = Document(content="This is the first sentence. This is the second sentence. Completely different topic here.")
    chunks = await chunker.chunk(doc)
    
    # We expect a split between sentence 2 and sentence 3
    # Sentence 1 & 2 are grouped together: "This is the first sentence. This is the second sentence."
    # Sentence 3 is standalone: "Completely different topic here."
    assert len(chunks) == 2
    assert "first sentence" in chunks[0].content
    assert "second sentence" in chunks[0].content
    assert "Completely different" in chunks[1].content


@pytest.mark.asyncio
async def test_hierarchical_chunker():
    chunker = HierarchicalChunker(
        parent_chunk_size=100,
        child_chunk_size=30,
        parent_overlap=10,
        child_overlap=5
    )
    doc = Document(content="This is a very long document content that will be split into parent chunks. Each parent chunk will then be further split into smaller children chunks, which are linked back to their parent.")
    
    chunks = await chunker.chunk(doc)
    assert len(chunks) > 0
    
    parents = [c for c in chunks if c.metadata.custom.get("hierarchy_level") == "parent"]
    children = [c for c in chunks if c.metadata.custom.get("hierarchy_level") == "child"]
    
    assert len(parents) > 0
    assert len(children) > 0
    
    # Check linkages
    for p in parents:
        assert len(p.children_ids) > 0
        for child_id in p.children_ids:
            # Find the child chunk
            child = next((c for c in children if c.id == child_id), None)
            assert child is not None
            assert child.parent_id == p.id




@pytest.mark.asyncio
async def test_markdown_header_chunker():
    doc = Document(
        content="# Intro\nWelcome.\n## Setup\nFirst step.\nSecond step.\n# Details\nComplete details."
    )
    chunker = MarkdownHeaderChunker(max_chunk_size=100, chunk_overlap=10, prepend_headers=True)
    
    chunks = await chunker.chunk(doc)
    
    # We expect 3 sections (Intro, Setup, Details)
    assert len(chunks) == 3
    
    # Section 1: Intro
    assert "# Intro" in chunks[0].content
    assert "Welcome." in chunks[0].content
    assert chunks[0].metadata.custom["markdown_headers"] == {1: "Intro"}
    
    # Section 2: Setup
    assert "# Intro" in chunks[1].content
    assert "## Setup" in chunks[1].content
    assert "First step." in chunks[1].content
    assert chunks[1].metadata.custom["markdown_headers"] == {1: "Intro", 2: "Setup"}
    
    # Section 3: Details
    assert "# Details" in chunks[2].content
    assert "Complete details." in chunks[2].content
    assert chunks[2].metadata.custom["markdown_headers"] == {1: "Details"}


@pytest.mark.asyncio
async def test_recursive_chunker_order_and_fallback():
    # Test order preservation with an oversized split in the middle
    chunker = RecursiveChunker(max_chunk_size=20, chunk_overlap=0)
    doc = Document(content="AAAA B_VERY_LONG_PART_EXCEEDING_MAX CCCC")
    chunks = await chunker.chunk(doc)
    
    # Order must be strictly preserved: AAAA -> B part 1 -> B part 2 -> CCCC
    contents = [c.content for c in chunks]
    assert contents[0] == "AAAA"
    assert contents[-1] == "CCCC"
    # Fallback to character split should not insert spaces between characters
    assert any("B_VERY" in c for c in contents)
    assert not any("B _ V E R Y" in c for c in contents)


@pytest.mark.asyncio
async def test_by_title_chunker_sorting():
    from rag.ingestion.chunkers.by_title_chunker import ByTitleChunker
    from rag.core.types import DocumentMetadata
    
    chunker = ByTitleChunker(max_chunk_size=100, chunk_overlap=0, prepend_title=True)
    docs = [
        Document(content="Intro Title", metadata=DocumentMetadata(source="doc.txt", page_number=1, custom={"element_type": "title"})),
        Document(content="Body text under intro.", metadata=DocumentMetadata(source="doc.txt", page_number=1, custom={"element_type": "text"})),
        Document(content="Setup Title", metadata=DocumentMetadata(source="doc.txt", page_number=2, custom={"element_type": "title"})),
        Document(content="Body text under setup.", metadata=DocumentMetadata(source="doc.txt", page_number=2, custom={"element_type": "text"})),
    ]
    chunks = await chunker.chunk_batch(docs)
    
    # We expect 2 chunks.
    # Chunk 1: Body text under intro. (Intro Title was prepended to it)
    # Chunk 2: Body text under setup. (Setup Title was prepended to it)
    assert len(chunks) == 2
    assert chunks[0].content == "Section: Intro Title\n\nIntro Title\n\nBody text under intro."
    assert chunks[1].content == "Section: Setup Title\n\nSetup Title\n\nBody text under setup."


@pytest.mark.asyncio
async def test_markdown_header_chunker_empty_sections():
    # Test that empty sections (like # Intro and ## Setup before # Details) are not silently dropped
    doc = Document(content="# Intro\n## Setup\n# Details\nSome text.")
    chunker = MarkdownHeaderChunker(max_chunk_size=100, chunk_overlap=10, prepend_headers=True)
    chunks = await chunker.chunk(doc)
    
    # We expect two chunks:
    # 1. Containing the empty headers '# Intro\n\n## Setup'
    # 2. Containing '# Details\n\nSome text.'
    assert len(chunks) == 2
    assert chunks[0].content == "# Intro\n## Setup"
    assert chunks[0].metadata.custom["markdown_headers"] == {1: "Intro", 2: "Setup"}
    
    assert "# Details" in chunks[1].content
    assert "Some text." in chunks[1].content
    assert chunks[1].metadata.custom["markdown_headers"] == {1: "Details"}


@pytest.mark.asyncio
async def test_semantic_chunker_buffer_size_and_limits():
    # 1. Test size constraint violation fallback
    embeddings = [[1.0, 0.0, 0.0]]
    mock_embed = MockEmbeddingModel(sentence_embeddings=embeddings)
    # max_chunk_size = 50, but sentence is 80 chars
    long_text = "A" * 80 + "."
    doc = Document(content=long_text)
    chunker = SemanticChunker(embedding_model=mock_embed, max_chunk_size=50, min_chunk_size=10)
    
    chunks = await chunker.chunk(doc)
    # The oversized sentence should have been character-split so no chunk exceeds max_chunk_size (50)
    for c in chunks:
        assert len(c.content) <= 50

    # 2. Test safe merging (does not destructively merge unrelated normal chunks)
    # C1 (200 chars), C2 (50 chars), C3 (200 chars). min = 100, max = 500.
    # C1 and C3 should not be merged together; C2 should merge with C3.
    embeddings_2 = [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
    ]
    mock_embed_2 = MockEmbeddingModel(sentence_embeddings=embeddings_2)
    # We set breakpoint threshold very high to force splits at all three sentences
    chunker_2 = SemanticChunker(embedding_model=mock_embed_2, breakpoint_threshold=1.5, max_chunk_size=500, min_chunk_size=100)
    
    # Construct content such that:
    # Sentence 1 is 200 chars.
    # Sentence 2 is 50 chars.
    # Sentence 3 is 200 chars.
    s1 = "A" * 199 + "."
    s2 = "B" * 49 + "."
    s3 = "C" * 199 + "."
    doc_2 = Document(content=f"{s1} {s2} {s3}")
    chunks_2 = await chunker_2.chunk(doc_2)
    
    # We expect 2 chunks:
    # Chunk 0: Sentence 1 ("A...") - length ~200
    # Chunk 1: Sentence 2 + Sentence 3 ("B... C...") - length ~250 (Sentence 2 was merged with 3 because it was < min_chunk_size)
    # Sentence 1 should NOT be merged with them.
    assert len(chunks_2) == 2
    assert chunks_2[0].content.startswith("A")
    assert chunks_2[1].content.startswith("B")


@pytest.mark.asyncio
async def test_multimodal_enricher_layout_preservation():
    from rag.ingestion.enricher import MultimodalEnricher
    from unittest.mock import AsyncMock
    
    mock_llm = AsyncMock()
    mock_llm.generate.return_value = "Summary of visual content"
    
    enricher = MultimodalEnricher(llm=mock_llm)
    
    # 1. Test table preservation
    table_doc = Document(
        content="<table><tr><td>cell</td></tr></table>",
        metadata={"custom": {"element_type": "table"}}
    )
    enriched_table = await enricher.enrich_document(table_doc)
    assert "Table Summary: Summary of visual content" in enriched_table.content
    assert "Table Data:\n<table><tr><td>cell</td></tr></table>" in enriched_table.content
    assert enriched_table.metadata.custom["summary_text"] == "Summary of visual content"
    
    # 2. Test image formatting
    image_doc = Document(
        content="Image Raw Content",
        metadata={"custom": {"element_type": "image", "image_base64": "b64data"}}
    )
    enriched_image = await enricher.enrich_document(image_doc)
    assert enriched_image.content == "Image Description: Summary of visual content"
    assert enriched_image.metadata.custom["summary_text"] == "Summary of visual content"


@pytest.mark.asyncio
async def test_recursive_chunker_layout_indivisible():
    # Set max_chunk_size very small (e.g., 20 chars), but table HTML is 50 chars
    chunker = RecursiveChunker(max_chunk_size=20, chunk_overlap=0)
    
    table_doc = Document(
        content="<table><tr><td>very long table cells</td></tr></table>",
        metadata={"custom": {"element_type": "table"}}
    )
    
    chunks = await chunker.chunk(table_doc)
    
    # Should bypass splitting and return a single chunk with full table data intact
    assert len(chunks) == 1
    assert chunks[0].content == "<table><tr><td>very long table cells</td></tr></table>"
    assert chunks[0].chunk_index == 0


@pytest.mark.asyncio
async def test_by_title_chunker_layout_indivisible():
    chunker = ByTitleChunker(max_chunk_size=200, chunk_overlap=0, prepend_title=True)
    
    docs = [
        Document(content="Section Title", metadata={"source": "doc1", "page_number": 1, "custom": {"element_type": "title"}}),
        Document(content="Some regular text in section.", metadata={"source": "doc1", "page_number": 1}),
        Document(content="<table><tr><td>table cell</td></tr></table>", metadata={"source": "doc1", "page_number": 1, "custom": {"element_type": "table"}}),
        Document(content="Another text block.", metadata={"source": "doc1", "page_number": 1}),
    ]
    
    chunks = await chunker.chunk_batch(docs)
    
    # We expect:
    # 1. Text chunk: "Section: Section Title\n\nSection Title\n\nSome regular text in section."
    # 2. Table chunk: "Section: Section Title\n\n<table><tr><td>table cell</td></tr></table>" (Intact!)
    # 3. Next text chunk: "Section: Section Title\n\nAnother text block."
    assert len(chunks) == 3
    assert "Some regular text" in chunks[0].content
    assert chunks[1].content == "Section: Section Title\n\n<table><tr><td>table cell</td></tr></table>"
    assert "Another text block" in chunks[2].content


@pytest.mark.asyncio
async def test_hierarchical_chunker_layout_indivisible():
    chunker = HierarchicalChunker(parent_chunk_size=100, child_chunk_size=20)
    
    table_doc = Document(
        content="<table><tr><td>very long parent and child table</td></tr></table>",
        metadata={"custom": {"element_type": "table"}}
    )
    
    chunks = await chunker.chunk(table_doc)
    
    # Should return exactly 2 chunks (1 parent, 1 child) without splitting the table in either of them
    assert len(chunks) == 2
    assert chunks[0].metadata.custom["hierarchy_level"] == "parent"
    assert chunks[0].content == "<table><tr><td>very long parent and child table</td></tr></table>"
    
    assert chunks[1].metadata.custom["hierarchy_level"] == "child"
    assert chunks[1].content == "<table><tr><td>very long parent and child table</td></tr></table>"
    assert chunks[1].parent_id == chunks[0].id



