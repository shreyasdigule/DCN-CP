# Figma Make Prompt

Design a responsive desktop-first application named **Automatic IPv4 Subnet Calculator and Network Designer**. This is an operational subnet-planning workbench for campus network staff and a college project demonstration, not a marketing landing page. The experience should feel engineered, systematic, and trustworthy, like an established network equipment company's planning console. Do not generate the frontend source code in this repository; deliver Figma frames and a clickable prototype.

Use [PROJECT_REQUIREMENTS.md](PROJECT_REQUIREMENTS.md) as the source of truth for scope, formulas, assumptions, API behavior, and acceptance criteria. Do not invent features that need unsupported backend endpoints.

## Visual System

- Use a quiet light palette: soft cool grey canvas, off-white work surfaces, graphite text, muted teal for selected/positive states, low-saturation green for VLSM, slate-blue for FLSM, and restrained amber for warnings. Keep contrast comfortable and text legible; avoid huge contrast fields, near-black hero panels, bright accent blocks, purple, gradients, glow, blur, neon, and decorative orbs.
- Use IBM Plex Sans for interface text and IBM Plex Mono for CIDRs, masks, IP ranges, VLANs, and metrics. Use tabular numerals, compact labels, consistent columns, and a disciplined type scale. Avoid giant headings and letter-spaced labels.
- Make this feel like a mature infrastructure planning tool: precise alignment, thin separators, restrained borders, purposeful whitespace, and compact 4-6 px corner radii. Keep page sections unframed; only repeated data groups or focused code/metric regions may use a subtle surface tint. Never nest cards.
- Use familiar line icons sparingly for clear actions; include hover labels for unfamiliar icons. No illustrations, stock imagery, fake charts, marketing copy, or decorative visualizations without data meaning.

## Main Frame: Subnet Planner

Create a 1440 x 1000 desktop frame, then tablet and mobile adaptations. The first viewport should be the usable application.

- Use a compact top bar with a small network mark, product name, `Planning workspace`, and a restrained `Export config` action. Do not add nonfunctional navigation for saved designs, accounts, history, or research dashboards.
- Main heading: `Subnet planner`. Place the editable `Parent network` CIDR field prominently with the initial value `10.44.0.0/21` and a small pool-size label `2,048 addresses`.
- Provide a segmented strategy control: `Compare`, `FLSM`, `VLSM`. Add a clear `Add subnet` control and a well-sized `Calculate` button. Keep actions close to their inputs.
- Create an editable, stable-width demand table with columns `Subnet`, `Hosts required`, and `VLAN ID`. Include add/remove-row behavior. Use these sample rows: Engineering / 500 / 10; Computer Lab / 120 / 20; Administration / 50 / 30; Point-to-point / 2 / 40. Do not hardcode calculated CIDRs in editable input rows.
- In `Compare`, show two aligned, restrained result regions for FLSM and VLSM with `Allocated addresses`, `Unallocated pool`, `Usable host capacity`, `Usable-host waste`, and `Allocation efficiency`. For the sample, show FLSM: 2,048 allocated, 0 unallocated, 2,040 usable capacity, 1,368 waste, 32.94% efficiency; VLSM: 708 allocated, 1,340 unallocated, 700 usable capacity, 28 waste, 96.00% efficiency. Show the comparison `VLSM reserves 1,340 fewer addresses` as a concise annotation, not a hero banner.
- Make metric semantics apparent: unallocated addresses remain free in the parent pool and are not the same as usable-host waste inside allocated subnets. Provide short tooltips or info labels rather than a paragraph of on-screen instructions.
- Add a meaningful parent-pool address map only if it can accurately represent proportional block sizes and free space. Label allocated subnet segments and the remaining unallocated range; do not distort sizes or imply free pool space is host capacity. If proportional labels become unreadable, use a compact allocation strip plus the address-plan table instead.
- Below the comparison, provide tabs `Address plan` and `Cisco IOS config`. Address-plan columns: subnet, CIDR, mask, first host, last host, broadcast, total addresses, requested hosts, usable-host waste. Include a copy action on code output and keep the review warning visible: `Example only. Review interface names, gateway policy, DHCP behavior, and device syntax before use.`
- The sample VLSM CIDRs are Engineering `/23`, Computer Lab `/25`, Administration `/26`, and Point-to-point `/30`. The API sorts VLSM allocations by block size, so associate results with input rows by subnet `name`, not array position.
- Include coherent empty, calculating, success, field-error, allocation-error, and API-unavailable states. Surface HTTP 422 validation feedback near the relevant inputs when possible, with a concise summary for engine errors. Label every input, show focus states, support keyboard use, and avoid layout shifts when validation appears.

## Responsive Layout

- At tablet widths, preserve the parent CIDR and calculate action, reduce secondary labels, and keep the result comparison aligned.
- At mobile widths, stack strategy results, use a two-column metric grid where values fit, make the demand and address-plan tables horizontally scrollable with subnet names kept visible, and keep controls at comfortable touch sizes. Ensure long CIDRs and labels wrap or scroll without overlapping other content.

## Clickable Prototype and API Contract

Backend base URL: `http://127.0.0.1:8000`.

- Health: `GET /api/v1/health`.
- Calculation: `POST /api/v1/subnets/calculate` with `parent_cidr`, `strategy` (`FLSM`, `VLSM`, or `BOTH`), and `demands` (array of `{ "name": string, "hosts": integer, "vlan_id": integer | null }`).
- Config export: `POST /api/v1/config/cisco-ios` with `parent_cidr`, `strategy` (`FLSM` or `VLSM`), and the same `demands`. Render the returned `configuration` string; do not synthesize different device commands in the frontend.
- A `BOTH` response contains `flsm`, `vlsm`, and `comparison`; each strategy contains `subnets` and `summary`. Join subnet records to editable rows by `name`. Render returned metrics, do not calculate a conflicting second definition in the client.
- Invalid request shape or failed allocation returns HTTP `422`; show a useful message for either a structured validation `detail` or a string calculation `detail`.

The backend allows the local Vite origins `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, and `http://127.0.0.1:4173` by default. Another local frontend origin can be explicitly added using `SUBNET_DESIGN_CORS_ORIGINS`, a comma-separated exact-origin allowlist; wildcard origins and credentials are not allowed. A Figma-hosted preview may still be unable to reach the developer's localhost: CORS is not a network tunnel. If direct calls fail, use a clearly labeled sample fixture matching the real response shape and include an `API unavailable / sample data` state. Do not pretend the sample is live data. For deployed UI, the backend must be reachable from the browser and configured to allow the UI's exact origin.

Never imply that this tool connects to or configures a real router. The config tab is a reviewable example only.