"""
voice_agent/fastapi_client.py

Client interface to the canonical FastAPI clinical backend.
Sends transcribed patient speech to POST /intake/turn.
Never fabricates clinical questions or results.
"""

import httpx
from typing import Optional, Dict, Any
from .config import config

class FastApiClient:
    """Dispatches patient turns to FastAPI /intake/turn."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or config.fastapi_base_url).rstrip("/")

    async def submit_turn(
        self,
        session_id: str,
        encounter_id: str,
        transcript: str,
        answering_field_name: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sends patient answer to canonical FastAPI POST /intake/turn.
        """
        url = f"{self.base_url}/intake/turn"
        payload = {
            "session_id": session_id,
            "encounter_id": encounter_id,
            "touch_answer": transcript,
            "answering_field_name": answering_field_name,
        }
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def submit_intake(
        self,
        session_id: str,
        encounter_id: str,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Finalizes intake via POST /intake/submit.
        """
        url = f"{self.base_url}/intake/submit"
        payload = {
            "session_id": session_id,
            "encounter_id": encounter_id,
        }
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

fastapi_client = FastApiClient()
FastAPIClient = FastApiClient
