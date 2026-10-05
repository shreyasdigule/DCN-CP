import { useMemo, useState } from "react"
import "./subnet-planner.css"

type Strategy = "Compare" | "FLSM" | "VLSM"
type AllocationStrategy = "FLSM" | "VLSM"
type ResultTab = "Address plan" | "Cisco IOS config"

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

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
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
  if (!value || typeof value !== "object" || !("detail" in value)) {
    return "The service returned an unexpected response."
  }
  const detail = (value as { detail: unknown }).detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== "object") return "Invalid input"
        const message = "msg" in item ? String(item.msg) : "Invalid input"
        const location =
          "loc" in item && Array.isArray(item.loc)
            ? item.loc.filter((part) => part !== "body").join(" → ")
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

  const totalHosts = useMemo(
    () => demands.reduce((total, demand) => total + Number(demand.hosts || 0), 0),
    [demands],
  )
  const planResult = allocations[planStrategy]
  const poolSize = planResult?.summary.pool_addresses

  function updateDemand(id: number, field: "name" | "hosts" | "vlan", value: string) {
    setDemands((current) =>
      current.map((demand) => {
        if (demand.id !== id) return demand
        if (field === "name") return { ...demand, name: value }
        return { ...demand, [field]: value === "" ? "" : Number(value) }
      }),
    )
  }

  function addDemand() {
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
    setDemands((current) => current.filter((demand) => demand.id !== id))
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
    if (demands.some((demand) => !Number.isInteger(Number(demand.hosts)) || Number(demand.hosts) < 1)) {
      return "Hosts required must be a positive whole number."
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

    try {
      const requestStrategy = strategy === "Compare" ? "BOTH" : strategy
      const response = await fetch(`${API_BASE_URL}/api/v1/subnets/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(requestStrategy)),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(getErrorMessage(data))

      if (requestStrategy === "BOTH") {
        const result = data as ComparisonResult
        setAllocations({ FLSM: result.flsm, VLSM: result.vlsm })
        setComparison(result.comparison)
        setPlanStrategy("VLSM")
      } else {
        const result = data as AllocationResult
        setAllocations({ [result.strategy]: result })
        setComparison(null)
        setPlanStrategy(result.strategy)
      }
      setStatus("ready")
    } catch (requestError) {
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
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/config/cisco-ios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(planStrategy)),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(getErrorMessage(data))
      setConfig((data as { configuration: string }).configuration)
      setConfigStatus("ready")
    } catch (requestError) {
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
    await navigator.clipboard.writeText(config)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const visibleResults = strategy === "Compare"
    ? ([allocations.FLSM, allocations.VLSM].filter(Boolean) as AllocationResult[])
    : ([allocations[strategy]].filter(Boolean) as AllocationResult[])

  return (
    <div className="planner-shell">
      <header className="application-bar">
        <div className="application-identity">
          <div><strong>IPv4 Subnet Calculator</strong></div>
        </div>
        <span className="application-mode">Planning Workspace</span>
      </header>

      <main className="workspace">
        <section className="workspace-panel" aria-labelledby="network-title">
          <div className="panel-header"><h1 id="network-title">Network Requirements</h1></div>
          <div className="network-controls">
            <label className="field">
              <span>Parent network</span>
              <input value={parentCidr} onChange={(event) => setParentCidr(event.target.value)} spellCheck={false} />
              {poolSize && <small>{formatNumber(poolSize)} addresses</small>}
            </label>
            <fieldset className="strategy-field">
              <legend>Calculation mode</legend>
              <div className="segmented-control">
                {(["Compare", "FLSM", "VLSM"] as Strategy[]).map((item) => (
                  <button key={item} type="button" className={strategy === item ? "is-active" : ""} aria-pressed={strategy === item} onClick={() => setStrategy(item)}>{item}</button>
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
                    <td><input aria-label={`Subnet name for row ${demand.id}`} value={demand.name} onChange={(event) => updateDemand(demand.id, "name", event.target.value)} /></td>
                    <td><input aria-label={`Hosts required for ${demand.name || `row ${demand.id}`}`} type="number" min="1" value={demand.hosts} onChange={(event) => updateDemand(demand.id, "hosts", event.target.value)} /></td>
                    <td><input aria-label={`VLAN ID for ${demand.name || `row ${demand.id}`}`} type="number" min="1" max="4094" value={demand.vlan} onChange={(event) => updateDemand(demand.id, "vlan", event.target.value)} /></td>
                    <td><button className="remove-button" type="button" aria-label={`Remove ${demand.name || `row ${demand.id}`}`} disabled={demands.length === 1} onClick={() => removeDemand(demand.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="action-row">
            <button className="button button--secondary" type="button" onClick={addDemand}>Add subnet</button>
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
              {comparison && <div className="comparison-summary">VLSM allocates {formatNumber(comparison.address_savings_with_vlsm)} fewer addresses and reduces usable-host waste by {formatNumber(comparison.usable_host_waste_reduction_with_vlsm)} addresses.</div>}

              <div className="detail-tabs">
                <div role="tablist" aria-label="Result details">
                  {(["Address plan", "Cisco IOS config"] as ResultTab[]).map((tab) => (
                    <button role="tab" type="button" key={tab} aria-selected={activeTab === tab} className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>
                  ))}
                </div>
                {Object.keys(allocations).length > 1 && (
                  <label className="result-selector">View <select value={planStrategy} onChange={(event) => { setPlanStrategy(event.target.value as AllocationStrategy); setConfig(""); setConfigStatus("idle") }}><option>FLSM</option><option>VLSM</option></select></label>
                )}
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
              ) : activeTab === "Cisco IOS config" ? (
                <div className="config-panel">
                  <div className="config-toolbar">
                    <p><strong>Review required.</strong> Verify interface names, gateway policy, DHCP behavior, and device syntax before use.</p>
                    <div>
                      {config && <button className="button button--secondary" type="button" onClick={copyConfig}>{copied ? "Copied" : "Copy"}</button>}
                      <button className="button button--primary" type="button" onClick={generateConfig} disabled={configStatus === "loading"}>{configStatus === "loading" ? "Generating..." : "Generate configuration"}</button>
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
