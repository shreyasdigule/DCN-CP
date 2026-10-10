import { useMemo, useRef, useState } from "react"
import "./subnet-planner.css"

type Strategy = "Compare" | "FLSM" | "VLSM"
type AllocationStrategy = "FLSM" | "VLSM"
type ResultTab = "Address plan" | "Config example"

type Demand = {
  id: number
  name: string
  hosts: number | ""
  vlan: number | ""
}

type SubnetResult = {
  name: string
  vlan_id: number | null
  network: string
  network_address: string
  first_host: string
  last_host: string
  broadcast_address: string
  prefix_length: number
  subnet_mask: string
  total_addresses: number
  usable_hosts: number
  requested_hosts: number
  usable_host_waste: number
}

type Summary = {
  parent_network: string
  pool_addresses: number
  allocated_addresses: number
  unallocated_addresses: number
  requested_hosts: number
  assigned_usable_hosts: number
  usable_host_waste: number
  allocation_efficiency_pct: number
  pool_coverage_pct: number
}

type AllocationResult = {
  strategy: AllocationStrategy
  subnets: SubnetResult[]
  summary: Summary
}

type ComparisonResult = {
  parent_network: string
  demand_count: number
  flsm: AllocationResult
  vlsm: AllocationResult
  comparison: {
    address_savings_with_vlsm: number
    usable_host_waste_reduction_with_vlsm: number
    usable_host_waste_reduction_pct: number
  }
}

