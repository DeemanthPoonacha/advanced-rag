import pytest
from rag.core.registry import ComponentRegistry, COMPONENT_TYPES
from rag.core.interfaces import BaseParser, BaseChunker
from rag.core.types import Document, Chunk


class DummyParser(BaseParser):
    async def parse(self, source, metadata=None):
        return []
    async def parse_batch(self, sources, metadata=None):
        return []


class DummyChunker(BaseChunker):
    async def chunk(self, document):
        return []
    async def chunk_batch(self, documents):
        return []


def test_registry_registration_and_lookup():
    ComponentRegistry.reset()
    
    # Check empty registry
    with pytest.raises(KeyError):
        ComponentRegistry.get("parser", "dummy")

    # Register DummyParser
    decorated = ComponentRegistry.register("parser", "dummy")(DummyParser)
    assert decorated is DummyParser
    
    # Lookup DummyParser
    retrieved = ComponentRegistry.get("parser", "dummy")
    assert retrieved is DummyParser


def test_registry_invalid_component_type():
    with pytest.raises(ValueError, match="Unknown component type"):
        @ComponentRegistry.register("invalid_type", "dummy")
        class InvalidComponent:
            pass


def test_registry_invalid_subclass():
    with pytest.raises(TypeError, match="must be a subclass of BaseParser"):
        @ComponentRegistry.register("parser", "invalid_subclass")
        class NotAParser:
            pass


def test_registry_list_providers():
    ComponentRegistry.reset()
    ComponentRegistry.register("parser", "dummy1")(DummyParser)
    ComponentRegistry.register("parser", "dummy2")(DummyParser)
    
    providers = ComponentRegistry.list_providers("parser")
    assert providers == ["dummy1", "dummy2"]
    
    with pytest.raises(KeyError):
        ComponentRegistry.list_providers("invalid_type")


def test_registry_list_all():
    ComponentRegistry.reset()
    ComponentRegistry.register("parser", "dummy_parser")(DummyParser)
    ComponentRegistry.register("chunker", "dummy_chunker")(DummyChunker)
    
    all_components = ComponentRegistry.list_all()
    assert "dummy_parser" in all_components["parser"]
    assert "dummy_chunker" in all_components["chunker"]


def test_registry_discover_idempotent():
    # Calling discover should not crash and should register implementations
    ComponentRegistry.reset()
    ComponentRegistry.discover()
    assert ComponentRegistry._discovered is True
    
    # Reset and check that discover works again
    ComponentRegistry.reset()
    assert ComponentRegistry._discovered is False
    ComponentRegistry.discover()
    assert ComponentRegistry._discovered is True
