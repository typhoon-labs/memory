"""Compatibility with kagent's Python STS client, agentsts-core 1.0.0a16.

The service runs on 127.0.0.1, port 0, and the client finds the token
endpoint from the metadata, as it does in a kagent agent.
"""

from __future__ import annotations

import pytest
from agentsts.core import STSClient, STSConfig, STSIntegrationBase, TokenType
from agentsts.core.client import TokenExchangeError
from conftest import AUDIENCE, CHAT, REMEDIATION, unverified


async def test_sts_client_both_hops(chain_sts, user_token, sa_token):
    user = user_token("platform-engineer")
    client = STSClient(STSConfig(well_known_uri=chain_sts.well_known))
    try:
        first = await client.exchange_token(
            subject_token=user,
            subject_token_type=TokenType.JWT,
            actor_token=sa_token("chat-assistant"),
            actor_token_type=TokenType.JWT,
            audience=[AUDIENCE],
        )
        second = await client.exchange_token(
            subject_token=first.access_token,
            subject_token_type=TokenType.JWT,
            actor_token=sa_token("remediation-agent"),
            actor_token_type=TokenType.JWT,
            audience=[AUDIENCE],
        )
    finally:
        await client.close()

    assert first.issued_token_type is TokenType.ACCESS_TOKEN
    assert second.issued_token_type is TokenType.ACCESS_TOKEN
    assert second.token_type == "Bearer"
    assert 0 < second.expires_in <= 300
    claims = chain_sts.verify_like_gateway(second.access_token)
    assert claims["sub"] == unverified(user)["sub"]
    assert claims["act"] == {
        "sub": REMEDIATION,
        "client_id": "remediation-agent",
        "act": {"sub": CHAT, "client_id": "chat-assistant"},
    }


async def test_integration_base_as_the_adk_plugin_calls_it(
    chain_sts, user_token, sa_token, tmp_path
):
    # The agent's projected token, read from a file by agentsts's ActorTokenService.
    actor = sa_token("chat-assistant")
    token_file = tmp_path / "token"
    token_file.write_text(actor + "\n")
    integration = STSIntegrationBase(
        chain_sts.well_known, service_account_token_path=str(token_file)
    )
    assert integration._actor_token == actor
    user = user_token("incident-manager")
    try:
        # As ADKTokenPropagationPlugin does, with no audience or resource configured.
        access_token = await integration.exchange_token(
            subject_token=user,
            subject_token_type=TokenType.JWT,
            actor_token=integration._actor_token,
            actor_token_type=TokenType.JWT,
            resource=None,
            audience=None,
        )
    finally:
        await integration.sts_client.close()

    claims = chain_sts.verify_like_gateway(access_token)
    assert claims["preferred_username"] == "incident-manager"
    assert claims["aud"] == AUDIENCE
    assert claims["act"] == {"sub": CHAT, "client_id": "chat-assistant"}


async def test_refusal_is_a_token_exchange_error(chain_sts, user_token, sa_token):
    client = STSClient(STSConfig(well_known_uri=chain_sts.well_known))
    try:
        with pytest.raises(TokenExchangeError) as raised:
            await client.exchange_token(
                subject_token=user_token("platform-engineer"),
                subject_token_type=TokenType.JWT,
                actor_token=sa_token("remediation-agent"),
                actor_token_type=TokenType.JWT,
            )
    finally:
        await client.close()
    assert raised.value.error == "unauthorized_client"
    assert raised.value.status_code == 400
    assert "user's own token" in raised.value.error_description
