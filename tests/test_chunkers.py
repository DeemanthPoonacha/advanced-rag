import pytest
import numpy as np
from rag.core.types import Document, Chunk
from rag.core.interfaces import BaseEmbeddingModel
from rag.ingestion.chunkers.recursive_chunker import RecursiveChunker
from rag.ingestion.chunkers.semantic_chunker import SemanticChunker, _cosine_similarity, _split_sentences
from rag.ingestion.chunkers.hierarchical_chunker import HierarchicalChunker
from rag.ingestion.chunkers.markdown_header_chunker import MarkdownHeaderChunker


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

