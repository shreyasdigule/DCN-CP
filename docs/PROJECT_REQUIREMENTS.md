# Project Requirements and Workflow

## 1. Project Summary

**Project:** Automatic IPv4 Subnet Calculator and Network Designer  
**Course area:** Data Communication and Networking  
**Project type:** IPv4 planning engine, utilization comparison, and configuration-example generator, with a separately designed frontend in Figma.

The tool accepts a parent IPv4 network and a list of named subnet host requirements. It calculates allocations using Fixed Length Subnet Masking (FLSM), Variable Length Subnet Masking (VLSM), or both; reports address-utilization metrics; and generates a reviewable Cisco IOS-style configuration example.

The implementation is API-first. The current deliverable includes a Python/FastAPI backend and an interactive Swagger demonstration. The frontend is a Figma design/prototype deliverable and is not implemented in this repository.

## 2. Objectives

- Demonstrate CIDR, subnet masks, network/broadcast addresses, and usable host ranges.
- Allocate subnet blocks without overlap and without exceeding the requested parent pool.
- Compare FLSM and VLSM fairly using identical parent-network and host-demand inputs.
- Keep allocated addresses, usable host capacity, usable-host waste, and unallocated parent-pool addresses as distinct quantities.
- Produce a configuration example that is useful for review while clearly warning that it is not production-ready.
- Present the calculations and comparison in a restrained, legible Figma interface suitable for repeated network-planning work.

## 3. Scope and Assumptions

### Included

- IPv4 CIDR input and subnet allocation for FLSM and VLSM.
- One or more named subnet requirements with a positive requested-host count and optional VLAN ID.
- Subnet details: network CIDR, prefix length, mask, first/last usable host, broadcast address, total block size, and usable-host waste.
- Per-strategy and comparative utilization summaries.
- Cisco IOS-style router-subinterface and DHCP-pool text export.
- HTTP validation errors for invalid input or allocations that cannot fit.
- A deterministic example workload and repeatable research procedure.

### Assumptions and limits

- Conventional IPv4 subnets reserve a network and broadcast address; a minimum `/30` block is used. `/31` point-to-point semantics are not modeled.
- FLSM sizes every requested subnet to fit the largest host demand.
- VLSM sizes each subnet to its smallest fitting power-of-two block, aligns network boundaries, and allocates the largest blocks first.
- The sample department demands are illustrative. The project report should identify and justify any replacement workload; do not present invented campus measurements as collected data.
- Exported device configuration is educational sample text only. It does not connect to, configure, or validate a physical or simulated router.
- Authentication, persistent saved designs, live device discovery, IPv6, and production deployment are out of scope.

## 4. Stakeholders and Demonstration Roles

- **Student/researcher:** supplies assumptions, runs the FLSM/VLSM comparisons, records metrics, and explains results.
- **Network planner:** enters the parent pool and department/VLAN requirements, inspects allocations, and exports a configuration example.
- **Evaluator:** checks the input assumptions, allocation correctness, metric definitions, repeatability, and limitations.

## 5. Functional Requirements

### FR-1: Define the address pool

The user can enter a strict IPv4 network in CIDR form. The system identifies invalid CIDR, non-network-aligned input, and unsupported address-family input with a clear validation response.

### FR-2: Enter subnet requirements

Each demand has a non-empty subnet name, a positive host count, and an optional VLAN ID in the range 1-4094. Names and specified VLAN IDs must be unique within a design.

### FR-3: Calculate FLSM

All child blocks have the same prefix length, chosen to fit the largest requested host count. The calculation fails clearly when the requested number of equal blocks does not fit inside the parent.

### FR-4: Calculate VLSM

Each demand receives the smallest conventional IPv4 block that can support the requested hosts. Blocks are ordered largest first, correctly aligned, contained by the parent, and mutually non-overlapping. The calculation fails clearly if any allocation cannot fit.

### FR-5: Compare strategies

For the same parent and demands, the system returns FLSM and VLSM allocations and reports the difference in allocated addresses and usable-host waste. A UI that merges returned subnet rows must match them by `name`; VLSM rows are returned in allocation order, not necessarily input order.

