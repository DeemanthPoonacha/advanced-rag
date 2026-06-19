import os
import pytest
import yaml
from pathlib import Path
from pydantic import ValidationError
from rag.config.loader import load_config, load_config_from_dict, _resolve_env_vars
from rag.config.schema import PipelineConfig


def test_resolve_env_vars():
    # Setup env
    os.environ["TEST_ENV_VAR"] = "production"
    os.environ["TEST_PORT"] = "1234"
    
    # 1. Simple var
    assert _resolve_env_vars("${TEST_ENV_VAR}") == "production"
    
    # 2. Var with default, present in env
    assert _resolve_env_vars("${TEST_ENV_VAR:-development}") == "production"
    
    # 3. Var with default, absent in env
    assert _resolve_env_vars("${ABSENT_VAR:-development}") == "development"
    
    # 4. Nested structures
    data = {
        "env": "${TEST_ENV_VAR}",
        "port": "${TEST_PORT:-9090}",
        "other": ["${ABSENT_VAR:-some_default}", 42]
    }
    resolved = _resolve_env_vars(data)
    assert resolved == {
        "env": "production",
        "port": "1234",
        "other": ["some_default", 42]
    }


def test_load_config_from_dict():
    raw_dict = {
        "project": {
            "name": "test-pipeline",
            "environment": "development"
        },
        "observability": {
            "logging": {
                "level": "DEBUG",
                "format": "text"
            }
        },
        "ingestion": {
            "parser": {"provider": "unstructured"},
            "chunker": {"provider": "semantic"}
        },
        "embeddings": {
            "provider": "openai",
            "config": {"model": "text-embedding-3-small"}
        },
        "llm": {
            "provider": "openai",
            "config": {"model": "gpt-4o-mini"}
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {"url": "http://localhost:6333", "collection_name": "test"}
        },
        "retrieval": {
            "strategy": "simple",
            "top_k": 5
        }
    }
    
    config = load_config_from_dict(raw_dict)
    assert isinstance(config, PipelineConfig)
    assert config.project.name == "test-pipeline"
    assert config.observability.logging.level == "DEBUG"
    assert config.retrieval.top_k == 5


def test_load_config_from_file(tmp_path: Path):
    yaml_content = """
project:
  name: "yaml-pipeline"
  environment: "${ENV_VAR_TEST:-development}"
"""
    config_file = tmp_path / "config.yaml"
    config_file.write_text(yaml_content, encoding="utf-8")
    
    # 1. Default fallback
    config = load_config(config_file)
    assert config.project.name == "yaml-pipeline"
    assert config.project.environment == "development"
    
    # 2. Env override
    os.environ["ENV_VAR_TEST"] = "production"
    config = load_config(config_file)
    assert config.project.environment == "production"


def test_load_config_file_not_found():
    with pytest.raises(FileNotFoundError):
        load_config("non_existent_file.yaml")


def test_load_config_invalid_yaml(tmp_path: Path):
    config_file = tmp_path / "invalid.yaml"
    config_file.write_text("{invalid: yaml: content}", encoding="utf-8")
    with pytest.raises(yaml.YAMLError):
        load_config(config_file)


def test_logging_config_validation():
    # File path validation error when output is file but file_path is null
    raw_dict = {
        "observability": {
            "logging": {
                "output": "file",
                "file_path": None
            }
        }
    }
    with pytest.raises(ValidationError, match="file_path is required"):
        load_config_from_dict(raw_dict)


def test_config_extra_fields_forbidden():
    raw_dict = {
        "extra_field": "not_allowed"
    }
    with pytest.raises(ValidationError):
        load_config_from_dict(raw_dict)
