import pytest
from unittest.mock import AsyncMock, MagicMock
from rag.core.types import Document
from rag.ingestion.enricher import MultimodalEnricher


@pytest.mark.asyncio
async def test_multimodal_enricher_table():
    doc = Document(
        content="<table><tr><td>Cell 1</td></tr></table>",
        metadata={"custom": {"element_type": "table"}}
    )
    
    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock(return_value="| Cell 1 |\n|---|")
    
    enricher = MultimodalEnricher(llm=mock_llm, table_prompt="CUSTOM TABLE PROMPT:")
    enriched_doc = await enricher.enrich_document(doc)
    
    assert "Table Summary: | Cell 1 |\n|---|" in enriched_doc.content
    assert "Table Data:\n<table><tr><td>Cell 1</td></tr></table>" in enriched_doc.content
    assert enriched_doc.metadata.custom["summary_text"] == "| Cell 1 |\n|---|"
    mock_llm.generate.assert_called_once()
    assert "CUSTOM TABLE PROMPT:" in mock_llm.generate.call_args[0][0]


@pytest.mark.asyncio
async def test_multimodal_enricher_image():
    doc = Document(
        content="[Image]",
        metadata={"custom": {"element_type": "image", "image_base64": "base64data"}}
    )
    
    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock(return_value="Detailed image description.")
    
    enricher = MultimodalEnricher(llm=mock_llm, image_prompt="CUSTOM IMAGE PROMPT:")
    enriched_doc = await enricher.enrich_document(doc)
    
    assert enriched_doc.content == "Image Description: Detailed image description."
    assert enriched_doc.metadata.custom["summary_text"] == "Detailed image description."
    mock_llm.generate.assert_called_once()
    assert mock_llm.generate.call_args[0][0] == "CUSTOM IMAGE PROMPT:"
    assert mock_llm.generate.call_args[1]["images"] == ["base64data"]


@pytest.mark.asyncio
async def test_multimodal_enricher_bypass():
    doc = Document(
        content="This is standard text content.",
        metadata={"custom": {"element_type": "text"}}
    )
    
    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock()
    
    enricher = MultimodalEnricher(llm=mock_llm)
    enriched_doc = await enricher.enrich_document(doc)
    
    assert enriched_doc.content == "This is standard text content."
    mock_llm.generate.assert_not_called()
