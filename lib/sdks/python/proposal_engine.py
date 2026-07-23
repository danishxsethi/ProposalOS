"""
Proposal Engine Python SDK
Requirements: 9.6
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError


class ProposalEngineError(Exception):
    def __init__(self, status_code: int, message: str, details: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class _Resource:
    def __init__(self, client: "ProposalEngineClient"):
        self._client = client


class AuditsResource(_Resource):
    def create(
        self,
        business_name: str,
        business_url: str,
        city: Optional[str] = None,
        industry: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._client._request(
            "POST",
            "/audits",
            {
                "businessName": business_name,
                "businessUrl": business_url,
                **({"city": city} if city else {}),
                **({"industry": industry} if industry else {}),
            },
        )

    def get(self, audit_id: str) -> Dict[str, Any]:
        return self._client._request("GET", f"/audits/{audit_id}")

    def get_findings(self, audit_id: str) -> Dict[str, Any]:
        return self._client._request("GET", f"/audits/{audit_id}/findings")

    def get_proposal(self, audit_id: str) -> Dict[str, Any]:
        return self._client._request("GET", f"/audits/{audit_id}/proposal")


class ClientsResource(_Resource):
    def list(self, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        return self._client._request("GET", f"/clients?page={page}&limit={limit}")

    def get(self, client_id: str) -> Dict[str, Any]:
        return self._client._request("GET", f"/clients/{client_id}")


class OutreachResource(_Resource):
    def trigger(self, lead_id: str) -> Dict[str, Any]:
        return self._client._request("POST", f"/outreach/{lead_id}")


class WebhooksResource(_Resource):
    def register(self, url: str, events: List[str]) -> Dict[str, Any]:
        return self._client._request("POST", "/webhooks", {"url": url, "events": events})

    def list(self) -> Dict[str, Any]:
        return self._client._request("GET", "/webhooks")

    def delete(self, webhook_id: str) -> None:
        self._client._request("DELETE", f"/webhooks/{webhook_id}")


class ProposalEngineClient:
    """
    Proposal Engine API client.

    Usage::

        client = ProposalEngineClient(api_key="pe_pub_your_key_here")
        audit = client.audits.create(
            business_name="Acme Dental",
            business_url="https://acmedental.com",
        )
        print(audit["id"], audit["status"])
    """

    def __init__(self, api_key: str, base_url: str = ""):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/") + "/api/v1"
        self.audits = AuditsResource(self)
        self.clients = ClientsResource(self)
        self.outreach = OutreachResource(self)
        self.webhooks = WebhooksResource(self)

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(req, timeout=30) as resp:
                if resp.status == 204:
                    return None
                return json.loads(resp.read())
        except HTTPError as e:
            error_body = {}
            try:
                error_body = json.loads(e.read())
            except Exception:
                pass
            raise ProposalEngineError(
                e.code,
                error_body.get("error", str(e)),
                error_body.get("message"),
            ) from e
