import { supabase } from '../supabaseClient'

export async function getInventoryMetrics() {
  const [assetsRes, batchItemsRes, completedBatchesRes, stockRes] = await Promise.all([
    supabase
      .from('intake_items')
      .select('id, net_weight, estimated_purity, status, disposition, intake_headers(visit_date)')
      .in('status', ['received', 'tested', 'batched']),
    supabase
      .from('melting_batch_items')
      .select('id, melting_batches(batch_code, status)'),
    supabase
      .from('melting_batches')
      .select('id')
      .eq('status', 'completed')
      .eq('stock_created', false),
    supabase
      .from('stock')
      .select('id, weight, recoverable_gold, status')
      .in('status', ['available', 'reserved'])
  ])

  const assets = assetsRes.data || []
  const batchItems = batchItemsRes.data || []
  const completedBatches = completedBatchesRes.data || []
  const stock = stockRes.data || []

  const totalAssets = assets.length
  const totalCustomerWeight = parseFloat(assets.reduce((s, i) => s + (parseFloat(i.net_weight) || 0), 0).toFixed(3))
  const totalPureGoldEquivalent = parseFloat(assets.reduce((s, i) => {
    const n = parseFloat(i.net_weight) || 0
    const p = parseFloat(i.estimated_purity) || 0
    return s + (n * p / 100)
  }, 0).toFixed(3))
  const repairCount = assets.filter(i => i.disposition === 'repair').length
  const readyForMelting = assets.filter(i => i.status === 'tested' && i.disposition === 'melt').length
  const openBatches = new Set(
    batchItems.filter(bi => bi.melting_batches?.status === 'open').map(bi => bi.melting_batches?.batch_code).filter(Boolean)
  ).size
  const completedAwaitingStock = completedBatches.length
  const availableStockWeight = parseFloat(stock.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0).toFixed(3))
  const availableStockCount = stock.length

  const staleAssets = assets.filter(i => {
    const days = Math.floor((new Date() - new Date(i.intake_headers?.visit_date)) / (1000 * 60 * 60 * 24))
    return days > 30
  }).length
  const healthDeductions = (staleAssets * 5) + (completedAwaitingStock * 10) + (openBatches > 3 ? 10 : 0)
  const healthScore = Math.max(100 - healthDeductions, 0)

  return {
    totalAssets, totalCustomerWeight, totalPureGoldEquivalent,
    repairCount, readyForMelting, openBatches,
    completedAwaitingStock, availableStockWeight, availableStockCount, healthScore
  }
}

export async function getMeltingMetrics() {
  const { data } = await supabase
    .from('melting_batches')
    .select('recovery_percentage, actual_melted_weight, actual_recoverable_gold, status')
    .eq('status', 'completed')
  if (!data || data.length === 0) return { avgRecovery: 0, bestRecovery: 0, worstRecovery: 0, totalMelted: 0, batchCount: 0 }
  const recoveries = data.map(b => parseFloat(b.recovery_percentage) || 0).filter(r => r > 0)
  return {
    avgRecovery: parseFloat((recoveries.reduce((s, r) => s + r, 0) / (recoveries.length || 1)).toFixed(2)),
    bestRecovery: parseFloat(Math.max(...recoveries, 0).toFixed(2)),
    worstRecovery: parseFloat(Math.min(...recoveries, 100).toFixed(2)),
    totalMelted: parseFloat(data.reduce((s, b) => s + (parseFloat(b.actual_melted_weight) || 0), 0).toFixed(3)),
    batchCount: data.length
  }
}

export async function getStockMetrics() {
  const { data } = await supabase.from('stock').select('weight, remaining_weight, reserved_weight, consumed_weight, status')
  if (!data) return { totalStock: 0, available: 0, reserved: 0, consumed: 0 }
  return {
    totalStock: parseFloat(data.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0).toFixed(3)),
    available: parseFloat(data.filter(r => r.status === 'available').reduce((s, r) => s + (parseFloat(r.remaining_weight || r.weight) || 0), 0).toFixed(3)),
    reserved: parseFloat(data.reduce((s, r) => s + (parseFloat(r.reserved_weight) || 0), 0).toFixed(3)),
    consumed: parseFloat(data.reduce((s, r) => s + (parseFloat(r.consumed_weight) || 0), 0).toFixed(3))
  }
}