from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
from tests.conftest import mock_unstructured_partition, mock_llama_parse

import pytest
from rag.ingestion.parsers.unstructured_parser import UnstructuredParser
from rag.ingestion.parsers.llamaparse_parser import LlamaParseParser
from rag.core.types import Document


@pytest.mark.asyncio
async def test_unstructured_parser(tmp_path: Path):
    # Mock elements returned by unstructured
    mock_el1 = MagicMock()
    mock_el1.__str__.return_value = "Page 1 Content"
    mock_el1.metadata = MagicMock(page_number=1)
    
    mock_el2 = MagicMock()
    mock_el2.__str__.return_value = "Page 2 Content"
    mock_el2.metadata = MagicMock(page_number=2)
    
    mock_unstructured_partition.partition = MagicMock(return_value=[mock_el1, mock_el2])
    
    # 1. Parse file path
    test_file = tmp_path / "test.pdf"
    test_file.touch()
    
    parser = UnstructuredParser(include_page_breaks=True, strategy="fast")
    docs = await parser.parse(str(test_file))
    
    assert len(docs) == 2
    assert docs[0].content == "Page 1 Content"
    assert docs[0].metadata.page_number == 1
    assert docs[0].metadata.total_pages == 2
    assert docs[1].content == "Page 2 Content"
    assert docs[1].metadata.page_number == 2
    
    # 2. Parse bytes
    docs_bytes = await parser.parse(b"raw pdf bytes", metadata={"file_name": "bytes.pdf", "file_type": "pdf"})
    assert len(docs_bytes) == 2
    assert docs_bytes[0].content == "Page 1 Content"
    
    # 3. Parse batch
    mock_unstructured_partition.partition.reset_mock()
    batch_docs = await parser.parse_batch([str(test_file), str(test_file)])
    assert len(batch_docs) == 4
    assert mock_unstructured_partition.partition.call_count == 2


@pytest.mark.asyncio
async def test_llamaparse_parser(tmp_path: Path):
    # Mock LlamaParse client aload_data
    mock_ldoc1 = MagicMock(text="Page 1 Text")
    mock_ldoc2 = MagicMock(text="Page 2 Text")
    
    mock_client = MagicMock()
    mock_client.aload_data = AsyncMock(return_value=[mock_ldoc1, mock_ldoc2])
    
    mock_llama_parse.LlamaParse.return_value = mock_client
    
    test_file = tmp_path / "complex.pdf"
    test_file.touch()
    
    parser = LlamaParseParser(api_key="fake-llama-key")
    
    # 1. Parse file
    docs = await parser.parse(str(test_file))
    assert len(docs) == 2
    assert docs[0].content == "Page 1 Text"
    assert docs[0].metadata.page_number == 1
    assert docs[0].metadata.total_pages == 2
    assert docs[1].content == "Page 2 Text"
    assert docs[1].metadata.page_number == 2
    
    # 2. Parse bytes
    docs_bytes = await parser.parse(b"raw bytes data", metadata={"file_name": "doc.pdf"})
    assert len(docs_bytes) == 2
    assert docs_bytes[0].content == "Page 1 Text"
    assert docs_bytes[0].metadata.file_name == "doc.pdf"
    
    # 3. Parse batch
    mock_client.aload_data.reset_mock()
    batch_docs = await parser.parse_batch([str(test_file), str(test_file)])
    assert len(batch_docs) == 4
    assert mock_client.aload_data.call_count == 2