type ConfigResult = {
  format: "cisco-ios"
  configuration: string
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(
    /\/$/,
    "",
  ) ?? "http://127.0.0.1:8000"

const initialDemands: Demand[] = [
  { id: 1, name: "Engineering", hosts: 500, vlan: 10 },
  { id: 2, name: "Computer Lab", hosts: 120, vlan: 20 },
  { id: 3, name: "Administration", hosts: 50, vlan: 30 },
  { id: 4, name: "Point-to-point", hosts: 2, vlan: 40 },
]

function formatNumber(value: number) {
  return value.toLocaleString()
}

function csvCell(value: string | number | null) {
  let text = value === null ? "" : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function createSubnetReport(
  parentNetwork: string,
  allocations: AllocationResult[],
  comparison: ComparisonResult["comparison"] | null,
) {
  const columns = [
    "record_type",
    "strategy",
    "metric",
    "value",
    "subnet_name",
    "vlan_id",
    "network",
    "prefix_length",
    "subnet_mask",
    "network_address",
    "first_host",
    "last_host",
    "broadcast_address",
    "total_addresses",
    "usable_host_capacity",
    "requested_hosts",
    "usable_host_waste",
  ]
  const rows: (string | number | null)[][] = [
    columns,
    ["metadata", "", "parent_network", parentNetwork],
    [
      "definition",
      "",
      "allocated_addresses",
      "Sum of complete subnet blocks reserved by the strategy.",
    ],
    [
      "definition",
      "",
      "unallocated_addresses",
      "Parent-pool addresses not assigned to a subnet; these remain free pool space.",
    ],
    [
      "definition",
      "",
      "usable_host_capacity",
      "Allocated addresses less each subnet's network and broadcast addresses.",
    ],
    [
      "definition",
      "",
      "usable_host_waste",
      "Usable-host capacity less requested hosts; excludes unallocated pool space.",
    ],
  ]

  for (const allocation of allocations) {
    const { summary } = allocation
    rows.push(
      ["summary", allocation.strategy, "parent_network", summary.parent_network],
      ["summary", allocation.strategy, "pool_addresses", summary.pool_addresses],
      ["summary", allocation.strategy, "allocated_addresses", summary.allocated_addresses],
      ["summary", allocation.strategy, "unallocated_addresses", summary.unallocated_addresses],
      ["summary", allocation.strategy, "requested_hosts", summary.requested_hosts],
      ["summary", allocation.strategy, "usable_host_capacity", summary.assigned_usable_hosts],
      ["summary", allocation.strategy, "usable_host_waste", summary.usable_host_waste],
      ["summary", allocation.strategy, "allocation_efficiency_pct", summary.allocation_efficiency_pct],
      ["summary", allocation.strategy, "pool_coverage_pct", summary.pool_coverage_pct],
    )
    for (const subnet of allocation.subnets) {
      rows.push([
        "subnet",
        allocation.strategy,
        "",
        "",
        subnet.name,
        subnet.vlan_id,
        subnet.network,
        subnet.prefix_length,
        subnet.subnet_mask,
        subnet.network_address,
        subnet.first_host,
        subnet.last_host,
        subnet.broadcast_address,
        subnet.total_addresses,
        subnet.usable_hosts,
        subnet.requested_hosts,
        subnet.usable_host_waste,
      ])
    }
  }

  if (comparison) {
    rows.push(
      ["comparison", "FLSM vs VLSM", "address_savings_with_vlsm", comparison.address_savings_with_vlsm],
      [
        "comparison",
        "FLSM vs VLSM",
        "usable_host_waste_reduction_with_vlsm",
        comparison.usable_host_waste_reduction_with_vlsm,
      ],
      [
        "comparison",
        "FLSM vs VLSM",
        "usable_host_waste_reduction_pct",
        comparison.usable_host_waste_reduction_pct,
      ],
    )
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

function getParentLimits(cidr: string) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/.exec(cidr.trim())
  if (!match) return null
  const octets = match[1].split(".").map(Number)
  if (octets.some((octet) => octet > 255)) return null
  const address = octets.reduce((value, octet) => value * 256 + octet, 0)
  const poolAddresses = 2 ** (32 - Number(match[2]))
  if (Math.floor(address / poolAddresses) * poolAddresses !== address) return null
  return {
    poolAddresses,
    maxHostsPerSubnet: Math.min(4_294_967_294, Math.max(0, poolAddresses - 2)),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isSubnetResult(value: unknown): value is SubnetResult {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (typeof value.vlan_id === "number" || value.vlan_id === null) &&
    typeof value.network === "string" &&
    typeof value.network_address === "string" &&
    typeof value.first_host === "string" &&
    typeof value.last_host === "string" &&
    typeof value.broadcast_address === "string" &&
    isNumber(value.prefix_length) &&
    typeof value.subnet_mask === "string" &&
    isNumber(value.total_addresses) &&
    isNumber(value.usable_hosts) &&
    isNumber(value.requested_hosts) &&
    isNumber(value.usable_host_waste)
  )
}

function isAllocationResult(value: unknown): value is AllocationResult {
  if (
    !isRecord(value) ||
    (value.strategy !== "FLSM" && value.strategy !== "VLSM") ||
    !Array.isArray(value.subnets) ||
    !value.subnets.every(isSubnetResult) ||
    !isRecord(value.summary)
  ) {
    return false
  }
  const summary = value.summary
  return (
    typeof summary.parent_network === "string" &&
    isNumber(summary.pool_addresses) &&
    isNumber(summary.allocated_addresses) &&
    isNumber(summary.unallocated_addresses) &&
    isNumber(summary.requested_hosts) &&
    isNumber(summary.assigned_usable_hosts) &&
    isNumber(summary.usable_host_waste) &&
    isNumber(summary.allocation_efficiency_pct) &&
    isNumber(summary.pool_coverage_pct)
  )
}

function isComparisonResult(value: unknown): value is ComparisonResult {
  if (
    !isRecord(value) ||
    typeof value.parent_network !== "string" ||
    !isNumber(value.demand_count) ||
    !isAllocationResult(value.flsm) ||
    value.flsm.strategy !== "FLSM" ||
    !isAllocationResult(value.vlsm) ||
    value.vlsm.strategy !== "VLSM" ||
    !isRecord(value.comparison)
  ) {
    return false
  }
  return (
    isNumber(value.comparison.address_savings_with_vlsm) &&
    isNumber(value.comparison.usable_host_waste_reduction_with_vlsm) &&
    isNumber(value.comparison.usable_host_waste_reduction_pct)
  )
}

function isConfigResult(value: unknown): value is ConfigResult {
  return (
    isRecord(value) &&
    value.format === "cisco-ios" &&
    typeof value.configuration === "string"
  )
}

async function postApi<T>(
  path: string,
  body: object,
  isExpectedResponse: (value: unknown) => value is T,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error("The service returned an invalid response.")
  }
  if (!response.ok) throw new Error(getErrorMessage(data))
  if (!isExpectedResponse(data)) {
    throw new Error("The service returned an unexpected response.")
  }
  return data
}

function MetricGrid({ result }: { result: AllocationResult }) {
  const summary = result.summary
  const metrics = [
    ["Allocated addresses", formatNumber(summary.allocated_addresses)],
    ["Unallocated pool", formatNumber(summary.unallocated_addresses)],
    ["Usable host capacity", formatNumber(summary.assigned_usable_hosts)],
    ["Usable-host waste", formatNumber(summary.usable_host_waste)],
    ["Allocation efficiency", `${summary.allocation_efficiency_pct.toFixed(2)}%`],
    ["Pool coverage", `${summary.pool_coverage_pct.toFixed(2)}%`],
  ]

  return (
    <section className="result-panel" aria-label={`${result.strategy} results`}>
      <div className="panel-title">{result.strategy}</div>
      <dl className="metric-grid">
        {metrics.map(([label, value]) => (
          <div className="metric" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function getErrorMessage(value: unknown) {
  if (!isRecord(value) || !("detail" in value)) {
    return "The service returned an unexpected response."
  }
  const detail = value.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== "object") return "Invalid input"
        const message = "msg" in item ? String(item.msg) : "Invalid input"
        const location =
          "loc" in item && Array.isArray(item.loc)
            ? item.loc
                .filter((part: unknown) => part !== "body")
                .map(String)
                .join(" → ")
            : ""
        return location ? `${location}: ${message}` : message
      })
      .join("; ")
  }
  return "The request could not be processed."
}

function SubnetPlanner() {
  const [parentCidr, setParentCidr] = useState("10.44.0.0/21")
  const [strategy, setStrategy] = useState<Strategy>("Compare")
  const [demands, setDemands] = useState(initialDemands)
  const [allocations, setAllocations] = useState<Partial<Record<AllocationStrategy, AllocationResult>>>({})
  const [comparison, setComparison] = useState<ComparisonResult["comparison"] | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>("Address plan")
  const [planStrategy, setPlanStrategy] = useState<AllocationStrategy>("VLSM")
  const [status, setStatus] = useState<"idle" | "calculating" | "ready">("idle")
  const [error, setError] = useState("")
  const [config, setConfig] = useState("")
  const [configStatus, setConfigStatus] = useState<"idle" | "loading" | "ready">("idle")
  const [copied, setCopied] = useState(false)
  const requestVersion = useRef(0)

  const totalHosts = useMemo(
    () => demands.reduce((total, demand) => total + Number(demand.hosts || 0), 0),
    [demands],
  )
  const parentLimits = getParentLimits(parentCidr)
  const planResult = allocations[planStrategy]
  const poolSize = parentLimits?.poolAddresses

  function clearResults() {
    requestVersion.current += 1
    setAllocations({})
    setComparison(null)
    setStatus("idle")
    setError("")
    setConfig("")
    setConfigStatus("idle")
    setCopied(false)
  }

  function updateDemand(id: number, field: "name" | "hosts" | "vlan", value: string) {
    if (field === "name") {
      const normalizedName = value.trim().toLocaleLowerCase()
      if (
        normalizedName &&
        demands.some((demand) => demand.id !== id && demand.name.trim().toLocaleLowerCase() === normalizedName)
      ) {
        setError("Subnet names must be unique.")
        return
      }
    } else if (value !== "" && !/^\d+$/.test(value)) {
      setError(field === "hosts" ? "Hosts required must be a whole number." : "VLAN IDs must be whole numbers.")
      return
    } else if (field === "hosts" && value !== "" && parentLimits && Number(value) > parentLimits.maxHostsPerSubnet) {
      setError(`Hosts required cannot exceed ${formatNumber(parentLimits.maxHostsPerSubnet)} for this parent network.`)
      return
    } else if (field === "vlan" && value !== "") {
      const vlan = Number(value)
      if (vlan < 1 || vlan > 4094) {
        setError("VLAN IDs must be whole numbers from 1 to 4094.")
        return
      }
      if (demands.some((demand) => demand.id !== id && demand.vlan === vlan)) {
        setError("VLAN IDs must be unique.")
        return
      }
    }
    clearResults()
    setDemands((current) =>
      current.map((demand) => {
        if (demand.id !== id) return demand
        if (field === "name") return { ...demand, name: value }
        return { ...demand, [field]: value === "" ? "" : Number(value) }
      }),
    )
  }

  function updateParentCidr(value: string) {
    clearResults()
    setParentCidr(value)
  }

  function addDemand() {
    if (demands.length >= 256) return
    clearResults()
    setDemands((current) => [
      ...current,
      {
        id: Math.max(0, ...current.map((demand) => demand.id)) + 1,
        name: "",
        hosts: "",
        vlan: "",
      },
    ])
  }

  function removeDemand(id: number) {
    clearResults()
    setDemands((current) => current.filter((demand) => demand.id !== id))
  }

  function changeStrategy(value: Strategy) {
    if (value === strategy) return
    const hasResults =
      value === "Compare"
        ? Boolean(allocations.FLSM && allocations.VLSM)
        : Boolean(allocations[value])
    if (!hasResults) {
      clearResults()
    } else {
      requestVersion.current += 1
      setConfig("")
      setConfigStatus("idle")
      setCopied(false)
      setError("")
    }
    setStrategy(value)
    if (value !== "Compare") setPlanStrategy(value)
    else setPlanStrategy("VLSM")
  }

  function changePlanStrategy(value: AllocationStrategy) {
    if (value === planStrategy) return
    requestVersion.current += 1
    setPlanStrategy(value)
    setConfig("")
    setConfigStatus("idle")
    setCopied(false)
    setError("")
  }

  function requestBody(requestStrategy: "BOTH" | AllocationStrategy) {
    return {
      parent_cidr: parentCidr.trim(),
      strategy: requestStrategy,
      demands: demands.map((demand) => ({
        name: demand.name.trim(),
        hosts: Number(demand.hosts),
        vlan_id: demand.vlan === "" ? null : Number(demand.vlan),
      })),
    }
  }

  function validateInputs() {
    if (!parentCidr.trim()) return "Enter a parent IPv4 network in CIDR notation."
    if (demands.some((demand) => !demand.name.trim())) return "Every subnet requires a name."
    if (demands.some((demand) => demand.name.trim().length > 48)) {
      return "Subnet names must be 48 characters or fewer."
    }
    const names = demands.map((demand) => demand.name.trim().toLocaleLowerCase())
    if (new Set(names).size !== names.length) return "Subnet names must be unique."
    if (demands.some((demand) => !Number.isInteger(Number(demand.hosts)) || Number(demand.hosts) < 1)) {
      return "Hosts required must be a positive whole number."
    }
    if (
      parentLimits &&
      demands.some((demand) => Number(demand.hosts) > parentLimits.maxHostsPerSubnet)
    ) {
      return `A host requirement exceeds the ${formatNumber(parentLimits.maxHostsPerSubnet)}-host limit for this parent network.`
    }
    if (demands.some((demand) => Number(demand.hosts) > 4_294_967_294)) {
      return "Hosts required exceeds the supported IPv4 range."
    }
    if (
      demands.some(
        (demand) =>
          demand.vlan !== "" &&
          (!Number.isInteger(Number(demand.vlan)) || Number(demand.vlan) < 1 || Number(demand.vlan) > 4094),
      )
    ) {
      return "VLAN IDs must be whole numbers from 1 to 4094."
    }
    const vlanIds = demands
      .filter((demand) => demand.vlan !== "")
      .map((demand) => Number(demand.vlan))
    if (new Set(vlanIds).size !== vlanIds.length) return "VLAN IDs must be unique."
    return ""
  }

  async function calculate() {
    const validationError = validateInputs()
    if (validationError) {
      setError(validationError)
      return
    }

    setStatus("calculating")
    setError("")
    setConfig("")
    setConfigStatus("idle")
    const currentRequest = ++requestVersion.current

    try {
      const requestStrategy = strategy === "Compare" ? "BOTH" : strategy
      if (requestStrategy === "BOTH") {
        const result = await postApi(
          "/api/v1/subnets/calculate",
          requestBody(requestStrategy),
          isComparisonResult,
        )
        if (currentRequest !== requestVersion.current) return
        setAllocations({ FLSM: result.flsm, VLSM: result.vlsm })
        setComparison(result.comparison)
        setPlanStrategy("VLSM")
      } else {
        const result = await postApi(
          "/api/v1/subnets/calculate",
          requestBody(requestStrategy),
          isAllocationResult,
        )
        if (currentRequest !== requestVersion.current) return
        setAllocations({ [result.strategy]: result })
        setComparison(null)
        setPlanStrategy(result.strategy)
      }
      setStatus("ready")
    } catch (requestError) {
      if (currentRequest !== requestVersion.current) return
      setStatus("idle")
      setAllocations({})
      setComparison(null)
      setError(
        requestError instanceof TypeError
          ? "Unable to reach the subnet calculation service."
          : requestError instanceof Error
            ? requestError.message
            : "Unable to calculate the address plan.",
      )
    }
  }

  async function generateConfig() {
    if (!allocations[planStrategy]) return
    setConfigStatus("loading")
    setError("")
    const currentRequest = ++requestVersion.current
    try {
      const result = await postApi(
        "/api/v1/config/cisco-ios",
        requestBody(planStrategy),
        isConfigResult,
      )
      if (currentRequest !== requestVersion.current) return
      setConfig(result.configuration)
      setConfigStatus("ready")
    } catch (requestError) {
      if (currentRequest !== requestVersion.current) return
      setConfigStatus("idle")
      setError(
        requestError instanceof TypeError
          ? "Unable to reach the configuration service."
          : requestError instanceof Error
            ? requestError.message
            : "Unable to generate configuration.",
      )
    }
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(config)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setError("Unable to copy the configuration. Check clipboard permissions and try again.")
    }
  }

  function downloadConfig() {
    const file = new Blob([config], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")
    link.href = url
    link.download = `config-example-${planStrategy.toLowerCase()}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  function downloadReport() {
    const csv = createSubnetReport(
      planResult?.summary.parent_network ?? parentCidr.trim(),
      visibleResults,
      strategy === "Compare" ? comparison : null,
    )
    const file = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")
    link.href = url
    link.download = `subnet-plan-${strategy === "Compare" ? "comparison" : strategy.toLowerCase()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const visibleResults = strategy === "Compare"
    ? [allocations.FLSM, allocations.VLSM].filter(
        (result): result is AllocationResult => result !== undefined,
      )
    : [allocations[strategy]].filter(
        (result): result is AllocationResult => result !== undefined,
      )
  const addressDifference =
    comparison?.address_savings_with_vlsm === 0
      ? "the same number of allocated addresses"
      : comparison
        ? `${formatNumber(Math.abs(comparison.address_savings_with_vlsm))} ${comparison.address_savings_with_vlsm < 0 ? "more" : "fewer"} allocated addresses`
        : ""
  const wasteDifference =
    comparison?.usable_host_waste_reduction_with_vlsm === 0
      ? "the same amount of usable-host waste"
      : comparison
        ? `${formatNumber(Math.abs(comparison.usable_host_waste_reduction_with_vlsm))} ${comparison.usable_host_waste_reduction_with_vlsm < 0 ? "more" : "fewer"} usable-host waste addresses`
        : ""

  return (
    <div className="planner-shell">
      <header className="application-bar">
        <div className="application-identity">
          <svg className="calculator-mark" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="2.5" width="16" height="19" rx="1.5" fill="currentColor" />
            <rect x="7" y="5.5" width="10" height="4" rx=".5" fill="#d9edf7" />
            <path d="M8 13h1m3 0h1m3 0h1M8 17h1m3 0h1m3 0h1" stroke="#07486a" strokeLinecap="round" strokeWidth="2" />
          </svg>
          <div><strong>IPv4 Subnet Calculator</strong></div>
        </div>
      </header>

      <main className="workspace">
        <section className="workspace-panel" aria-labelledby="network-title">
          <div className="panel-header"><h1 id="network-title">Network Requirements</h1></div>
          <div className="network-controls">
            <label className="field">
              <span>Parent network</span>
              <input value={parentCidr} onChange={(event) => updateParentCidr(event.target.value)} placeholder="e.g. 10.44.0.0/21" spellCheck={false} />
              {poolSize && <small>{formatNumber(poolSize)} addresses</small>}
            </label>
            <fieldset className="strategy-field">
              <legend>Calculation mode</legend>
              <div className="segmented-control">
                {(["Compare", "FLSM", "VLSM"] as Strategy[]).map((item) => (
                  <button key={item} type="button" className={strategy === item ? "is-active" : ""} aria-pressed={strategy === item} onClick={() => changeStrategy(item)}>{item}</button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="subsection-header">
            <h2>Subnet Requirements</h2>
            <span>{demands.length} subnets / {formatNumber(totalHosts)} hosts</span>
          </div>
          <div className="table-scroll">
            <table className="demand-table">
              <thead><tr><th scope="col">Subnet name</th><th scope="col">Hosts required</th><th scope="col">VLAN ID</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {demands.map((demand) => (
                  <tr key={demand.id}>
                    <td><input aria-label={`Subnet name for row ${demand.id}`} placeholder="e.g. Engineering" maxLength={48} value={demand.name} onChange={(event) => updateDemand(demand.id, "name", event.target.value)} /></td>
                    <td><input aria-label={`Hosts required for ${demand.name || `row ${demand.id}`}`} type="number" inputMode="numeric" min="1" max={parentLimits?.maxHostsPerSubnet ?? 4_294_967_294} step="1" placeholder={parentLimits ? `1-${parentLimits.maxHostsPerSubnet}` : "Whole number"} value={demand.hosts} onChange={(event) => updateDemand(demand.id, "hosts", event.target.value)} /></td>
                    <td><input aria-label={`VLAN ID for ${demand.name || `row ${demand.id}`}`} type="number" inputMode="numeric" min="1" max="4094" step="1" placeholder="Optional, 1-4094" value={demand.vlan} onChange={(event) => updateDemand(demand.id, "vlan", event.target.value)} /></td>
                    <td><button className="remove-button" type="button" aria-label={`Remove ${demand.name || `row ${demand.id}`}`} disabled={demands.length === 1} onClick={() => removeDemand(demand.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="action-row">
            <button className="button button--secondary" type="button" onClick={addDemand} disabled={demands.length >= 256}>Add subnet</button>
            <button className="button button--primary" type="button" onClick={calculate} disabled={status === "calculating"}>{status === "calculating" ? "Calculating..." : "Calculate"}</button>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
        </section>

        <section className="workspace-panel results" aria-labelledby="results-title">
          <div className="panel-header"><h2 id="results-title">Calculation Results</h2></div>
          {status !== "ready" ? (
            <div className="empty-state">Enter the network requirements and select Calculate.</div>
          ) : (
            <>
              <div className={`results-grid ${visibleResults.length === 1 ? "results-grid--single" : ""}`}>
                {visibleResults.map((result) => <MetricGrid key={result.strategy} result={result} />)}
              </div>
              {strategy === "Compare" && comparison && <div className="comparison-summary">Compared with FLSM, VLSM uses {addressDifference} and has {wasteDifference}.</div>}

              <div className="detail-tabs">
                <div role="tablist" aria-label="Result details">
                  {(["Address plan", "Config example"] as ResultTab[]).map((tab) => (
                    <button role="tab" type="button" key={tab} aria-selected={activeTab === tab} className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>
                  ))}
                </div>
                <button className="button button--secondary report-download" type="button" onClick={downloadReport}>Download report</button>
              </div>

              {activeTab === "Address plan" && planResult ? (
                <div className="table-scroll">
                  <table className="plan-table">
                    <thead><tr><th scope="col">Subnet</th><th scope="col">VLAN</th><th scope="col">Network</th><th scope="col">Mask</th><th scope="col">First host</th><th scope="col">Last host</th><th scope="col">Broadcast</th><th scope="col">Total</th><th scope="col">Usable</th><th scope="col">Requested</th><th scope="col">Waste</th></tr></thead>
                    <tbody>{planResult.subnets.map((row) => (
                      <tr key={`${planStrategy}-${row.name}`}><td>{row.name}</td><td>{row.vlan_id ?? "—"}</td><td>{row.network}</td><td>{row.subnet_mask}</td><td>{row.first_host}</td><td>{row.last_host}</td><td>{row.broadcast_address}</td><td>{formatNumber(row.total_addresses)}</td><td>{formatNumber(row.usable_hosts)}</td><td>{formatNumber(row.requested_hosts)}</td><td>{formatNumber(row.usable_host_waste)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : activeTab === "Config example" ? (
                <div className="config-panel">
                  <div className="config-toolbar">
                    <p><strong>Review required.</strong> Verify interface names, gateway policy, DHCP behavior, and device syntax before use.</p>
                    <div>
                      {config && <><button className="button button--secondary" type="button" onClick={copyConfig}>{copied ? "Copied" : "Copy"}</button><button className="button button--secondary" type="button" onClick={downloadConfig}>Download</button></>}
                      <button className="button button--primary" type="button" onClick={generateConfig} disabled={configStatus === "loading"}>{configStatus === "loading" ? "Generating..." : "Generate config"}</button>
                    </div>
                  </div>
                  <pre className="code-block"><code>{config || "No configuration generated."}</code></pre>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
      <footer className="status-bar"><span>Conventional IPv4 subnetting</span><span>No device connection</span></footer>
    </div>
  )
}

export default SubnetPlanner