### FR-6: Inspect allocation details

For every subnet, show its name, optional VLAN, CIDR, prefix length, subnet mask, network address, first and last usable addresses, broadcast address, total allocated addresses, usable-host capacity, requested hosts, and usable-host waste.

### FR-7: Export a configuration example

For one selected strategy, generate Cisco IOS-style subinterface and DHCP-pool text using the allocated network and first usable address as the example gateway. The output includes a prominent review warning. Export must not be described as applying configuration to a device.

### FR-8: Support the project demonstration

The backend provides a health endpoint, documented interactive API endpoints, a deterministic CLI demonstration, and automated tests.

## 6. Metrics and Research Definitions

Use these definitions consistently in the interface, experiment spreadsheet, presentation, and report:

- **Parent-pool addresses:** total addresses in the input network, $2^{32-p}$ for parent prefix $p$.
- **Allocated addresses:** sum of the complete subnet block sizes assigned by the strategy.
- **Unallocated parent-pool addresses:** parent-pool addresses minus allocated addresses. This is still free pool space, not subnet host capacity.
- **Requested hosts:** sum of the host counts supplied for all demands.
- **Usable-host capacity:** sum of each allocated subnet's total addresses minus its network and broadcast addresses.
- **Usable-host waste:** usable-host capacity minus requested hosts. It is capacity reserved for hosts but not requested; it does not include unallocated parent-pool space.
- **Allocation efficiency:** requested hosts divided by usable-host capacity, expressed as a percentage.
- **Pool coverage:** allocated addresses divided by parent-pool addresses, expressed as a percentage. This measures pool reservation, not host efficiency.
- **VLSM address savings:** FLSM allocated addresses minus VLSM allocated addresses. A negative value is possible for unusual comparison conditions; report the returned value rather than assuming VLSM always wins.
- **Usable-host waste reduction:** FLSM usable-host waste minus VLSM usable-host waste. Report its absolute value and percentage relative to FLSM only when FLSM waste is non-zero.

## 7. End-to-End Project Workflow

### Software demonstration

1. Start the API and open its Swagger page.
2. Enter a parent CIDR and named demand rows, including VLAN IDs where relevant.
3. Submit the same design with `BOTH` to compare the two strategies; use `FLSM` or `VLSM` to inspect one allocation independently.
4. Inspect per-subnet CIDRs and address ranges. Confirm every subnet fits within the parent, no blocks overlap, and returned host capacity meets its demand.
5. Compare allocated addresses, unallocated parent space, usable capacity, and waste as separate values.
6. Request the Cisco IOS-style export for the selected strategy, inspect the review warning, and explain that the sample requires platform and policy review.
7. In the Figma prototype, repeat the same workflow with the sample fixture if the prototype cannot reach the local API. Mark fixture data as sample data.

### Research workflow

1. State the research question: **For a fixed IPv4 parent pool and a fixed set of host demands, how do FLSM and VLSM differ in reserved addresses and usable-host waste?**
2. Record the parent CIDR, all host demands, optional VLANs, and subnetting assumptions before running the comparison.
3. Compare strategies using the exact same input for each trial.
4. Record allocated addresses, unallocated parent addresses, usable-host capacity, usable-host waste, allocation efficiency, and pool coverage.
5. Repeat for uniform, moderately uneven, and highly uneven demand distributions, keeping the parent fixed for comparability and ensuring each selected workload fits under both strategies.
6. Analyze results per workload. Do not combine unlike workloads into one average without explaining the method.
7. Discuss block-size rounding and network/broadcast reservations, identify limitations, and restrict conclusions to the tested inputs.

### Suggested reproducible scenarios

- **Uniform:** 100, 100, 100, 100 hosts.
- **Moderately uneven:** 240, 120, 60, 30 hosts.
- **Highly uneven/sample:** 500, 120, 50, 2 hosts.

Use `10.44.0.0/21` for these example scenarios. These are designed test inputs, not measurements from a real campus. The supplied project sample is the highly uneven scenario.

