"""FastAPI endpoints for subnet calculation and network configuration export."""

from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from subnet_design.config import generate_cisco_ios_config
from subnet_design.engine import HostDemand, allocate_flsm, allocate_vlsm, compare_strategies


class DemandInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=48)
    hosts: int = Field(ge=1, le=4_294_967_294)
    vlan_id: int | None = Field(default=None, ge=1, le=4094)


class DesignInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    parent_cidr: str = "10.44.0.0/21"
    strategy: Literal["FLSM", "VLSM", "BOTH"] = "BOTH"
    demands: list[DemandInput] = Field(min_length=1, max_length=256)


class ConfigInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    parent_cidr: str = "10.44.0.0/21"
    strategy: Literal["FLSM", "VLSM"] = "VLSM"
    demands: list[DemandInput] = Field(min_length=1, max_length=256)


class SubnetResult(BaseModel):
    name: str
    vlan_id: int | None
    network: str
    network_address: str
    first_host: str
    last_host: str
    broadcast_address: str
    prefix_length: int
    subnet_mask: str
    total_addresses: int
    usable_hosts: int
    requested_hosts: int
    usable_host_waste: int


class AllocationSummary(BaseModel):
    parent_network: str
    pool_addresses: int
    allocated_addresses: int
    unallocated_addresses: int
    requested_hosts: int
    assigned_usable_hosts: int
    usable_host_waste: int
    allocation_efficiency_pct: float
    pool_coverage_pct: float


class AllocationResult(BaseModel):
    strategy: Literal["FLSM", "VLSM"]
    subnets: list[SubnetResult]
    summary: AllocationSummary


class ComparisonMetrics(BaseModel):
    address_savings_with_vlsm: int
    usable_host_waste_reduction_with_vlsm: int
    usable_host_waste_reduction_pct: float


class ComparisonResult(BaseModel):
    parent_network: str
    demand_count: int
    flsm: AllocationResult
    vlsm: AllocationResult
    comparison: ComparisonMetrics


class ConfigResult(BaseModel):
    format: Literal["cisco-ios"]
    configuration: str


app = FastAPI(
    title="Automatic IPv4 Subnet Calculator and Network Designer",
    description="Plan IPv4 subnets, compare FLSM and VLSM utilization, and export reviewable Cisco IOS snippets.",
    version="1.0.0",
)

default_cors_origins = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)
configured_cors_origins = tuple(
    origin.strip().rstrip("/")
    for origin in os.getenv("SUBNET_DESIGN_CORS_ORIGINS", ",".join(default_cors_origins)).split(",")
    if origin.strip()
)
if "*" in configured_cors_origins:
    raise RuntimeError("Wildcard CORS origins are not allowed; configure explicit web origins")

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _host_demands(inputs: list[DemandInput]) -> list[HostDemand]:
    return [HostDemand(item.name, item.hosts, item.vlan_id) for item in inputs]


@app.get("/api/v1/health", tags=["System"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/v1/subnets/calculate",
    tags=["Subnet design"],
    response_model=AllocationResult | ComparisonResult,
)
def calculate_subnets(request: DesignInput) -> AllocationResult | ComparisonResult:
    demands = _host_demands(request.demands)
    try:
        if request.strategy == "BOTH":
            return compare_strategies(request.parent_cidr, demands)
        allocator = allocate_flsm if request.strategy == "FLSM" else allocate_vlsm
        return allocator(request.parent_cidr, demands)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post(
    "/api/v1/config/cisco-ios",
    tags=["Configuration export"],
    response_model=ConfigResult,
)
def export_cisco_config(request: ConfigInput) -> ConfigResult:
    demands = _host_demands(request.demands)
    try:
        allocator = allocate_flsm if request.strategy == "FLSM" else allocate_vlsm
        allocation = allocator(request.parent_cidr, demands)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return ConfigResult(format="cisco-ios", configuration=generate_cisco_ios_config(allocation))