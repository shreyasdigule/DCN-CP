# IPv4 Subnet Planner

Plan IPv4 subnet allocations, compare FLSM and VLSM, and export a clear report.

**[Open the live app](https://ipv4-subnet-planner.onrender.com)** · [API documentation](https://ipv4-subnet-planner.onrender.com/docs) · [Health check](https://ipv4-subnet-planner.onrender.com/api/v1/health)

IPv4 Subnet Planner is an educational network-planning application. Enter a parent IPv4 network and named host requirements to build a Fixed Length Subnet Masking (FLSM) plan, a Variable Length Subnet Masking (VLSM) plan, or compare both strategies using the same inputs.

## Features

- Validates IPv4 parent networks, positive whole-number host requirements, unique subnet names, and optional unique VLAN IDs (1-4094).
- Allocates aligned, non-overlapping subnets contained in the parent network:
  - **FLSM** assigns same-sized blocks based on the largest host requirement.
  - **VLSM** assigns the smallest fitting blocks, allocating larger demands first.
- Shows each subnet's CIDR, mask, network address, usable host range, broadcast address, block size, and host capacity.
- Reports allocated addresses, unallocated parent-pool addresses, usable-host capacity, and usable-host waste as distinct metrics.
- Compares FLSM and VLSM and exports results as CSV.
- Generates an optional Cisco IOS-inspired configuration example for review. It is text output only and does not connect to or configure network devices.

## Run locally

### With Docker Compose

Requires Docker Engine and the Compose plugin.

```powershell
docker compose up --build -d
```

Open `http://localhost:8080`. The frontend and API are served from the same origin; the API reference is available at `http://localhost:8080/docs`.

Stop the application with:

```powershell
docker compose down
```

### Without Docker

Requires Python 3.11+ and Node.js 22+.

Start the API:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
uvicorn subnet_design.api:app --reload
```

In a second terminal, start the frontend:

```powershell
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. By default, the frontend sends API requests to `http://127.0.0.1:8000`. Set `VITE_API_BASE_URL` to use another API origin; if needed, add that exact origin to `SUBNET_DESIGN_CORS_ORIGINS`.

Run backend tests and the example CLI:

```powershell
pytest
subnet-designer-demo
```

## Deployment

The project includes a [Render Blueprint](render.yaml) and a [Dockerfile](Dockerfile). The public deployment is available at **[ipv4-subnet-planner.onrender.com](https://ipv4-subnet-planner.onrender.com)**.

The app is stateless: designs remain in the browser and are not stored in a database. The Render free web service may spin down after inactivity and take about a minute to wake up. See [Render's current free-service limits](https://render.com/docs/free).

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Service health |
| `POST` | `/api/v1/subnets/calculate` | Calculate an FLSM, VLSM, or combined plan |
| `POST` | `/api/v1/config/cisco-ios` | Generate a review-only IOS-inspired example |

Interactive API documentation is available at `/docs` on the live deployment or local server.

## Metrics and assumptions

- **Allocated addresses** are the sum of the subnet block sizes assigned by the plan.
- **Unallocated pool addresses** are parent-network addresses not assigned to any subnet; they remain free pool space.
- **Usable-host capacity** is the allocated address count less network and broadcast reservations in each subnet.
- **Usable-host waste** is usable-host capacity less the requested hosts; it does not include unallocated pool space.
- **Allocation efficiency** is requested hosts divided by usable-host capacity.
- **Pool coverage** is allocated addresses divided by the parent-network address count.

The sample workload documented in [Project Requirements and Workflow](docs/PROJECT_REQUIREMENTS.md) is illustrative, not measured campus data. Conventional network and broadcast reservations are used; `/31` point-to-point semantics are not modeled, so the minimum allocation is `/30`.

## Project structure

```text
src/subnet_design/   IPv4 allocation engine, API, config example, and CLI demo
src/frontend/        React subnet-planning interface and styles
tests/               Allocation and API tests
deploy/              Container entrypoint and reverse-proxy configuration
docs/                Project requirements, workflow, and design brief
Dockerfile           Combined frontend/API image
docker-compose.yml   Local container orchestration
render.yaml          Render Blueprint deployment
```

## Safety and limitations

This project plans conventional IPv4 subnets and creates reviewable example text. It does not discover networks, connect to routers, apply configuration, or persist designs. Review interface names, gateways, DHCP behavior, and platform syntax before adapting generated examples for any environment.
