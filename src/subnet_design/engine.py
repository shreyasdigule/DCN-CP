"""IPv4 subnet allocation and address-utilization analysis."""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class HostDemand:
    name: str
    hosts: int
    vlan_id: int | None = None


def _network(value: str) -> ipaddress.IPv4Network:
    try:
        network = ipaddress.ip_network(value, strict=True)
    except ValueError as error:
        raise ValueError(f"Invalid network '{value}': {error}") from error
    if not isinstance(network, ipaddress.IPv4Network):
        raise ValueError("Only IPv4 networks are supported")
    return network


def _validate_demands(demands: Iterable[HostDemand]) -> list[HostDemand]:
    normalized = list(demands)
    if not normalized:
        raise ValueError("At least one host demand is required")
    names: set[str] = set()
    vlan_ids: set[int] = set()
    for demand in normalized:
        if not demand.name.strip():
            raise ValueError("Subnet names cannot be empty")
        normalized_name = demand.name.casefold()
        if normalized_name in names:
            raise ValueError(f"Duplicate subnet name '{demand.name}'")
        if demand.hosts < 1:
            raise ValueError(f"Host demand for '{demand.name}' must be positive")
        if demand.vlan_id is not None and not 1 <= demand.vlan_id <= 4094:
            raise ValueError(f"VLAN ID for '{demand.name}' must be between 1 and 4094")
        if demand.vlan_id is not None and demand.vlan_id in vlan_ids:
            raise ValueError(f"Duplicate VLAN ID {demand.vlan_id}")
        names.add(normalized_name)
        if demand.vlan_id is not None:
            vlan_ids.add(demand.vlan_id)
    return normalized


def _prefix_for_hosts(hosts: int) -> int:
    host_bits = max(2, (hosts + 1).bit_length())
    return 32 - host_bits


def _subnet_record(network: ipaddress.IPv4Network, demand: HostDemand) -> dict[str, object]:
    return {
        "name": demand.name,
        "vlan_id": demand.vlan_id,
        "network": str(network),
        "network_address": str(network.network_address),
        "first_host": str(network.network_address + 1),
        "last_host": str(network.broadcast_address - 1),
        "broadcast_address": str(network.broadcast_address),
        "prefix_length": network.prefixlen,
        "subnet_mask": str(network.netmask),
        "total_addresses": network.num_addresses,
        "usable_hosts": network.num_addresses - 2,
        "requested_hosts": demand.hosts,
        "usable_host_waste": network.num_addresses - 2 - demand.hosts,
    }


def _summarize(parent: ipaddress.IPv4Network, subnets: list[dict[str, object]]) -> dict[str, object]:
    allocated = sum(int(subnet["total_addresses"]) for subnet in subnets)
    capacity = sum(int(subnet["usable_hosts"]) for subnet in subnets)
    requested = sum(int(subnet["requested_hosts"]) for subnet in subnets)
    return {
        "parent_network": str(parent),
        "pool_addresses": parent.num_addresses,
        "allocated_addresses": allocated,
        "unallocated_addresses": parent.num_addresses - allocated,
        "requested_hosts": requested,
        "assigned_usable_hosts": capacity,
        "usable_host_waste": capacity - requested,
        "allocation_efficiency_pct": round(requested / capacity * 100, 2),
        "pool_coverage_pct": round(allocated / parent.num_addresses * 100, 2),
    }


def allocate_vlsm(parent_cidr: str, demands: Iterable[HostDemand]) -> dict[str, object]:
    """Allocate smallest suitable blocks, placing the largest demand first."""
    parent = _network(parent_cidr)
    normalized = _validate_demands(demands)
    ordered = sorted(normalized, key=lambda item: (_prefix_for_hosts(item.hosts), item.name.casefold()))
    next_address = int(parent.network_address)
    parent_end = int(parent.broadcast_address) + 1
    records: list[dict[str, object]] = []

    for demand in ordered:
        prefix = _prefix_for_hosts(demand.hosts)
        block_size = 1 << (32 - prefix)
        start = ((next_address + block_size - 1) // block_size) * block_size
        end = start + block_size
        if end > parent_end:
            raise ValueError(f"Host demands do not fit inside {parent} (failed at '{demand.name}')")
        subnet = ipaddress.ip_network((start, prefix))
        records.append(_subnet_record(subnet, demand))
        next_address = end

    return {"strategy": "VLSM", "subnets": records, "summary": _summarize(parent, records)}


def allocate_flsm(parent_cidr: str, demands: Iterable[HostDemand]) -> dict[str, object]:
    """Allocate equal-sized subnets sized for the largest host demand."""
    parent = _network(parent_cidr)
    normalized = _validate_demands(demands)
    prefix = _prefix_for_hosts(max(demand.hosts for demand in normalized))
    if prefix < parent.prefixlen:
        raise ValueError(f"Host demands do not fit inside {parent} using FLSM")

    records: list[dict[str, object]] = []
    available = parent.subnets(new_prefix=prefix)
    for demand in normalized:
        try:
            subnet = next(available)
        except StopIteration as error:
            raise ValueError(f"Host demands do not fit inside {parent} using FLSM") from error
        records.append(_subnet_record(subnet, demand))

    return {"strategy": "FLSM", "subnets": records, "summary": _summarize(parent, records)}


def compare_strategies(parent_cidr: str, demands: Iterable[HostDemand]) -> dict[str, object]:
    """Compare fixed- and variable-length subnetting for identical demands."""
    normalized = _validate_demands(demands)
    flsm = allocate_flsm(parent_cidr, normalized)
    vlsm = allocate_vlsm(parent_cidr, normalized)
    flsm_summary = flsm["summary"]
    vlsm_summary = vlsm["summary"]
    flsm_waste = int(flsm_summary["usable_host_waste"])
    vlsm_waste = int(vlsm_summary["usable_host_waste"])
    return {
        "parent_network": str(_network(parent_cidr)),
        "demand_count": len(normalized),
        "flsm": flsm,
        "vlsm": vlsm,
        "comparison": {
            "address_savings_with_vlsm": int(flsm_summary["allocated_addresses"])
            - int(vlsm_summary["allocated_addresses"]),
            "usable_host_waste_reduction_with_vlsm": flsm_waste - vlsm_waste,
            "usable_host_waste_reduction_pct": round(
                (flsm_waste - vlsm_waste) / flsm_waste * 100, 2
            )
            if flsm_waste
            else 0.0,
        },
    }