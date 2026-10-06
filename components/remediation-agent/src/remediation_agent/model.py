"""The one thing the model does here: phrase a result that code has already established.

The model endpoint is called with the caller's bearer token, so the gateway
attributes the usage to the user. No provider key exists in this process; the
client is given the token explicitly, which also stops the Anthropic SDK from
reading ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN from the environment.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from strands import Agent
from strands.models.anthropic import AnthropicModel

from .config import SERVICE_NAME, Settings

DESCRIPTION = (
    "Applies an approved change as the caller, follows it until it is verified or has"
    " failed, and reports the result."
)

SYSTEM_PROMPT = (
    "You report the outcome of an operational change to the engineers handling an incident."
    " You are given facts as JSON. Write exactly two plain sentences that state what was done"
    " and what the verification showed. Use only the facts given; do not add causes, advice or"
    " reassurance. No markdown, no lists, no preamble."
)

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")


def build_agent(settings: Settings, token: str) -> Agent:
    """A Strands agent with no tools, whose model calls carry ``token``."""
    model = AnthropicModel(
        client_args={
            "base_url": settings.model_base_url,
            # Sent as "Authorization: Bearer <token>". The SDK adds
            # "anthropic-version: 2023-06-01" itself.
            "auth_token": token,
            "timeout": settings.model_timeout_seconds,
            # No retry inside the SDK: phrase_result gives the call one deadline.
            "max_retries": 0,
        },
        model_id=settings.model_id_fast,
        max_tokens=160,
    )
    return Agent(
        model=model,
        name=SERVICE_NAME,
        description=DESCRIPTION,
        system_prompt=SYSTEM_PROMPT,
        tools=[],
        callback_handler=None,
        # No retry by Strands either. Its default answers a throttled model (429) by
        # backing off for 4, 8, 16, 32 and 64 seconds before it gives up.
        retry_strategy=None,
    )


def two_sentences(text: str) -> str:
    """At most the first two sentences of ``text``, on one line."""
    flat = " ".join(text.split())
    return " ".join(_SENTENCE_END.split(flat)[:2])


async def phrase_result(settings: Settings, token: str, facts: dict[str, Any]) -> str:
    """Two sentences for ``facts``, from the fast model, called as the caller.

    The whole call has one deadline, ``MODEL_TIMEOUT_SECONDS``: connecting, the
    answer, and reading it to the end. There is one attempt: neither the SDK nor
    Strands retries, so a model that is down or throttled fails at once and a
    model that is slow fails at the deadline.
    Raises ``TimeoutError`` at the deadline; the caller then uses the template.
    """
    agent = build_agent(settings, token)
    try:
        async with asyncio.timeout(settings.model_timeout_seconds):
            result = await agent.invoke_async("Facts:\n" + json.dumps(facts, indent=2))
    finally:
        await agent.model.client.close()  # type: ignore[union-attr]
    text = two_sentences(str(result))
    if not text:
        raise ValueError("the model returned no text")
    return text


def template_result(facts: dict[str, Any]) -> str:
    """The same two sentences without a model, for when the model call fails."""
    change = f"Change {facts['change_id']}"
    target = f"{facts['service']} to version {facts['target_version']}"
    if facts["status"] == "applied":
        return (
            f"{change} was applied by {facts['applied_by']}, returning {target}."
            f" Verification: {facts['detail']}."
        )
    return (
        f"{change}, which would return {target}, ended as {facts['status']}."
        f" Detail: {facts['detail']}."
    )
