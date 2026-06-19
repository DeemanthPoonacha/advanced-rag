import sys
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic import BaseModel
from tests.conftest import mock_openai, mock_anthropic, mock_cohere

import pytest
from rag.llm.openai_llm import OpenAILLM
from rag.llm.anthropic_llm import AnthropicLLM
from rag.llm.cohere_llm import CohereLLM
from rag.llm.local_llm import LocalLLM


# Output schema for structured testing
class MockSchema(BaseModel):
    name: str
    age: int


# Helper class to create async iterators for streaming mock responses
class AsyncIteratorMock:
    def __init__(self, items):
        self.items = items
        self.idx = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.idx >= len(self.items):
            raise StopAsyncIteration
        item = self.items[self.idx]
        self.idx += 1
        return item


@pytest.mark.asyncio
async def test_openai_llm():
    mock_choice = MagicMock()
    mock_choice.message.content = "OpenAI response"
    mock_response = MagicMock(choices=[mock_choice], usage=MagicMock(prompt_tokens=10, completion_tokens=5))

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    mock_client.close = AsyncMock()

    mock_openai.AsyncOpenAI.return_value = mock_client

    llm = OpenAILLM(api_key="fake", system_message="System prompt")
    
    # 1. Test generate
    result = await llm.generate("Hello")
    assert result == "OpenAI response"
    mock_client.chat.completions.create.assert_called_once_with(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "System prompt"},
            {"role": "user", "content": "Hello"}
        ],
        temperature=0.1,
        max_tokens=4096,
        top_p=0.95
    )

    # 2. Test generate_stream
    mock_client.chat.completions.create.reset_mock()
    chunk1 = MagicMock(choices=[MagicMock(delta=MagicMock(content="Hello "))])
    chunk2 = MagicMock(choices=[MagicMock(delta=MagicMock(content="world"))])
    stream_mock = AsyncIteratorMock([chunk1, chunk2])
    mock_client.chat.completions.create.return_value = stream_mock
    
    stream_results = []
    async for tok in llm.generate_stream("Hello"):
        stream_results.append(tok)
    
    assert "".join(stream_results) == "Hello world"
    mock_client.chat.completions.create.assert_called_once_with(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "System prompt"},
            {"role": "user", "content": "Hello"}
        ],
        temperature=0.1,
        max_tokens=4096,
        top_p=0.95,
        stream=True
    )

    # 3. Test generate_structured
    mock_client.chat.completions.create.reset_mock()
    mock_choice.message.content = '{"name": "Alice", "age": 30}'
    mock_client.chat.completions.create.return_value = mock_response
    
    struct_result = await llm.generate_structured("Get person", MockSchema)
    assert isinstance(struct_result, MockSchema)
    assert struct_result.name == "Alice"
    assert struct_result.age == 30
    
    # Test close
    await llm.close()
    mock_client.close.assert_called_once()


@pytest.mark.asyncio
async def test_anthropic_llm():
    mock_block = MagicMock()
    mock_block.text = "Anthropic response"
    mock_response = MagicMock(content=[mock_block], usage=MagicMock(input_tokens=10, output_tokens=5))

    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)
    mock_client.close = AsyncMock()

    mock_anthropic.AsyncAnthropic.return_value = mock_client

    llm = AnthropicLLM(api_key="fake", system_message="System prompt")

    # 1. Test generate
    result = await llm.generate("Hello")
    assert result == "Anthropic response"
    mock_client.messages.create.assert_called_once_with(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        temperature=0.1,
        top_p=0.95,
        messages=[{"role": "user", "content": "Hello"}],
        system="System prompt"
    )

    # 2. Test generate_stream
    mock_client.messages.stream = MagicMock()
    # Mock stream context manager
    stream_cm = AsyncMock()
    stream_cm.text_stream = AsyncIteratorMock(["Hello ", "world"])
    mock_client.messages.stream.return_value.__aenter__ = AsyncMock(return_value=stream_cm)
    mock_client.messages.stream.return_value.__aexit__ = AsyncMock()
    
    stream_results = []
    async for tok in llm.generate_stream("Hello"):
        stream_results.append(tok)
        
    assert "".join(stream_results) == "Hello world"

    # 3. Test generate_structured
    mock_client.messages.create.reset_mock()
    mock_block.text = '{"name": "Bob", "age": 25}'
    mock_client.messages.create.return_value = mock_response
    
    struct_result = await llm.generate_structured("Get person", MockSchema)
    assert isinstance(struct_result, MockSchema)
    assert struct_result.name == "Bob"
    assert struct_result.age == 25


