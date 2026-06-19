"""Llama Guard safety validation guardrail.

Uses an OpenAI-compatible API to run safety evaluation prompts against
Llama Guard models (e.g. Llama-Guard-3-8B).
"""

from __future__ import annotations

from typing import Any

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..core.interfaces import BaseGuardrail
from ..core.registry import ComponentRegistry
from ..core.types import GuardrailResult, LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)

# Standard Llama Guard categories and definitions
CATEGORIES = {
    "S1": "Violent Crimes",
    "S2": "Non-Violent Crimes",
    "S3": "Sex-Related Crimes",
    "S4": "Child Sexual Exploitation",
    "S5": "Defamation",
    "S6": "Cyberattacks",
    "S7": "CBRN Weapons (Chemical, Biological, Radiological, or Nuclear)",
    "S8": "Suicide or Self-Harm",
    "S9": "Cyberattacks (legacy)",
    "S10": "Sexual Content",
    "S11": "Harassment",
    "S12": "Financial/Property Crimes",
    "S13": "Privacy Violations",
}

DEFAULT_PROMPT_TEMPLATE = """Task: Objective: Determine whether a user query or model response is safe.

Review the safety categories below and determine if the input text violates any of them.

<BEGIN UNSAFE CONTENT CATEGORIES>
S1: Violent Crimes.
S2: Non-Violent Crimes.
S3: Sex-Related Crimes.
S4: Child Sexual Exploitation.
S5: Defamation.
S6: Cyberattacks.
S7: Chemical, Biological, Radiological, or Nuclear (CBRN) Weapons or Dangerous Materials.
S8: Suicide or Self-Harm.
S9: Cyberattacks (legacy).
S10: Sexual Content.
S11: Harassment.
S12: Financial/Property Crimes.
S13: Privacy Violations.
<END UNSAFE CONTENT CATEGORIES>

Task: Determine if the Input below is safe or unsafe.

{input_section}

Provide your response in the format:
[safe/unsafe]
[comma-separated list of unsafe category codes if unsafe, e.g., S1, S5]

Response:"""


@ComponentRegistry.register("guardrail", "llama_guard")
class LlamaGuard(BaseGuardrail):
    """Llama Guard safety moderator.

    Connects to any hosted or local inference server (e.g. Together AI,
    vLLM, Ollama, OpenAI) running a Llama Guard model.
    """

    def __init__(
        self,
        model: str = "meta-llama/Llama-Guard-3-8B",
        api_key: str | None = None,
        base_url: str | None = None,
        max_retries: int = 3,
        temperature: float = 0.0,
        max_tokens: int = 64,
        prompt_template: str = DEFAULT_PROMPT_TEMPLATE,
        **kwargs: Any,
    ) -> None:
        """Initialize Llama Guard.

        Args:
            model: Model identifier.
            api_key: Optional API key.
            base_url: Optional API endpoint base URL.
            max_retries: Maximum call retries on failures.
            temperature: Sampling temperature (normally 0.0 for safety check).
            max_tokens: Maximum completion tokens.
            prompt_template: Custom prompt template.
            **kwargs: Extra parameters.
        """
        self._model = model
        self._api_key = api_key
        self._base_url = base_url
        self._max_retries = max_retries
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._prompt_template = prompt_template
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialize AsyncOpenAI client."""
        if self._client is None:
            from openai import AsyncOpenAI

            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = AsyncOpenAI(**kwargs)
        return self._client

    @trace_operation(LifecycleStage.GUARDRAIL, "llama_guard_validate")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def validate(
        self,
        text: str,
        context: str | None = None,
    ) -> GuardrailResult:
        """Verify the safety of the provided text.

        If context is provided, it classifies the generated response in relation
        to the context (e.g. user query). Otherwise, it evaluates input text directly.
        """
        client = self._get_client()

        # Format input section
        if context:
            input_section = f"Input:\nUser: {context}\nAgent: {text}"
        else:
            input_section = f"Input:\nUser: {text}"

        prompt = self._prompt_template.format(input_section=input_section)

        try:
            logger.info("llama_guard_check_start", model=self._model, text_len=len(text))
            
            response = await client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                temperature=self._temperature,
                max_tokens=self._max_tokens,
            )
            
            content = (response.choices[0].message.content or "").strip().lower()
            logger.debug("llama_guard_raw_response", content=content)

            lines = [line.strip() for line in content.split("\n") if line.strip()]
            if not lines:
                return GuardrailResult(is_safe=True)

            status = lines[0]
            if "unsafe" in status:
                categories = []
                category_names = []
                if len(lines) > 1:
                    raw_codes = [c.strip().upper() for c in lines[1].replace(",", " ").split()]
                    for code in raw_codes:
                        if code in CATEGORIES:
                            categories.append(code)
                            category_names.append(CATEGORIES[code])
                        else:
                            categories.append(code)
                            category_names.append("Unknown category")
                
                violation_category = ", ".join(categories) if categories else "UNSPECIFIED"
                explanation = "Violated safety guidelines: " + ", ".join(category_names) if category_names else "Unsafe content detected."

                logger.warn(
                    "llama_guard_safety_violation",
                    violation_category=violation_category,
                    explanation=explanation,
                )
                return GuardrailResult(
                    is_safe=False,
                    violation_category=violation_category,
                    explanation=explanation,
                    confidence=1.0,
                )

            return GuardrailResult(is_safe=True, confidence=1.0)

        except Exception as exc:
            logger.error("llama_guard_check_failed", error=str(exc))
            # Safe default / transparent error depending on policy.
            # Here we raise the error so retries can occur or the pipeline knows there's an infrastructure issue.
            raise exc

    async def close(self) -> None:
        """Close OpenAI client connections."""
        if self._client is not None:
            await self._client.close()
            self._client = None
