import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getInventoryMetrics, getMeltingMetrics, getStockMetrics } from '../services/dashboardMetrics'
import { ASSET_STATUS, STOCK_STATUS, DISPOSITION } from '../constants/statuses'

export default function Inventory() {
  const { profile } = useAuth()

  const [summary, setSummary] = useState({
    totalAssets: 0,
    totalCustomerWeight: 0,
    totalPureGoldEquivalent: 0,
    repairCount: 0,
    repairWeight: 0,
    repairPureGold: 0,
    readyForMelting: 0,
    openBatches: 0,
    completedAwaitingStock: 0,
    availableStockWeight: 0,
    availableStockCount: 0,
    controlledGold: 0,
    totalPureGoldInShop: 0,
    healthScore: 100
  })

  const [goldRate, setGoldRate] = useState(null)
  const [agingBuckets, setAgingBuckets] = useState({ a: 0, b: 0, c: 0, d: 0 })
  const [dispositionSummary, setDispositionSummary] = useState([])
  const [funnelData, setFunnelData] = useState([])
  const [meltingMetrics, setMeltingMetrics] = useState(null)
  const [purityVariance, setPurityVariance] = useState(null)

  const [customerAssets, setCustomerAssets] = useState([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [assetSearch, setAssetSearch] = useState('')
  const [assetStatusFilter, setAssetStatusFilter] = useState('all')

  const [readyItems, setReadyItems] = useState([])
  const [openBatchList, setOpenBatchList] = useState([])
  const [completedBatches, setCompletedBatches] = useState([])
  const [loadingMelting, setLoadingMelting] = useState(true)

  const [stockRecords, setStockRecords] = useState([])
  const [loadingStock, setLoadingStock] = useState(true)

  const [creatingStockForBatch, setCreatingStockForBatch] = useState(null)
  const [stockNotes, setStockNotes] = useState('')
  const [creatingStock, setCreatingStock] = useState(false)
  const [createStockError, setCreateStockError] = useState('')

  const [traceSearch, setTraceSearch] = useState('')
  const [traceResults, setTraceResults] = useState(null)
  const [tracingSearch, setTracingSearch] = useState(false)
  const [traceSearched, setTraceSearched] = useState(false)

  // Alerts rebuilt fresh on every fetch — never appended
  const [alerts, setAlerts] = useState({ critical: [], warning: [], info: [] })
  const [success, setSuccess] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    await Promise.all([
      fetchGoldRate(),
      fetchCustomerAssets(),
      fetchMeltingInventory(),
      fetchStock(),
      fetchAnalytics()
    ])
  }

  async function fetchGoldRate() {
    const { data } = await supabase
      .from('gold_rates')
      .select('rate_per_gram')
      .order('rate_date', { ascending: false })
      .limit(1)
    if (data && data.length > 0) setGoldRate(parseFloat(data[0].rate_per_gram))
  }

  async function fetchCustomerAssets() {
    setLoadingAssets(true)
    const { data } = await supabase
      .from('intake_items')
      .select(`
        id, asset_code, ornament_type, gross_weight, net_weight,
        estimated_purity, disposition, status, created_at,
        intake_headers (visit_date, customers (full_name, customer_code, phone))
      `)
      .in('status', [ASSET_STATUS.RECEIVED, ASSET_STATUS.TESTED, ASSET_STATUS.BATCHED])
      .order('created_at', { ascending: false })

    if (data) {
      setCustomerAssets(data)

      // Aging buckets — fresh build
      const buckets = { a: 0, b: 0, c: 0, d: 0 }
      data.forEach(item => {
        const d = daysSinceDate(item.intake_headers?.visit_date)
        if (d <= 7) buckets.a++
        else if (d <= 30) buckets.b++
        else if (d <= 60) buckets.c++
        else buckets.d++
      })
      setAgingBuckets(buckets)

      // Disposition summary
      const dispMap = {}
      data.forEach(i => {
        dispMap[i.disposition] = (dispMap[i.disposition] || 0) + 1
      })
      setDispositionSummary(Object.entries(dispMap).map(([k, v]) => ({ label: k, count: v })))

      // Summary calculations
      const totalCustomerWeight = parseFloat(data.reduce((s, i) => s + (parseFloat(i.net_weight) || 0), 0).toFixed(3))
      const totalPureGoldEquivalent = parseFloat(data.reduce((s, i) => {
        const n = parseFloat(i.net_weight) || 0
        const p = parseFloat(i.estimated_purity) || 0
        return s + (n * p / 100)
      }, 0).toFixed(3))
      const repairItems = data.filter(i => i.disposition === DISPOSITION.REPAIR)
      const repairCount = repairItems.length
      const repairWeight = parseFloat(repairItems.reduce((s, i) => s + (parseFloat(i.net_weight) || 0), 0).toFixed(3))
      const repairPureGold = parseFloat(repairItems.reduce((s, i) => {
        const n = parseFloat(i.net_weight) || 0
        const p = parseFloat(i.estimated_purity) || 0
        return s + (n * p / 100)
      }, 0).toFixed(3))
      const readyForMelting = data.filter(i => i.status === ASSET_STATUS.TESTED && i.disposition === DISPOSITION.MELT).length

      // Alerts — rebuilt completely fresh
      const critical = []
      const warning = []
      data.forEach(item => {
        const d = daysSinceDate(item.intake_headers?.visit_date)
        if (d > 60) critical.push({ message: `🔴 ${item.asset_code} — ${item.intake_headers?.customers?.full_name} in shop ${d} days` })
        else if (d > 30) warning.push({ message: `🟠 ${item.asset_code} — ${item.intake_headers?.customers?.full_name} in shop ${d} days` })
      })

      setSummary(prev => ({
        ...prev,
        totalAssets: data.length,
        totalCustomerWeight,
        totalPureGoldEquivalent,
        repairCount,
        repairWeight,
        repairPureGold,
        readyForMelting
      }))
      setAlerts(prev => ({ ...prev, critical, warning }))
    }
    setLoadingAssets(false)
  }

  async function fetchMeltingInventory() {
    setLoadingMelting(true)

    const [readyRes, openRes, completedRes, meltedRes, batchedRes] = await Promise.all([
      supabase
        .from('intake_items')
        .select(`
          id, asset_code, ornament_type, net_weight, estimated_purity, created_at,
          intake_headers (visit_date, customers (full_name, customer_code)),
          purity_tests (gold_percent, pure_gold_weight)
        `)
        .eq('status', ASSET_STATUS.TESTED)
        .eq('disposition', DISPOSITION.MELT),
      supabase
        .from('melting_batches')
        .select('id, batch_code, asset_count, total_expected_gold, created_at')
        .eq('status', 'open'),
      supabase
        .from('melting_batches')
        .select('id, batch_code, asset_count, total_expected_gold, actual_melted_weight, recovery_percentage, actual_recoverable_gold, batch_gold_percent, completed_at, stock_created')
        .eq('status', 'completed')
        .eq('stock_created', false),
      supabase
        .from('intake_items')
        .select('id')
        .eq('status', ASSET_STATUS.MELTED),
      supabase
        .from('intake_items')
        .select('id')
        .eq('status', ASSET_STATUS.BATCHED)
    ])

    const ready = readyRes.data || []
    const open = openRes.data || []
    const completed = completedRes.data || []
    const meltedCount = meltedRes.data?.length || 0
    const batchedCount = batchedRes.data?.length || 0

    setReadyItems(ready)
    setOpenBatchList(open)
    setCompletedBatches(completed)

    // Funnel — using real counts
    setFunnelData([
      { label: 'Received', color: 'bg-yellow-400', count: null }, // filled from customerAssets
      { label: 'Tested', color: 'bg-blue-400', count: null },
      { label: 'Ready to Melt', color: 'bg-orange-400', count: ready.length },
      { label: 'Batched', color: 'bg-purple-400', count: batchedCount },
      { label: 'Melted', color: 'bg-red-400', count: meltedCount },
    ])

    // Alerts — fresh build, no appending
    const batchAlerts = open
      .filter(b => daysSinceDate(b.created_at?.split('T')[0]) >= 8)
      .map(b => ({ message: `🟠 ${b.batch_code} open for ${daysSinceDate(b.created_at?.split('T')[0])} days` }))
    const stockAlerts = completed
      .map(b => ({ message: `🔵 ${b.batch_code} completed ${daysSinceDate(b.completed_at?.split('T')[0])} day(s) ago — stock not created` }))

    setAlerts(prev => ({ ...prev, warning: [...prev.warning, ...batchAlerts], info: stockAlerts }))

    const uniqueOpen = new Set(open.map(b => b.batch_code)).size
    setSummary(prev => ({ ...prev, openBatches: uniqueOpen, completedAwaitingStock: completed.length }))

    setLoadingMelting(false)
  }

  async function fetchStock() {
    setLoadingStock(true)
    const { data } = await supabase.from('stock').select('*').order('created_at', { ascending: false })

    if (data) {
      setStockRecords(data)
      const active = data.filter(s => s.status === 'available' || s.status === 'reserved')
      const availableStockWeight = parseFloat(active.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0).toFixed(3))

      setSummary(prev => {
        // Controlled gold = customer assets weight + stock weight (no double counting repair)
        const controlledGold = parseFloat((prev.totalCustomerWeight + availableStockWeight).toFixed(3))
        // Pure gold in shop = pure gold from customer assets + recoverable gold from stock
        const stockRecoverableGold = parseFloat(active.reduce((s, r) => s + (parseFloat(r.recoverable_gold) || 0), 0).toFixed(3))
        const totalPureGoldInShop = parseFloat((prev.totalPureGoldEquivalent + stockRecoverableGold).toFixed(3))
        return { ...prev, availableStockWeight, availableStockCount: active.length, controlledGold, totalPureGoldInShop }
      })
    }
    setLoadingStock(false)
  }

  async function fetchAnalytics() {
    const [mMetrics, pTests] = await Promise.all([
      getMeltingMetrics(),
      supabase
        .from('purity_tests')
        .select('gold_percent, estimated_purity')
        .is('cancellation_reason', null)
        .limit(200)
    ])

    setMeltingMetrics(mMetrics)

    const tests = pTests.data || []
    if (tests.length > 0) {
      const variances = tests
        .filter(t => t.gold_percent && t.estimated_purity)
        .map(t => parseFloat(t.gold_percent) - parseFloat(t.estimated_purity))
      if (variances.length > 0) {
        const avg = parseFloat((variances.reduce((s, v) => s + v, 0) / variances.length).toFixed(2))
        const max = parseFloat(Math.max(...variances.map(Math.abs)).toFixed(2))
        setPurityVariance({ avg, max, count: variances.length })
      }
    }
  }

  async function handleCreateStock() {
    if (creatingStock) return
    setCreatingStock(true); setCreateStockError('')
    const batch = completedBatches.find(b => b.id === creatingStockForBatch)
    if (!batch) { setCreateStockError('Batch not found'); setCreatingStock(false); return }

    const weight = parseFloat(batch.actual_melted_weight)

    const { error } = await supabase.from('stock').insert({
      batch_id: batch.id,
      weight,
      gold_percent: batch.batch_gold_percent,
      recoverable_gold: batch.actual_recoverable_gold,
      karat: parseFloat(((parseFloat(batch.batch_gold_percent) / 100) * 24).toFixed(2)),
      status: STOCK_STATUS.AVAILABLE,
      source_batch_code: batch.batch_code,
      total_assets: batch.asset_count,
      remaining_weight: weight,
      reserved_weight: 0,
      consumed_weight: 0,
      notes: stockNotes.trim() || null,
      created_by: profile.id
    })

    if (error) { setCreateStockError(error.message); setCreatingStock(false); return }

    await supabase.from('melting_batches').update({ stock_created: true }).eq('id', batch.id)

    // Update assets to stocked
    const { data: batchItemData } = await supabase
      .from('melting_batch_items')
      .select('intake_item_id')
      .eq('batch_id', batch.id)

    if (batchItemData?.length > 0) {
      await supabase.from('intake_items')
        .update({ status: ASSET_STATUS.STOCKED, updated_at: new Date().toISOString() })
        .in('id', batchItemData.map(bi => bi.intake_item_id))
    }

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'stock', record_id: batch.id,
      field_name: 'stock_created_from_batch',
      old_value: JSON.stringify({ batch_code: batch.batch_code }),
      new_value: JSON.stringify({ batch_code: batch.batch_code, weight, gold_percent: batch.batch_gold_percent, recoverable_gold: batch.actual_recoverable_gold, created_by: profile.full_name, created_at: new Date().toISOString() })
    })

    setCreatingStockForBatch(null); setStockNotes('')
    setSuccess(`✓ Stock created from ${batch.batch_code}`)
    setTimeout(() => setSuccess(''), 5000)
    await fetchAll()
    setCreatingStock(false)
  }

  async function handleTraceSearch() {
    if (!traceSearch.trim()) return
    setTracingSearch(true); setTraceResults(null); setTraceSearched(false)
    const q = traceSearch.trim()

    // TODO: Replace with server-side full-text search when asset count exceeds 5000

    const [assetsRes, customersRes, batchesRes, stocksRes] = await Promise.all([
      supabase.from('intake_items').select(`
        id, asset_code, ornament_type, net_weight, status, disposition, estimated_purity,
        intake_headers (visit_date, customers (full_name, customer_code, phone)),
        purity_tests (gold_percent, pure_gold_weight, test_date)
      `).ilike('asset_code', `%${q}%`).limit(5),
      supabase.from('customers').select('id, full_name, customer_code, phone')
        .or(`full_name.ilike.%${q}%,customer_code.ilike.%${q}%,phone.ilike.%${q}%`).limit(5),
      supabase.from('melting_batches').select(`
        id, batch_code, status, total_expected_gold, actual_melted_weight,
        recovery_percentage, actual_recoverable_gold, batch_gold_percent,
        created_at, completed_at, stock_created, asset_count,
        melting_batch_items (intake_items (asset_code, ornament_type, net_weight, intake_headers (customers (full_name, customer_code))))
      `).ilike('batch_code', `%${q}%`).limit(3),
      supabase.from('stock').select('*').or(`stock_code.ilike.%${q}%,source_batch_code.ilike.%${q}%`).limit(3)
    ])

    const customers = customersRes.data || []
    let customerAssetResults = []
    if (customers.length > 0) {
      const { data: allAssets } = await supabase.from('intake_items').select(`
        id, asset_code, ornament_type, net_weight, status, disposition, estimated_purity,
        intake_headers (visit_date, customers (full_name, customer_code, phone)),
        purity_tests (gold_percent, pure_gold_weight, test_date)
      `).limit(100)
      const codes = new Set(customers.map(c => c.customer_code))
      customerAssetResults = (allAssets || []).filter(a => codes.has(a.intake_headers?.customers?.customer_code))
    }

    setTraceResults({ assets: assetsRes.data || [], customers, batches: batchesRes.data || [], stocks: stocksRes.data || [], customerAssets: customerAssetResults })
    setTraceSearched(true)
    setTracingSearch(false)
  }

  function daysSinceDate(dateStr) {
    if (!dateStr) return 0
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24))
  }

  function daysLabel(dateStr) {
    const d = daysSinceDate(dateStr)
    if (d === 0) return 'Today'
    if (d === 1) return '1 day'
    return `${d} days`
  }

  function daysColor(days) {
    if (days <= 7) return 'text-gray-400'
    if (days <= 30) return 'text-yellow-600'
    return 'text-red-600 font-bold'
  }

  function batchAgeColor(days) {
    if (days <= 3) return 'text-green-600'
    if (days <= 7) return 'text-yellow-600'
    return 'text-red-600 font-bold'
  }

  function healthLabel(score) {
    if (score >= 90) return { label: 'Healthy', color: 'text-green-600', bg: 'bg-green-500', border: 'border-green-200' }
    if (score >= 70) return { label: 'Needs Attention', color: 'text-yellow-600', bg: 'bg-yellow-500', border: 'border-yellow-200' }
    return { label: 'Critical', color: 'text-red-600', bg: 'bg-red-500', border: 'border-red-200' }
  }

  function getPurityTest(item) {
    const pt = item.purity_tests
    if (!pt) return null
    return Array.isArray(pt) ? pt[0] : pt
  }

  function calcPureGold(netWeight, purity) {
    const n = parseFloat(netWeight) || 0
    const p = parseFloat(purity) || 0
    if (!n || !p) return null
    return (n * p / 100).toFixed(3)
  }

  const statusColors = {
    received: 'bg-yellow-50 text-yellow-700',
    tested: 'bg-blue-50 text-blue-700',
    batched: 'bg-orange-50 text-orange-700',
    melted: 'bg-red-50 text-red-600',
    stocked: 'bg-green-50 text-green-700',
    returned: 'bg-gray-100 text-gray-500',
    cancelled: 'bg-red-100 text-red-400'
  }

  const dispositionColors = {
    melt: 'bg-orange-50 text-orange-700',
    resale: 'bg-blue-50 text-blue-700',
    exchange: 'bg-purple-50 text-purple-700',
    return: 'bg-gray-100 text-gray-600',
    repair: 'bg-teal-50 text-teal-700',
    testing: 'bg-indigo-50 text-indigo-700'
  }

  const filteredAssets = customerAssets.filter(item => {
    const q = assetSearch.toLowerCase()
    const matchesSearch = !q ||
      (item.asset_code || '').toLowerCase().includes(q) ||
      (item.ornament_type || '').toLowerCase().includes(q) ||
      (item.intake_headers?.customers?.full_name || '').toLowerCase().includes(q) ||
      (item.intake_headers?.customers?.customer_code || '').toLowerCase().includes(q) ||
      (item.intake_headers?.customers?.phone || '').toLowerCase().includes(q)
    const matchesStatus = assetStatusFilter === 'all' || item.status === assetStatusFilter
    return matchesSearch && matchesStatus
  })

  const totalAlerts = alerts.critical.length + alerts.warning.length + alerts.info.length
  const health = healthLabel(summary.healthScore)

  // Inventory value using pure gold equivalent × gold rate
  const inventoryValue = goldRate && summary.totalPureGoldInShop
    ? (summary.totalPureGoldInShop * goldRate).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    : null

  // Computed funnel with real counts from customerAssets
  const receivedCount = customerAssets.filter(i => i.status === ASSET_STATUS.RECEIVED).length
  const testedCount = customerAssets.filter(i => i.status === ASSET_STATUS.TESTED).length
  const fullFunnel = [
    { label: 'Received', color: 'bg-yellow-400', count: receivedCount },
    { label: 'Tested', color: 'bg-blue-400', count: testedCount },
    { label: 'Ready to Melt', color: 'bg-orange-400', count: summary.readyForMelting },
    { label: 'Batched', color: 'bg-purple-400', count: funnelData.find(f => f.label === 'Batched')?.count ?? 0 },
    { label: 'Melted', color: 'bg-red-400', count: funnelData.find(f => f.label === 'Melted')?.count ?? 0 },
    { label: 'Stocked', color: 'bg-green-500', count: summary.availableStockCount },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Inventory</h2>
          <p className="text-sm text-gray-500 mt-0.5">Operational control center — single source of truth</p>
        </div>
        <button onClick={fetchAll} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition">↻ Refresh</button>
      </div>

      {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{success}</div>}

      {/* Create Stock Modal */}
      {creatingStockForBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            {(() => {
              const batch = completedBatches.find(b => b.id === creatingStockForBatch)
              return (
                <>
                  <h3 className="text-base font-semibold text-gray-800 mb-4">Create Stock from Batch</h3>
                  <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm space-y-1.5">
                    <div className="flex justify-between"><span className="text-gray-500">Batch</span><span className="font-mono text-yellow-700 font-medium">{batch?.batch_code}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Assets</span><span>{batch?.asset_count}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Actual Weight</span><span className="font-medium">{batch?.actual_melted_weight}g</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Gold %</span><span>{parseFloat(batch?.batch_gold_percent || 0).toFixed(3)}%</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Karat</span><span className="text-yellow-700">{batch?.batch_gold_percent ? ((parseFloat(batch.batch_gold_percent) / 100) * 24).toFixed(2) : '—'}K</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Recoverable Gold</span><span className="text-green-700 font-medium">{batch?.actual_recoverable_gold}g</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Recovery</span><span className={`font-medium ${parseFloat(batch?.recovery_percentage) >= 99 ? 'text-green-600' : parseFloat(batch?.recovery_percentage) >= 97 ? 'text-yellow-600' : 'text-red-600'}`}>{batch?.recovery_percentage}%</span></div>
                    <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1"><span className="text-gray-500">Initial Remaining</span><span className="text-blue-700 font-medium">{batch?.actual_melted_weight}g</span></div>
                  </div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                  <input type="text" value={stockNotes} onChange={e => setStockNotes(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 mb-4"
                    placeholder="Any notes about this stock lot..." />
                  {createStockError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{createStockError}</div>}
                  <div className="flex justify-end gap-3">
                    <button onClick={() => { setCreatingStockForBatch(null); setStockNotes(''); setCreateStockError('') }}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button disabled={creatingStock} onClick={handleCreateStock}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                      {creatingStock ? 'Creating...' : 'Confirm Create Stock'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Section 1 — Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Assets In Shop</p>
          <p className="text-2xl font-bold text-gray-800">{summary.totalAssets}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.totalCustomerWeight}g net weight</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Pure Gold Equivalent</p>
          <p className="text-2xl font-bold text-yellow-600">{summary.totalPureGoldEquivalent}g</p>
          <p className="text-xs text-gray-400 mt-1">based on estimated purity</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Pure Gold In Shop</p>
          <p className="text-2xl font-bold text-green-600">{summary.totalPureGoldInShop}g</p>
          <p className="text-xs text-gray-400 mt-1">assets + refined stock</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Inventory Value</p>
          <p className="text-xl font-bold text-green-700">{inventoryValue || '—'}</p>
          <p className="text-xs text-gray-400 mt-1">{goldRate ? `₹${goldRate}/g (24K)` : 'no gold rate set'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Ready for Melting</p>
          <p className="text-2xl font-bold text-orange-600">{summary.readyForMelting}</p>
          <p className="text-xs text-gray-400 mt-1">tested · disposition melt</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Open Batches</p>
          <p className="text-2xl font-bold text-yellow-600">{summary.openBatches}</p>
          <p className="text-xs text-gray-400 mt-1">active melting batches</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Awaiting Stock</p>
          <p className="text-2xl font-bold text-yellow-600">{summary.completedAwaitingStock}</p>
          <p className="text-xs text-gray-400 mt-1">completed batches</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Refined Gold Stock</p>
          <p className="text-2xl font-bold text-green-600">{summary.availableStockWeight}g</p>
          <p className="text-xs text-gray-400 mt-1">{summary.availableStockCount} lot{summary.availableStockCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Reconciliation + Health Row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium mb-3">Inventory Reconciliation</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-center">
              <p className="text-xs text-gray-400">Customer Assets</p>
              <p className="text-base font-bold text-gray-700">{summary.totalCustomerWeight}g</p>
              <p className="text-xs text-yellow-600">{summary.totalPureGoldEquivalent}g pure</p>
            </div>
            <span className="text-gray-300">+</span>
            <div className="text-center">
              <p className="text-xs text-gray-400">Refined Stock</p>
              <p className="text-base font-bold text-gray-700">{summary.availableStockWeight}g</p>
            </div>
            <span className="text-gray-300">=</span>
            <div className="text-center">
              <p className="text-xs text-yellow-600 font-medium">Total Controlled</p>
              <p className="text-xl font-bold text-yellow-700">{summary.controlledGold}g</p>
            </div>
          </div>
          {summary.repairCount > 0 && (
            <p className="text-xs text-teal-600 mt-2">* {summary.repairCount} repair asset(s) ({summary.repairWeight}g) included in customer assets</p>
          )}
        </div>

        <div className={`bg-white border ${health.border} rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium">Inventory Health</p>
            <span className={`text-sm font-bold ${health.color}`}>{health.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <p className={`text-3xl font-bold ${health.color}`}>{summary.healthScore}%</p>
            <div className="flex-1 bg-gray-100 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all ${health.bg}`} style={{ width: `${summary.healthScore}%` }} />
            </div>
          </div>
          {totalAlerts > 0 && <p className="text-xs text-gray-400 mt-2">{totalAlerts} alert{totalAlerts !== 1 ? 's' : ''} require attention</p>}
        </div>
      </div>

      {/* Disposition Summary */}
      {dispositionSummary.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-xs text-gray-500 font-medium mb-3">Asset Disposition Summary</p>
          <div className="flex gap-4 flex-wrap">
            {dispositionSummary.map(d => (
              <div key={d.label} className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dispositionColors[d.label] || 'bg-gray-100 text-gray-500'}`}>{d.label}</span>
                <span className="text-sm font-bold text-gray-700">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Flow Funnel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Inventory Flow Pipeline</h3>
        <div className="flex items-stretch gap-1">
          {fullFunnel.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-1 flex-1">
              <div className={`flex-1 ${stage.color} rounded-lg px-2 py-3 text-center text-white`}>
                <p className="text-xl font-bold">{stage.count}</p>
                <p className="text-xs opacity-90 mt-0.5">{stage.label}</p>
              </div>
              {i < fullFunnel.length - 1 && <span className="text-gray-300 text-base flex-shrink-0">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Aging Analysis */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Asset Aging Analysis</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">0–7 days</p>
            <p className="text-2xl font-bold text-gray-700">{agingBuckets.a}</p>
            <p className="text-xs text-gray-400">fresh</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">8–30 days</p>
            <p className="text-2xl font-bold text-yellow-700">{agingBuckets.b}</p>
            <p className="text-xs text-yellow-500">monitor</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">31–60 days</p>
            <p className="text-2xl font-bold text-orange-600">{agingBuckets.c}</p>
            <p className="text-xs text-orange-500">attention</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">60+ days</p>
            <p className="text-2xl font-bold text-red-600">{agingBuckets.d}</p>
            <p className="text-xs text-red-500">critical</p>
          </div>
        </div>
      </div>

      {/* Operational Queue */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Operational Queue</h3>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Awaiting Purity Test', count: customerAssets.filter(i => i.status === ASSET_STATUS.RECEIVED).length, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: 'Ready to Melt', count: summary.readyForMelting, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'In Repair', count: summary.repairCount, color: 'text-teal-600', bg: 'bg-teal-50' },
            { label: 'Batches Open', count: summary.openBatches, color: 'text-yellow-700', bg: 'bg-yellow-50' },
            { label: 'Awaiting Stock', count: summary.completedAwaitingStock, color: 'text-green-600', bg: 'bg-green-50' },
          ].map(item => (
            <div key={item.label} className={`${item.bg} rounded-lg p-3 text-center`}>
              <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
              <p className="text-xs text-gray-500 mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {totalAlerts > 0 && (
        <div className="bg-white border border-orange-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-orange-700 mb-3">Inventory Alerts ({totalAlerts})</h3>
          {alerts.critical.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-red-600 mb-1">Critical ({alerts.critical.length})</p>
              <div className="space-y-1">{alerts.critical.map((a, i) => <div key={i} className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg">{a.message}</div>)}</div>
            </div>
          )}
          {alerts.warning.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-orange-600 mb-1">Warning ({alerts.warning.length})</p>
              <div className="space-y-1">{alerts.warning.map((a, i) => <div key={i} className="text-xs bg-orange-50 text-orange-700 px-3 py-2 rounded-lg">{a.message}</div>)}</div>
            </div>
          )}
          {alerts.info.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-1">Info ({alerts.info.length})</p>
              <div className="space-y-1">{alerts.info.map((a, i) => <div key={i} className="text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">{a.message}</div>)}</div>
            </div>
          )}
        </div>
      )}

      {/* Global Traceability Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
        <h3 className="text-base font-semibold text-gray-700 mb-3">Global Traceability Search</h3>
        <div className="flex gap-3">
          <input type="text" value={traceSearch} onChange={e => setTraceSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTraceSearch()}
            placeholder="Search by customer name, code, phone, asset code, batch code or stock code..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
          <button onClick={handleTraceSearch} disabled={tracingSearch}
            className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
            {tracingSearch ? 'Searching...' : 'Search'}
          </button>
        </div>

        {traceSearched && traceResults && (
          <div className="mt-5 space-y-5">
            {/* Customers */}
            {traceResults.customers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customers ({traceResults.customers.length})</p>
                {traceResults.customers.map(c => (
                  <div key={c.id} className="bg-gray-50 rounded-lg px-4 py-3 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <div><span className="font-medium text-gray-800">{c.full_name}</span><span className="text-gray-400 text-xs ml-2">{c.customer_code}</span></div>
                      <span className="text-xs text-gray-400">{c.phone}</span>
                    </div>
                    {traceResults.customerAssets.filter(a => a.intake_headers?.customers?.customer_code === c.customer_code).map(a => {
                      const pt = getPurityTest(a)
                      return (
                        <div key={a.id} className="mb-2 pl-3 border-l-2 border-gray-200">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono text-yellow-700 text-xs font-medium">{a.asset_code}</span>
                            <span className="text-xs text-gray-600">{a.ornament_type}</span>
                            <span className="text-xs text-gray-500">{a.net_weight}g</span>
                            {calcPureGold(a.net_weight, a.estimated_purity) && <span className="text-xs text-green-700">{calcPureGold(a.net_weight, a.estimated_purity)}g pure</span>}
                            <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[a.status] || 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded">Received {a.intake_headers?.visit_date}</span>
                            {pt && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">Tested {pt.test_date} · {pt.gold_percent}%</span></>}
                            {a.status === 'batched' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded">Batched</span></>}
                            {a.status === 'melted' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded">Melted</span></>}
                            {a.status === 'stocked' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">Stocked</span></>}
                            {a.status === 'returned' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">Returned</span></>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Assets */}
            {traceResults.assets.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Assets ({traceResults.assets.length})</p>
                {traceResults.assets.map(item => {
                  const pt = getPurityTest(item)
                  return (
                    <div key={item.id} className="bg-gray-50 rounded-lg px-4 py-3 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-yellow-700 font-medium">{item.asset_code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[item.status] || 'bg-gray-100 text-gray-500'}`}>{item.status}</span>
                      </div>
                      <p className="text-sm text-gray-700">{item.intake_headers?.customers?.full_name} <span className="text-gray-400 text-xs">({item.intake_headers?.customers?.customer_code})</span> — {item.ornament_type}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span>Net: {item.net_weight}g</span>
                        <span>Est: {item.estimated_purity}%</span>
                        <span className="text-green-700">Est. Pure Gold: {calcPureGold(item.net_weight, item.estimated_purity) || '—'}g</span>
                        {pt && <span>Tested: {pt.gold_percent}%</span>}
                        {pt && <span className="text-green-700 font-medium">Tested Pure Gold: {pt.pure_gold_weight}g</span>}
                        <span>Visit: {item.intake_headers?.visit_date}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded">Received {item.intake_headers?.visit_date}</span>
                        {pt && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">Tested {pt.test_date}</span></>}
                        {item.status === 'batched' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded">Batched</span></>}
                        {item.status === 'melted' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded">Melted</span></>}
                        {item.status === 'stocked' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">Stocked</span></>}
                        {item.status === 'returned' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">Returned</span></>}
                        {item.status === 'cancelled' && <><span className="text-gray-300 text-xs">→</span><span className="text-xs px-2 py-0.5 bg-red-100 text-red-400 rounded">Cancelled</span></>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Batches */}
            {traceResults.batches.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Batches ({traceResults.batches.length})</p>
                {traceResults.batches.map(batch => (
                  <div key={batch.id} className="bg-gray-50 rounded-lg px-4 py-3 mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-yellow-700 font-medium">{batch.batch_code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${batch.status === 'completed' ? 'bg-green-50 text-green-700' : batch.status === 'cancelled' ? 'bg-red-50 text-red-500' : 'bg-yellow-50 text-yellow-700'}`}>{batch.status}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                      <span>Assets: {batch.asset_count}</span>
                      <span>Expected: {batch.total_expected_gold}g</span>
                      {batch.actual_melted_weight && <span>Actual: {batch.actual_melted_weight}g</span>}
                      {batch.recovery_percentage && <span className="text-green-600">Recovery: {batch.recovery_percentage}%</span>}
                      {batch.actual_recoverable_gold && <span className="text-green-700 font-medium">Recoverable: {batch.actual_recoverable_gold}g</span>}
                    </div>
                    {batch.melting_batch_items?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-0.5">
                        {batch.melting_batch_items.map((bi, idx) => (
                          <div key={idx} className="text-xs flex gap-3 pl-2 border-l-2 border-gray-200 text-gray-500">
                            <span className="font-mono text-yellow-700">{bi.intake_items?.asset_code}</span>
                            <span>{bi.intake_items?.intake_headers?.customers?.full_name}</span>
                            <span>{bi.intake_items?.ornament_type}</span>
                            <span>{bi.intake_items?.net_weight}g</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Stock */}
            {traceResults.stocks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Refined Gold Stock ({traceResults.stocks.length})</p>
                {traceResults.stocks.map(s => (
                  <div key={s.id} className="bg-gray-50 rounded-lg px-4 py-3 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-green-700 font-medium">{s.stock_code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'available' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                      <span>Weight: {s.weight}g</span>
                      <span>Remaining: {s.remaining_weight ?? s.weight}g</span>
                      <span>Gold: {parseFloat(s.gold_percent || 0).toFixed(3)}%</span>
                      <span className="text-yellow-700">{s.karat}K</span>
                      <span className="text-green-700">Recoverable: {s.recoverable_gold}g</span>
                    </div>
                    {s.source_batch_code && <p className="text-xs text-gray-400 mt-1">Source: {s.source_batch_code} · {s.total_assets} assets</p>}
                  </div>
                ))}
              </div>
            )}

            {traceResults.assets.length === 0 && traceResults.customers.length === 0 && traceResults.batches.length === 0 && traceResults.stocks.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-sm">No results found for "{traceSearch}"</div>
            )}
          </div>
        )}
      </div>

      {/* Customer Asset Inventory */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-700">Customer Asset Inventory ({filteredAssets.length})</h3>
            <select value={assetStatusFilter} onChange={e => setAssetStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400">
              <option value="all">All Status</option>
              <option value="received">Received</option>
              <option value="tested">Tested</option>
              <option value="batched">Batched</option>
            </select>
          </div>
          <input type="text" value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
            placeholder="Search by customer, code, phone, asset, ornament..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
        </div>
        {loadingAssets ? (
          <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No assets found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Asset</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Ornament</th>
                  <th className="px-4 py-3 text-left">Net</th>
                  <th className="px-4 py-3 text-left">Est. Purity</th>
                  <th className="px-4 py-3 text-left">Pure Gold</th>
                  <th className="px-4 py-3 text-left">Disposition</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Visit Date</th>
                  <th className="px-4 py-3 text-left">Days In Shop</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAssets.map(item => {
                  const days = daysSinceDate(item.intake_headers?.visit_date)
                  const pureGold = calcPureGold(item.net_weight, item.estimated_purity)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-yellow-700 text-xs">{item.asset_code}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-gray-700">{item.intake_headers?.customers?.full_name}</div>
                        <div className="text-gray-400">{item.intake_headers?.customers?.customer_code}</div>
                        <div className="text-gray-400">{item.intake_headers?.customers?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{item.ornament_type}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{item.net_weight}g</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{item.estimated_purity}%</td>
                      <td className="px-4 py-3 text-xs">
                        {pureGold ? <span className="text-green-700 font-medium">{pureGold}g</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dispositionColors[item.disposition] || 'bg-gray-100 text-gray-500'}`}>{item.disposition}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-500'}`}>{item.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.intake_headers?.visit_date}</td>
                      <td className={`px-4 py-3 text-xs ${daysColor(days)}`}>
                        {days > 30 ? '🔴 ' : days > 7 ? '🟡 ' : ''}{daysLabel(item.intake_headers?.visit_date)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Repair Inventory — only shown when repair assets exist */}
      {summary.repairCount > 0 && (
        <div className="bg-white border border-teal-200 rounded-xl p-5 mb-8">
          <h3 className="text-base font-semibold text-gray-700 mb-2">Repair Inventory</h3>
          <div className="bg-teal-50 rounded-lg px-4 py-3">
            <p className="text-sm text-teal-700 font-medium">{summary.repairCount} asset{summary.repairCount !== 1 ? 's' : ''} · {summary.repairWeight}g net · {summary.repairPureGold}g pure gold equivalent</p>
            <p className="text-xs text-teal-500 mt-0.5">Repair module coming soon — full lifecycle tracking will appear here</p>
          </div>
        </div>
      )}

      {/* Melting Inventory */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-gray-700 mb-4">Melting Inventory</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-orange-100 bg-orange-50">
              <h4 className="text-sm font-semibold text-orange-700">Ready for Melting ({readyItems.length})</h4>
            </div>
            {loadingMelting ? <div className="p-4 text-center text-gray-400 text-xs">Loading...</div> :
              readyItems.length === 0 ? <div className="p-4 text-center text-gray-400 text-xs">None</div> :
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {readyItems.map(item => {
                  const pt = getPurityTest(item)
                  const days = daysSinceDate(item.intake_headers?.visit_date)
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-yellow-700 text-xs font-medium">{item.asset_code}</span>
                        <span className={`text-xs ${daysColor(days)}`}>{daysLabel(item.intake_headers?.visit_date)}</span>
                      </div>
                      <p className="text-xs text-gray-700">{item.intake_headers?.customers?.full_name} — {item.ornament_type}</p>
                      <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                        <span>Net: {item.net_weight}g</span>
                        <span>Est: {item.estimated_purity}%</span>
                      </div>
                      <p className="text-xs text-green-700 font-medium">Pure Gold: {pt?.pure_gold_weight}g</p>
                    </div>
                  )
                })}
              </div>
            }
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-yellow-100 bg-yellow-50">
              <h4 className="text-sm font-semibold text-yellow-700">Open Batches ({openBatchList.length})</h4>
            </div>
            {loadingMelting ? <div className="p-4 text-center text-gray-400 text-xs">Loading...</div> :
              openBatchList.length === 0 ? <div className="p-4 text-center text-gray-400 text-xs">None</div> :
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {openBatchList.map(batch => {
                  const age = daysSinceDate(batch.created_at?.split('T')[0])
                  return (
                    <div key={batch.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-yellow-700 text-xs font-medium">{batch.batch_code}</span>
                        <span className={`text-xs font-medium ${batchAgeColor(age)}`}>{daysLabel(batch.created_at?.split('T')[0])} old</span>
                      </div>
                      <p className="text-xs text-gray-500">{batch.asset_count} assets · {batch.total_expected_gold}g expected</p>
                    </div>
                  )
                })}
              </div>
            }
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-green-100 bg-green-50">
              <h4 className="text-sm font-semibold text-green-700">Awaiting Stock ({completedBatches.length})</h4>
            </div>
            {loadingMelting ? <div className="p-4 text-center text-gray-400 text-xs">Loading...</div> :
              completedBatches.length === 0 ? <div className="p-4 text-center text-gray-400 text-xs">None</div> :
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {completedBatches.map(batch => {
                  const age = daysSinceDate(batch.completed_at?.split('T')[0])
                  return (
                    <div key={batch.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-yellow-700 text-xs font-medium">{batch.batch_code}</span>
                        <span className={`text-xs ${daysColor(age)}`}>{daysLabel(batch.completed_at?.split('T')[0])} ago</span>
                      </div>
                      <p className="text-xs text-gray-500">{batch.asset_count} assets</p>
                      <p className="text-xs text-green-700">{batch.actual_recoverable_gold}g recoverable · {batch.recovery_percentage}%</p>
                      <button onClick={() => { setCreatingStockForBatch(batch.id); setStockNotes(''); setCreateStockError('') }}
                        className="mt-2 w-full text-xs bg-green-500 hover:bg-green-600 text-white font-medium py-1.5 rounded-lg">
                        Create Stock
                      </button>
                    </div>
                  )
                })}
              </div>
            }
          </div>
        </div>
      </div>

      {/* Refined Gold Inventory */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-700">Refined Gold Inventory ({stockRecords.length})</h3>
        </div>
        {loadingStock ? (
          <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
        ) : stockRecords.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No stock records yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Stock Code</th>
                  <th className="px-4 py-3 text-left">Source Batch</th>
                  <th className="px-4 py-3 text-left">Assets</th>
                  <th className="px-4 py-3 text-left">Weight</th>
                  <th className="px-4 py-3 text-left">Remaining</th>
                  <th className="px-4 py-3 text-left">Reserved</th>
                  <th className="px-4 py-3 text-left">Consumed</th>
                  <th className="px-4 py-3 text-left">Gold %</th>
                  <th className="px-4 py-3 text-left">Karat</th>
                  <th className="px-4 py-3 text-left">Recoverable</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Age</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stockRecords.map(s => {
                  const age = daysSinceDate(s.created_at?.split('T')[0])
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-green-700 font-medium text-xs">{s.stock_code}</td>
                      <td className="px-4 py-3 font-mono text-yellow-700 text-xs">{s.source_batch_code || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{s.total_assets || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-medium">{s.weight}g</td>
                      <td className="px-4 py-3 text-blue-700 text-xs font-medium">{s.remaining_weight ?? s.weight}g</td>
                      <td className="px-4 py-3 text-orange-600 text-xs">{s.reserved_weight ?? 0}g</td>
                      <td className="px-4 py-3 text-red-500 text-xs">{s.consumed_weight ?? 0}g</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{parseFloat(s.gold_percent || 0).toFixed(3)}%</td>
                      <td className="px-4 py-3 text-yellow-700 text-xs font-medium">{s.karat}K</td>
                      <td className="px-4 py-3 text-green-700 text-xs font-medium">{s.recoverable_gold}g</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          s.status === 'available' ? 'bg-green-50 text-green-700' :
                          s.status === 'reserved' ? 'bg-blue-50 text-blue-700' :
                          s.status === 'used' ? 'bg-gray-100 text-gray-500' :
                          'bg-red-50 text-red-500'
                        }`}>{s.status}</span>
                      </td>
                      <td className={`px-4 py-3 text-xs ${daysColor(age)}`}>{daysLabel(s.created_at?.split('T')[0])}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{s.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Analytics — Recovery + Purity */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Melting Recovery Analytics</h3>
          {meltingMetrics ? (
            meltingMetrics.batchCount === 0 ? (
              <p className="text-sm text-gray-400">No completed batches yet</p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Batches Completed</span>
                  <span className="font-medium text-gray-700">{meltingMetrics.batchCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Melted</span>
                  <span className="font-medium text-gray-700">{meltingMetrics.totalMelted}g</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avg Recovery</span>
                  <span className={`font-bold ${meltingMetrics.avgRecovery >= 99 ? 'text-green-600' : meltingMetrics.avgRecovery >= 97 ? 'text-yellow-600' : 'text-red-600'}`}>{meltingMetrics.avgRecovery}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Best Recovery</span>
                  <span className="font-medium text-green-600">{meltingMetrics.bestRecovery}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Worst Recovery</span>
                  <span className="font-medium text-red-500">{meltingMetrics.worstRecovery}%</span>
                </div>
              </div>
            )
          ) : <p className="text-sm text-gray-400">Loading...</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Purity Accuracy Analytics</h3>
          {purityVariance ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tests Analyzed</span>
                <span className="font-medium text-gray-700">{purityVariance.count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Avg Variance</span>
                <span className={`font-bold ${Math.abs(purityVariance.avg) <= 2 ? 'text-green-600' : Math.abs(purityVariance.avg) <= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {purityVariance.avg > 0 ? '+' : ''}{purityVariance.avg}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Max Variance</span>
                <span className={`font-bold ${purityVariance.max <= 2 ? 'text-green-600' : purityVariance.max <= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                  ±{purityVariance.max}%
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {Math.abs(purityVariance.avg) <= 2 ? '✓ Estimation accuracy is good' : '⚠ Consider reviewing estimation process'}
              </p>
            </div>
          ) : <p className="text-sm text-gray-400">No purity tests yet</p>}
        </div>
      </div>

      {/* Analytics Placeholder */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-base font-semibold text-gray-700 mb-1">Inventory Analytics</h3>
        <p className="text-xs text-gray-400 mb-4">Coming soon — will power Dashboard charts and owner reports</p>
        <div className="grid grid-cols-5 gap-3">
          {['Inventory Value Trend', 'Monthly Gold Flow', 'Stock Turnover Rate', 'Avg Days In Shop', 'Repair Backlog Trend'].map(label => (
            <div key={label} className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-xs text-gray-300 mt-1">Coming Soon</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}