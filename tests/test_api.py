from unittest import IsolatedAsyncioTestCase

import httpx

from subnet_design.api import app


class ApiTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        )
        self.payload = {
            "parent_cidr": "10.44.0.0/21",
            "strategy": "BOTH",
            "demands": [
                {"name": "Engineering", "hosts": 500, "vlan_id": 10},
                {"name": "Computer Lab", "hosts": 120, "vlan_id": 20},
                {"name": "Administration", "hosts": 50, "vlan_id": 30},
                {"name": "Point-to-point", "hosts": 2, "vlan_id": 40},
            ],
        }

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_health_endpoint(self):
        response = await self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    async def test_local_frontend_cors_preflight_is_allowed(self):
        response = await self.client.options(
            "/api/v1/subnets/calculate",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")
        self.assertNotIn("access-control-allow-credentials", response.headers)

    async def test_unconfigured_frontend_origin_is_not_allowed(self):
        response = await self.client.options(
            "/api/v1/subnets/calculate",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertNotIn("access-control-allow-origin", response.headers)

    async def test_calculation_endpoint_compares_both_strategies(self):
        response = await self.client.post("/api/v1/subnets/calculate", json=self.payload)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["comparison"]["address_savings_with_vlsm"], 1340)
        self.assertIn("allocation_efficiency_pct", body["vlsm"]["summary"])
        self.assertIn("network_address", body["vlsm"]["subnets"][0])

    async def test_invalid_parent_returns_clear_validation_error(self):
        self.payload["parent_cidr"] = "10.44.0.1/21"
        response = await self.client.post("/api/v1/subnets/calculate", json=self.payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn("Invalid network", response.json()["detail"])

    async def test_unknown_request_fields_are_rejected(self):
        self.payload["unexpected"] = "typo"
        response = await self.client.post("/api/v1/subnets/calculate", json=self.payload)
        self.assertEqual(response.status_code, 422)

    async def test_config_endpoint_returns_reviewable_ios_example(self):
        response = await self.client.post(
            "/api/v1/config/cisco-ios",
            json={**self.payload, "strategy": "VLSM"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["format"], "cisco-ios")
        self.assertIn("Review interface names", body["configuration"])
        self.assertIn("interface GigabitEthernet0/0.10", body["configuration"])


if __name__ == "__main__":
    import unittest

    unittest.main()