## 8. API Contract for the Figma Prototype

Base URL for local development: `http://127.0.0.1:8000`.

The backend uses FastAPI and Pydantic for HTTP validation and response schemas, Uvicorn as the ASGI server, and Python's standard-library `ipaddress` for the subnet engine. Install runtime and development dependencies with `python -m pip install -e ".[dev]"`; no third-party subnet calculation package is required.

- `GET /api/v1/health` returns `{ "status": "ok" }`.
- `POST /api/v1/subnets/calculate` accepts `parent_cidr`, `strategy` (`FLSM`, `VLSM`, or `BOTH`), and `demands` (`name`, `hosts`, optional `vlan_id`).
- `POST /api/v1/config/cisco-ios` accepts `parent_cidr`, `strategy` (`FLSM` or `VLSM`), and the same `demands`; it returns `format` and `configuration`.
- Invalid request shapes and rejected allocations return HTTP `422`. Pydantic input errors and calculation errors may have different `detail` shapes; the frontend should present a useful message for either.

For a single strategy, the calculation response has `strategy`, `subnets`, and `summary`. A `BOTH` response has `parent_network`, `demand_count`, `flsm`, `vlsm`, and `comparison`. Each strategy's `summary` contains parent pool size, allocated and unallocated addresses, requested hosts, usable capacity, waste, efficiency, and pool coverage. Each subnet row contains the details listed in FR-6.

The API allows explicit browser origins. By default, the local Vite origins `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, and `http://127.0.0.1:4173` are allowed. Configure any additional exact origin with the comma-separated `SUBNET_DESIGN_CORS_ORIGINS` environment variable before starting the backend. Wildcard origins are rejected, and credentials are disabled. Keep this allowlist narrow.

CORS permits a browser origin to read API responses; it does not provide routing or a tunnel from Figma's hosted preview to a developer's computer. For a local UI, allow its exact local origin. For Figma-hosted or deployed UI, use a backend reachable by that browser and allow the UI's exact origin, or keep a clearly labeled fixture matching the API response shape. Never represent fixture data as live API data.

## 9. Non-Functional Requirements

- **Correctness:** use Python's standard-library `ipaddress` module for IPv4 network primitives; allocation logic must enforce containment and non-overlap.
- **Clarity:** distinguish address reservation from host capacity and keep validation messages actionable.
- **Repeatability:** identical inputs return deterministic allocations and metrics.
- **Usability:** the Figma interface prioritizes scannability, stable tabular layouts, keyboard accessibility, responsive behavior, and restrained contrast.
- **Safety:** configuration output visibly states it is a reviewable example and never implies live device changes.
- **Maintainability:** keep calculation logic separate from FastAPI request handling and test allocation, metrics, validation, and export behavior.

## 10. Acceptance Criteria

- Valid demand inputs produce aligned, contained, non-overlapping IPv4 subnets for each requested subnet.
- Every allocated subnet's usable capacity meets or exceeds its requested host count.
- FLSM allocations share one prefix; VLSM allocations use the smallest fitting block for each demand.
- Invalid CIDRs, duplicate names/VLANs, invalid host counts, and insufficient parent pools produce clear errors.
- Comparison metrics distinguish allocated addresses, usable-host capacity/waste, and unallocated parent space.
- The sample `10.44.0.0/21` workload reports 2,048 FLSM allocated addresses, 708 VLSM allocated addresses, and 1,340 fewer VLSM allocated addresses.
- Configuration export contains the review warning and uses allocation details; no route configures a real device.
- Tests and the documented local API demo run successfully.
- The Figma prototype matches the API contract or clearly labels its fixture data and connectivity limitation.

## 11. Expected Project Deliverables

- Python source for the IPv4 engine, API, configuration generator, and demonstration runner.
- Automated tests for subnet correctness, utilization comparison, validation, and configuration output.
- This requirements/workflow document and the [Figma Make prompt](FIGMA_PROMPT.md).
- A short report with objective, method, assumptions, per-scenario results, discussion, limitations, and conclusion.
- A live demonstration using Swagger or the Figma prototype connected to the documented API contract.