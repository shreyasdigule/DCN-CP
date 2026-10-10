# Automatic IPv4 Subnet Calculator and Network Designer

A full-stack educational network-planning project. Enter a parent IPv4 CIDR and named subnet host requirements, then calculate a Fixed Length Subnet Masking (FLSM) plan, a Variable Length Subnet Masking (VLSM) plan, or compare both using the same inputs.

The React/Vite frontend presents address plans and utilization metrics. A FastAPI service runs the IPv4 allocation engine and produces a downloadable CSV report or a review-only, Cisco IOS-inspired configuration example. The example is text output only: the application does not connect to or configure network devices.

See [Project Requirements and Workflow](docs/PROJECT_REQUIREMENTS.md) for scope, formulas, assumptions, research method, and acceptance criteria.

## What it does

- Validates strict IPv4 parent networks, positive whole-number host requirements, unique subnet names, and optional unique VLAN IDs (1-4094).
- Calculates aligned, non-overlapping, contained subnet allocations:
  - **FLSM** assigns every demand a same-sized block based on the largest host requirement.
  - **VLSM** assigns each demand its smallest fitting block, placing larger blocks first.
- Displays subnet CIDR, mask, network address, first/last usable hosts, broadcast address, block size, usable capacity, requested hosts, and usable-host waste.
- Reports allocated addresses, remaining unallocated parent-pool addresses, usable-host capacity, usable-host waste, allocation efficiency, and pool coverage as distinct metrics.
- Compares FLSM and VLSM for the same design, and exports the current result as a CSV report.
- Generates an optional IOS-inspired interface/DHCP text example. It is illustrative, requires review, and does not configure a device.

## Run with Docker Compose

Docker Engine and the Compose plugin are required. From the repository directory:

```powershell
docker compose up --build -d
```

Open **http://localhost:8080**. The frontend and API run in one container and are served from the same origin. Swagger is available at `http://localhost:8080/docs`.

To stop the services:

```powershell
docker compose down
```

The application is stateless: designs are held in the browser, and there is no user account or database.

### Put it online for a small group

For a small class or project group, the included [Render Blueprint](render.yaml) can deploy the app using Render's free web-service plan:

1. Push this project, including `render.yaml` and `Dockerfile`, to a GitHub repository you can connect to Render.
2. Sign in at [Render](https://dashboard.render.com/), choose **New > Blueprint**, and connect that repository.
3. Review the `ipv4-subnet-planner` web service and select **Apply**.
4. Wait for the first Docker build and deploy to finish. Render will show the public `*.onrender.com` URL on the service page; share that HTTPS link.

This is suitable for light demonstration traffic, not a production service. Render's free web services spin down after 15 minutes without inbound traffic and can take about a minute to wake on the next visit. Free instance hours are pooled across the workspace (currently 750 hours per calendar month); check [Render's current free-service limits](https://render.com/docs/free). Designs are not stored by the app. Render controls the public host and TLS; no separate VPS or server-IP setup is needed.

If using a VPS instead, clone the repository there, run `docker compose up --build -d`, open the chosen host port (8080 by default) in both the server and provider firewalls, then share `http://SERVER-IP:8080`. Use a domain and HTTPS reverse proxy for a lasting public service. Docker alone does not create an internet-reachable link.

## Run without Docker

Requires Python 3.11+ and Node.js 22+.

Start the backend in one terminal:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
uvicorn subnet_design.api:app --reload
```

Start the frontend from the repository root in a second terminal:

```powershell
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`; the frontend uses `http://127.0.0.1:8000` for the API by default. Set `VITE_API_BASE_URL` before running Vite to use a different API origin. If the origin is not one of the API's default local origins, add that exact origin to `SUBNET_DESIGN_CORS_ORIGINS`.

Run backend tests:

```powershell
pytest
```

Run the deterministic CLI demonstration:

```powershell
subnet-designer-demo
```

## Example workload and metric definitions

The included, illustrative workload uses `10.44.0.0/21` (2,048 addresses):

| Subnet | Requested hosts | VLAN |
| --- | ---: | ---: |
| Engineering | 500 | 10 |
| Computer Lab | 120 | 20 |
| Administration | 50 | 30 |
| Point-to-point | 2 | 40 |

These values are a repeatable project example, not measured campus data. With conventional network and broadcast reservations, the sample FLSM allocation reserves 2,048 addresses across four `/23`s. VLSM reserves 708 addresses using `/23`, `/25`, `/26`, and `/30`, leaving 1,340 addresses unallocated in the parent pool. These results describe this workload only.

- **Allocated addresses:** sum of assigned subnet block sizes.
- **Unallocated pool:** parent-pool addresses not assigned to subnets; they remain free pool space.
- **Usable-host capacity:** allocated addresses less each subnet's network and broadcast addresses.
- **Usable-host waste:** usable-host capacity less requested hosts; it does not include unallocated pool space.
- **Allocation efficiency:** requested hosts divided by usable-host capacity.
- **Pool coverage:** allocated addresses divided by total parent-pool addresses.

IPv4 `/31` point-to-point semantics are not modeled; the minimum allocation is `/30`.

## API

- `GET /api/v1/health` — service health.
- `POST /api/v1/subnets/calculate` — calculate `FLSM`, `VLSM`, or `BOTH`.
- `POST /api/v1/config/cisco-ios` — return a review-only IOS-inspired text example for `FLSM` or `VLSM`.

The interactive API reference is at `/docs` when the service is running.

## Repository layout

```text
src/subnet_design/   IPv4 engine, API, configuration example, CLI demo
src/frontend/        React planning interface and styles
tests/               API and allocation tests
deploy/              Container entrypoint and reverse-proxy configuration
Dockerfile           Combined frontend/API image for Compose and Render
docker-compose.yml   Local container orchestration
render.yaml          One-click Render Blueprint deployment
docs/                Requirements, research workflow, and design brief
```

## Safety and limitations

This project plans conventional IPv4 subnets and creates reviewable example text. It does not discover networks, connect to routers, apply configuration, persist designs, or replace an engineer's review. Check interface names, gateways, DHCP behavior, and platform syntax before adapting any generated example.