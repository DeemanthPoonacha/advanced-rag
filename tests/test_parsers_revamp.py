import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
from rag.ingestion.parsers.pymupdf_parser import PyMuPDFParser
from rag.ingestion.parsers.docling_parser import DoclingParser
from rag.ingestion.parsers.unstructured_api_parser import UnstructuredAPIParser
from rag.ingestion.parsers.gcp_documentai_parser import GCPDocumentAIParser


@pytest.mark.asyncio
async def test_pymupdf_parser(tmp_path: Path):
    # Mock fitz document
    mock_page = MagicMock()
    mock_page.get_text.return_value = "PyMuPDF Page Content"
    
    mock_doc = MagicMock()
    mock_doc.__len__.return_value = 1
    mock_doc.__getitem__.return_value = mock_page
    
    with patch("fitz.open", return_value=mock_doc):
        parser = PyMuPDFParser()
        docs = await parser.parse("dummy.pdf")
        
        assert len(docs) == 1
        assert docs[0].content == "PyMuPDF Page Content"
        assert docs[0].metadata.page_number == 1
        assert docs[0].metadata.total_pages == 1
        assert docs[0].metadata.file_name == "dummy.pdf"


@pytest.mark.asyncio
async def test_docling_parser():
    mock_doc = MagicMock()
    mock_doc.export_to_markdown.return_value = "# Docling Markdown"
    
    mock_result = MagicMock()
    mock_result.document = mock_doc
    
    mock_converter = MagicMock()
    mock_converter.convert.return_value = mock_result
    
    with patch.object(DoclingParser, "_get_converter", return_value=mock_converter):
        parser = DoclingParser(export_format="markdown")
        docs = await parser.parse("dummy.pdf")
        
        assert len(docs) == 1
        assert docs[0].content == "# Docling Markdown"
        assert docs[0].metadata.custom["parser"] == "docling"
        assert docs[0].metadata.custom["format"] == "markdown"


@pytest.mark.asyncio
async def test_unstructured_api_parser():
    # Mock client and API elements
    mock_el = {
        "type": "Title",
        "text": "Unstructured API Content",
        "metadata": {"page_number": 1}
    }
    
    mock_response = MagicMock()
    mock_response.elements = [mock_el]
    
    mock_client = MagicMock()
    mock_client.general.partition.return_value = mock_response
    
    with patch.object(UnstructuredAPIParser, "_get_client", return_value=mock_client):
        parser = UnstructuredAPIParser(api_key="fake-api-key")
        docs = await parser.parse(b"dummy bytes content", metadata={"file_name": "test.pdf", "file_type": "pdf"})
        
        assert len(docs) == 1
        assert docs[0].content == "Unstructured API Content"
        assert docs[0].metadata.page_number == 1
        assert docs[0].metadata.file_name == "test.pdf"


@pytest.mark.asyncio
async def test_gcp_documentai_parser():
    # Mock document structure
    mock_segment = MagicMock()
    mock_segment.start_index = 0
    mock_segment.end_index = 26
    
    mock_anchor = MagicMock()
    mock_anchor.text_segments = [mock_segment]
    
    mock_layout = MagicMock()
    mock_layout.text_anchor = mock_anchor
    
    mock_page = MagicMock()
    mock_page.page_number = 1
    mock_page.layout = mock_layout
    
    mock_doc = MagicMock()
    mock_doc.text = "Google Document AI Content"
    mock_doc.pages = [mock_page]
    
    mock_result = MagicMock()
    mock_result.document = mock_doc
    
    mock_client = MagicMock()
    mock_client.processor_path.return_value = "fake-processor-path"
    mock_client.process_document.return_value = mock_result
    
    with patch.object(GCPDocumentAIParser, "_get_client", return_value=mock_client):
        parser = GCPDocumentAIParser(
            project_id="test-project",
            processor_id="test-processor",
        )
        docs = await parser.parse(b"dummy document AI bytes", metadata={"file_name": "ai.pdf", "file_type": "pdf"})
        
        assert len(docs) == 1
        assert docs[0].content == "Google Document AI Content"
        assert docs[0].metadata.page_number == 1
        assert docs[0].metadata.file_name == "ai.pdf"
