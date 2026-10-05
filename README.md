# Automatic IPv4 Subnet Calculator and Network Designer

A college Data Communication and Networking project for planning IPv4 subnets, comparing Fixed Length Subnet Masking (FLSM) with Variable Length Subnet Masking (VLSM), and producing reviewable Cisco IOS-style configuration snippets.

The project is API-first so a separately designed Figma frontend can use the same calculation and export endpoints. The interactive API documentation is also a working demonstration interface.

See [Project Requirements and Workflow](docs/PROJECT_REQUIREMENTS.md) for scope, functional requirements, metric definitions, research workflow, and acceptance criteria. Use [the Figma Make prompt](docs/FIGMA_PROMPT.md) to design the frontend; this repository does not implement the UI.

## Features

- Calculate subnet network, mask, prefix, usable host range, broadcast address, and requested-host waste.
- Allocate equal-sized FLSM subnets or largest-first, aligned VLSM subnets within a parent CIDR.
- Compare allocated addresses, remaining pool space, usable capacity, and host-capacity waste.
- Export router subinterface and DHCP-pool snippets for Cisco IOS-style devices.
- Reject invalid CIDRs, duplicate subnet names, impossible host demands, and allocations that do not fit.

## Run Locally

Requires Python 3.11 or later.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
$env:SUBNET_DESIGN_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
uvicorn subnet_design.api:app --reload
```

Open `http://127.0.0.1:8000/docs` to try the endpoints in Swagger UI. The API health endpoint is `GET /api/v1/health`.
The API allows only the configured origins; local Vite preview origins on ports 5173 and 4173 are allowed by default. Set `SUBNET_DESIGN_CORS_ORIGINS` to a comma-separated list of exact origins for another local UI host. Do not use `*`. A hosted Figma preview still needs network access to a reachable backend; CORS cannot make a remote service reach your computer's `localhost`.

Run the reproducible classroom demo in a second terminal:

```powershell
subnet-designer-demo
```

Run tests:

```powershell
pytest
```

## API Examples

`POST /api/v1/subnets/calculate` accepts `FLSM`, `VLSM`, or `BOTH`:

```json
{
  "parent_cidr": "10.44.0.0/21",
  "strategy": "BOTH",
  "demands": [
    {"name": "Engineering", "hosts": 500, "vlan_id": 10},
    {"name": "Computer Lab", "hosts": 120, "vlan_id": 20},
    {"name": "Administration", "hosts": 50, "vlan_id": 30},
    {"name": "Point-to-point", "hosts": 2, "vlan_id": 40}
  ]
}
```

`POST /api/v1/config/cisco-ios` accepts the same parent and demands, with `FLSM` or `VLSM`, and returns a configuration string. The generated text is an educational starting point. Validate interface names, gateway policy, DHCP behavior, and platform syntax before any device use.

## Research Objective and Method

**Objective:** compare address utilization for FLSM and VLSM when both strategies must satisfy the same department host demands inside the same IPv4 parent network.

The included illustrative workload is Engineering (500 hosts), Computer Lab (120), Administration (50), and a point-to-point segment (2), allocated from `10.44.0.0/21` (2,048 total addresses). Replace these assumptions with an explicitly sourced or documented campus scenario for a final report.

The allocator reserves network and broadcast addresses for each subnet, including `/30` for a two-host point-to-point requirement. FLSM sizes every subnet for the largest demand. VLSM rounds each demand up to its smallest fitting block and allocates the largest block first, aligning every network boundary.

Metrics are reported separately:

- **Allocated addresses:** the sum of complete subnet blocks reserved by a strategy.
- **Unallocated pool addresses:** parent-pool addresses not assigned to any subnet.
- **Usable host capacity:** allocated addresses less each subnet's network and broadcast addresses.
- **Usable-host waste:** usable capacity less requested hosts.
- **Allocation efficiency:** requested hosts divided by assigned usable capacity.

For the included workload, FLSM uses four `/23` networks (2,048 addresses, 2,040 usable hosts, 1,368 usable-host addresses above demand). VLSM uses `/23`, `/25`, `/26`, and `/30` blocks (708 addresses, 700 usable hosts, 28 above demand). This example therefore saves 1,340 allocated addresses and reduces usable-host waste by 1,340 addresses, about 97.95%. These figures are deterministic results for the sample only, not a universal claim that VLSM always improves utilization by that amount.

### Suggested Experiment

1. Keep the parent CIDR fixed and compare FLSM with VLSM for the same demand list.
2. Repeat with uniform, moderately uneven, and highly uneven host-demand distributions.
3. Record allocated addresses, unallocated addresses, usable-host waste, and efficiency for every scenario.
4. Explain that block-size rounding and required network/broadcast addresses constrain both strategies; report input assumptions with every result.

## Project Structure

```text
src/subnet_design/   IPv4 engine, API, config generator, demo
tests/               allocation and config tests
docs/FIGMA_PROMPT.md Figma Make frontend brief
docs/PROJECT_REQUIREMENTS.md requirements, workflow, and research method
```

## Safety and Scope

This project does not configure devices, discover live networks, or replace a network engineer's review. Configuration output is illustrative and has no vendor-device integration. Address planning assumes conventional IPv4 subnets with network and broadcast addresses reserved; IPv4 `/31` point-to-point behavior is intentionally not modeled.