@pytest.mark.asyncio
async def test_cohere_llm():
    mock_block = MagicMock()
    mock_block.text = "Cohere response"
    mock_response = MagicMock()
    mock_response.message = MagicMock(content=[mock_block])
    mock_response.usage = MagicMock()

    mock_client = MagicMock()
    mock_client.chat = AsyncMock(return_value=mock_response)
    mock_client.close = AsyncMock()

    mock_cohere.AsyncClientV2.return_value = mock_client

    llm = CohereLLM(api_key="fake", preamble="System prompt")

    # 1. Test generate
    result = await llm.generate("Hello")
    assert result == "Cohere response"
    mock_client.chat.assert_called_once_with(
        model="command-r-plus",
        messages=[
            {"role": "system", "content": "System prompt"},
            {"role": "user", "content": "Hello"}
        ],
        temperature=0.1,
        max_tokens=4096,
        p=0.95
    )

    # 2. Test generate_stream
    event1 = MagicMock(type="content-delta")
    event1.delta.message.content.text = "Hello "
    event2 = MagicMock(type="content-delta")
    event2.delta.message.content.text = "world"
    stream_mock = AsyncIteratorMock([event1, event2])
    mock_client.chat_stream.return_value = stream_mock

    stream_results = []
    async for tok in llm.generate_stream("Hello"):
        stream_results.append(tok)
        
    assert "".join(stream_results) == "Hello world"
    mock_client.chat_stream.assert_called_once_with(
        model="command-r-plus",
        messages=[
            {"role": "system", "content": "System prompt"},
            {"role": "user", "content": "Hello"}
        ],
        temperature=0.1,
        max_tokens=4096
    )

    # 3. Test generate_structured
    mock_client.chat.reset_mock()
    mock_block.text = '{"name": "Charlie", "age": 40}'
    mock_client.chat.return_value = mock_response
    
    struct_result = await llm.generate_structured("Get person", MockSchema)
    assert isinstance(struct_result, MockSchema)
    assert struct_result.name == "Charlie"
    assert struct_result.age == 40


@pytest.mark.asyncio
async def test_local_llm():
    # LocalLLM uses HTTP POST requests to local model endpoints via httpx
    # We will mock the httpx post and stream requests
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "choices": [
            {"message": {"content": "Local response"}}
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5}
    }
    mock_response.raise_for_status = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.aclose = AsyncMock()

    llm = LocalLLM(base_url="http://localhost:11434/v1", model="llama3", system_message="System prompt")
    llm._client = mock_client

    # 1. Test generate
    result = await llm.generate("Hello")
    assert result == "Local response"
    mock_client.post.assert_called_once_with(
        "/chat/completions",
        json={
            "model": "llama3",
            "messages": [
                {"role": "system", "content": "System prompt"},
                {"role": "user", "content": "Hello"}
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "top_p": 0.95,
            "stream": False
        }
    )

    # 2. Test generate_stream
    mock_client.stream = MagicMock()
    # Mock context manager for httpx.stream
    stream_cm = AsyncMock()
    stream_cm.aiter_lines = MagicMock(return_value=AsyncIteratorMock([
        'data: {"choices": [{"delta": {"content": "Hello "}}]}',
        'data: {"choices": [{"delta": {"content": "world"}}]}',
        'data: [DONE]'
    ]))
    stream_cm.raise_for_status = MagicMock()
    mock_client.stream.return_value.__aenter__ = AsyncMock(return_value=stream_cm)
    mock_client.stream.return_value.__aexit__ = AsyncMock()

    stream_results = []
    async for tok in llm.generate_stream("Hello"):
        stream_results.append(tok)
        
    assert "".join(stream_results) == "Hello world"
    mock_client.stream.assert_called_once_with(
        "POST", "/chat/completions",
        json={
            "model": "llama3",
            "messages": [
                {"role": "system", "content": "System prompt"},
                {"role": "user", "content": "Hello"}
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "stream": True
        }
    )

    # 3. Test generate_structured
    mock_client.post.reset_mock()
    mock_response.json.return_value = {
        "choices": [
            {"message": {"content": '```json\n{"name": "Dan", "age": 35}\n```'}}
        ],
        "usage": {}
    }
    struct_result = await llm.generate_structured("Get person", MockSchema)
    assert isinstance(struct_result, MockSchema)
    assert struct_result.name == "Dan"
    assert struct_result.age == 35

    # Test close
    await llm.close()
    mock_client.aclose.assert_called_once()
