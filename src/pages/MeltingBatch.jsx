import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function MeltingBatch() {
  const { profile } = useAuth()

  const emptyComposition = {
    batch_gold_percent: '',
    batch_silver_percent: '0',
    batch_copper_percent: '0',
    batch_cadmium_percent: '0',
    batch_other_percent: '0'
  }

  const [readyItems, setReadyItems] = useState([])
  const [loadingReady, setLoadingReady] = useState(true)
  const [readySearch, setReadySearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  const [showConfirm, setShowConfirm] = useState(false)
  const [batchNotes, setBatchNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [openBatches, setOpenBatches] = useState([])
  const [loadingOpen, setLoadingOpen] = useState(true)
  const [expandedBatchId, setExpandedBatchId] = useState(null)

  const [completingBatchId, setCompletingBatchId] = useState(null)
  const [actualWeight, setActualWeight] = useState('')
  const [batchComposition, setBatchComposition] = useState({ ...emptyComposition })
  const [completionNotes, setCompletionNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completionError, setCompletionError] = useState('')

  const [cancellingBatchId, setCancellingBatchId] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const [removingAssetId, setRemovingAssetId] = useState(null)
  const [removingFromBatchId, setRemovingFromBatchId] = useState(null)
  const [removeAssetReason, setRemoveAssetReason] = useState('')
  const [removingAsset, setRemovingAsset] = useState(false)
  const [removeAssetError, setRemoveAssetError] = useState('')

  const [completedBatches, setCompletedBatches] = useState([])
  const [loadingCompleted, setLoadingCompleted] = useState(true)
  const [viewingBatch, setViewingBatch] = useState(null)

  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchReadyItems()
    fetchOpenBatches()
    fetchCompletedBatches()
  }, [])

  async function fetchReadyItems() {
    setLoadingReady(true)
    const { data } = await supabase
      .from('intake_items')
      .select(`
        id, asset_code, ornament_type, net_weight, estimated_purity, disposition, created_at,
        intake_headers (visit_date, customers (full_name, customer_code, phone)),
        purity_tests (id, gold_percent, pure_gold_weight, tested_purity)
      `)
      .eq('status', 'tested')
      .eq('disposition', 'melt')
      .order('created_at', { ascending: true })
    if (data) setReadyItems(data)
    setLoadingReady(false)
  }

  async function fetchOpenBatches() {
    setLoadingOpen(true)
    const { data } = await supabase
      .from('melting_batches')
      .select(`
        id, batch_code, status, total_expected_gold, expected_total_weight, asset_count,
        notes, created_at,
        created_by_user:users!melting_batches_created_by_fkey(full_name),
        melting_batch_items (
          id, pure_gold_weight, added_at,
          intake_items (id, asset_code, ornament_type, net_weight,
            intake_headers (visit_date, customers (full_name, customer_code)),
            purity_tests (gold_percent, pure_gold_weight))
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (data) setOpenBatches(data)
    setLoadingOpen(false)
  }

  async function fetchCompletedBatches() {
    setLoadingCompleted(true)
    const { data } = await supabase
      .from('melting_batches')
      .select(`
        id, batch_code, status, total_expected_gold, expected_total_weight, asset_count,
        actual_melted_weight, wastage_weight, recovery_percentage, actual_recoverable_gold,
        batch_gold_percent, batch_silver_percent, batch_copper_percent, batch_cadmium_percent, batch_other_percent,
        notes, created_at, completed_at, stock_created,
        created_by_user:users!melting_batches_created_by_fkey(full_name),
        completed_by_user:users!melting_batches_completed_by_fkey(full_name),
        melting_batch_items (
          id, pure_gold_weight,
          intake_items (id, asset_code, ornament_type, net_weight,
            intake_headers (visit_date, customers (full_name, customer_code)),
            purity_tests (gold_percent, pure_gold_weight))
        )
      `)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setCompletedBatches(data)
    setLoadingCompleted(false)
  }

  function daysSince(dateStr) {
    if (!dateStr) return ''
    const diff = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return '1 day ago'
    return `${diff} days ago`
  }

  function getPurityTest(item) {
    const tests = item.purity_tests
    if (!tests) return null
    return Array.isArray(tests) ? tests[0] : tests
  }

  function calcCompTotal() {
    return (
      (parseFloat(batchComposition.batch_gold_percent) || 0) +
      (parseFloat(batchComposition.batch_silver_percent) || 0) +
      (parseFloat(batchComposition.batch_copper_percent) || 0) +
      (parseFloat(batchComposition.batch_cadmium_percent) || 0) +
      (parseFloat(batchComposition.batch_other_percent) || 0)
    )
  }

  function compTotalColor(t) {
    if (t === 0) return 'border-gray-200 bg-gray-50 text-gray-400'
    if (t >= 99.5 && t <= 100.5) return 'border-green-300 bg-green-50 text-green-700'
    if ((t >= 99.0 && t < 99.5) || (t > 100.5 && t <= 101.0)) return 'border-yellow-300 bg-yellow-50 text-yellow-700'
    return 'border-red-300 bg-red-50 text-red-700'
  }

  function handleCompositionInput(field, val) {
    const match = String(val).match(/^(\d*)(\.\d{0,3})?$/)
    if (val !== '' && !match) return
    setBatchComposition(prev => ({ ...prev, [field]: val }))
  }

  const selectedItems = readyItems.filter(i => selectedIds.includes(i.id))
  const expectedGold = selectedItems.reduce((sum, i) => sum + (parseFloat(getPurityTest(i)?.pure_gold_weight) || 0), 0)
  const expectedNetWeight = selectedItems.reduce((sum, i) => sum + (parseFloat(i.net_weight) || 0), 0)
  const avgPurity = (() => {
    const valid = selectedItems.filter(i => getPurityTest(i)?.gold_percent)
    if (!valid.length) return 0
    return valid.reduce((sum, i) => sum + parseFloat(getPurityTest(i).gold_percent), 0) / valid.length
  })()

  const filteredReady = readyItems.filter(item => {
    const q = readySearch.toLowerCase()
    if (!q) return true
    if ((item.asset_code || '').toLowerCase().includes(q)) return true
    if ((item.ornament_type || '').toLowerCase().includes(q)) return true
    if ((item.intake_headers?.customers?.full_name || '').toLowerCase().includes(q)) return true
    if ((item.intake_headers?.customers?.customer_code || '').toLowerCase().includes(q)) return true
    if ((item.intake_headers?.customers?.phone || '').toLowerCase().includes(q)) return true
    return false
  })

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleCreateBatch() {
    if (creating) return
    setCreating(true); setCreateError('')
    try {
      const { data: batch, error: batchError } = await supabase
        .from('melting_batches')
        .insert({
          created_by: profile.id,
          status: 'open',
          total_expected_gold: parseFloat(expectedGold.toFixed(3)),
          expected_total_weight: parseFloat(expectedNetWeight.toFixed(3)),
          asset_count: selectedItems.length,
          notes: batchNotes.trim() || null
        })
        .select().single()

      if (batchError) { setCreateError(batchError.message); setCreating(false); return }

      const batchItems = selectedItems.map(item => ({
        batch_id: batch.id,
        intake_item_id: item.id,
        purity_test_id: getPurityTest(item)?.id || null,
        pure_gold_weight: parseFloat(getPurityTest(item)?.pure_gold_weight || 0),
        added_by: profile.id
      }))

      const { error: itemsError } = await supabase.from('melting_batch_items').insert(batchItems)
      if (itemsError) { setCreateError(itemsError.message); setCreating(false); return }

      await supabase.from('intake_items')
        .update({ status: 'batched', updated_at: new Date().toISOString() })
        .in('id', selectedItems.map(i => i.id))

      const auditEntries = [
        {
          changed_by: profile.id, changed_by_name: profile.full_name,
          table_name: 'melting_batches', record_id: batch.id,
          field_name: 'batch_created',
          old_value: null,
          new_value: JSON.stringify({
            batch_code: batch.batch_code,
            asset_count: selectedItems.length,
            expected_gold: expectedGold.toFixed(3),
            created_by: profile.full_name,
            created_at: new Date().toISOString()
          })
        },
        ...selectedItems.map(item => ({
          changed_by: profile.id, changed_by_name: profile.full_name,
          table_name: 'melting_batch_items', record_id: batch.id,
          field_name: 'asset_assigned_to_batch',
          old_value: JSON.stringify({ asset_code: item.asset_code, status: 'tested' }),
          new_value: JSON.stringify({
            asset_code: item.asset_code,
            batch_code: batch.batch_code,
            ornament_type: item.ornament_type,
            pure_gold_weight: getPurityTest(item)?.pure_gold_weight,
            assigned_by: profile.full_name,
            assigned_at: new Date().toISOString()
          })
        }))
      ]
      await supabase.from('audit_log').insert(auditEntries)

      setShowConfirm(false)
      setSelectedIds([])
      setBatchNotes('')
      setSuccess(`✓ Batch ${batch.batch_code} created with ${selectedItems.length} assets`)
      setTimeout(() => setSuccess(''), 5000)
      await fetchReadyItems()
      await fetchOpenBatches()
    } catch (err) {
      setCreateError(err.message)
    }
    setCreating(false)
  }

  async function handleRemoveAssetFromBatch() {
    const reason = removeAssetReason.trim()
    if (!reason) { setRemoveAssetError('Reason is required'); return }
    setRemovingAsset(true); setRemoveAssetError('')

    const batch = openBatches.find(b => b.id === removingFromBatchId)
    const batchItem = batch?.melting_batch_items?.find(bi => bi.intake_items?.id === removingAssetId)
    const item = batchItem?.intake_items

    const { error } = await supabase.from('melting_batch_items').delete().eq('id', batchItem.id)
    if (error) { setRemoveAssetError(error.message); setRemovingAsset(false); return }

    await supabase.from('intake_items')
      .update({ status: 'tested', updated_at: new Date().toISOString() })
      .eq('id', removingAssetId)

    await supabase.from('melting_batches').update({
      asset_count: Math.max((batch.asset_count || 1) - 1, 0),
      total_expected_gold: parseFloat(Math.max((batch.total_expected_gold || 0) - (batchItem.pure_gold_weight || 0), 0).toFixed(3)),
      expected_total_weight: parseFloat(Math.max((batch.expected_total_weight || 0) - (parseFloat(item?.net_weight) || 0), 0).toFixed(3))
    }).eq('id', removingFromBatchId)

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'melting_batch_items', record_id: removingFromBatchId,
      field_name: 'asset_removed_from_batch',
      old_value: JSON.stringify({
        asset_code: item?.asset_code,
        batch_code: batch?.batch_code,
        ornament_type: item?.ornament_type,
        pure_gold_weight: batchItem?.pure_gold_weight
      }),
      new_value: JSON.stringify({
        action: 'removed', reason,
        removed_by: profile.full_name,
        removed_at: new Date().toISOString()
      })
    })

    setRemovingAssetId(null); setRemovingFromBatchId(null); setRemoveAssetReason('')
    await fetchReadyItems(); await fetchOpenBatches()
    setRemovingAsset(false)
  }

  async function handleCancelBatch() {
    const reason = cancelReason.trim()
    if (!reason) { setCancelError('Reason is required'); return }
    setCancelling(true); setCancelError('')

    const batch = openBatches.find(b => b.id === cancellingBatchId)
    const assetIds = batch?.melting_batch_items?.map(bi => bi.intake_items?.id).filter(Boolean) || []

    const { error } = await supabase.from('melting_batches').update({
      status: 'cancelled',
      cancellation_reason: reason,
      cancelled_by: profile.id,
      cancelled_at: new Date().toISOString()
    }).eq('id', cancellingBatchId)

    if (error) { setCancelError(error.message); setCancelling(false); return }

    if (assetIds.length > 0) {
      await supabase.from('intake_items')
        .update({ status: 'tested', updated_at: new Date().toISOString() })
        .in('id', assetIds)
    }

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'melting_batches', record_id: cancellingBatchId,
      field_name: 'batch_cancelled',
      old_value: JSON.stringify({ batch_code: batch?.batch_code, status: 'open', asset_count: batch?.asset_count }),
      new_value: JSON.stringify({
        action: 'cancelled', reason,
        cancelled_by: profile.full_name,
        cancelled_at: new Date().toISOString()
      })
    })

    setCancellingBatchId(null); setCancelReason('')
    await fetchReadyItems(); await fetchOpenBatches(); await fetchCompletedBatches()
    setCancelling(false)
  }

  async function handleCompleteBatch() {
    if (completing) return
    setCompletionError('')
    const actual = parseFloat(actualWeight)
    if (!actual || actual <= 0) { setCompletionError('Enter actual melted weight'); return }
    const goldPct = parseFloat(batchComposition.batch_gold_percent) || 0
    if (goldPct <= 0) { setCompletionError('Gold % is required'); return }
    const compTotal = calcCompTotal()
    if (compTotal < 99.0 || compTotal > 101.0) {
      setCompletionError(`Total composition is ${compTotal.toFixed(3)}% — must be between 99.0% and 101.0%`)
      return
    }

    setCompleting(true)
    const batch = openBatches.find(b => b.id === completingBatchId)
    const expected = batch?.total_expected_gold || 0
    const recoverableGold = parseFloat((actual * (goldPct / 100)).toFixed(3))
    const wastage = parseFloat(Math.max(expected - actual, 0).toFixed(3))
    const recovery = expected > 0 ? parseFloat(((recoverableGold / expected) * 100).toFixed(2)) : 0

    const { error } = await supabase.from('melting_batches').update({
      status: 'completed',
      actual_melted_weight: actual,
      wastage_weight: wastage,
      recovery_percentage: recovery,
      actual_recoverable_gold: recoverableGold,
      batch_gold_percent: parseFloat(parseFloat(batchComposition.batch_gold_percent).toFixed(3)),
      batch_silver_percent: parseFloat(parseFloat(batchComposition.batch_silver_percent || 0).toFixed(3)),
      batch_copper_percent: parseFloat(parseFloat(batchComposition.batch_copper_percent || 0).toFixed(3)),
      batch_cadmium_percent: parseFloat(parseFloat(batchComposition.batch_cadmium_percent || 0).toFixed(3)),
      batch_other_percent: parseFloat(parseFloat(batchComposition.batch_other_percent || 0).toFixed(3)),
      completed_by: profile.id,
      completed_at: new Date().toISOString(),
      notes: completionNotes.trim() || batch?.notes || null
    }).eq('id', completingBatchId)

    if (error) { setCompletionError(error.message); setCompleting(false); return }

    const assetIds = batch?.melting_batch_items?.map(bi => bi.intake_items?.id).filter(Boolean) || []
    if (assetIds.length > 0) {
      await supabase.from('intake_items')
        .update({ status: 'melted', updated_at: new Date().toISOString() })
        .in('id', assetIds)
    }

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'melting_batches', record_id: completingBatchId,
      field_name: 'batch_completed',
      old_value: JSON.stringify({ batch_code: batch?.batch_code, status: 'open', expected_gold: expected }),
      new_value: JSON.stringify({
        actual_melted_weight: actual,
        wastage,
        recovery_percentage: recovery,
        recoverable_gold: recoverableGold,
        batch_gold_percent: batchComposition.batch_gold_percent,
        completed_by: profile.full_name,
        completed_at: new Date().toISOString()
      })
    })

    setCompletingBatchId(null)
    setBatchComposition({ ...emptyComposition })
    setActualWeight('')
    setCompletionNotes('')
    setSuccess(`✓ Batch ${batch?.batch_code} completed — Recovery: ${recovery}% · Recoverable Gold: ${recoverableGold}g`)
    setTimeout(() => setSuccess(''), 6000)
    await fetchOpenBatches(); await fetchCompletedBatches()
    setCompleting(false)
  }

  const compTotal = calcCompTotal()
  const actualWt = parseFloat(actualWeight) || 0
  const completingBatch = openBatches.find(b => b.id === completingBatchId)
  const expectedForCompletion = completingBatch?.total_expected_gold || 0
  const recoverablePreviewVal = actualWt > 0 && batchComposition.batch_gold_percent
    ? actualWt * parseFloat(batchComposition.batch_gold_percent) / 100
    : 0
  const recoveryPreview = recoverablePreviewVal > 0 && expectedForCompletion > 0
    ? ((recoverablePreviewVal / expectedForCompletion) * 100).toFixed(2)
    : '—'
  const recoverablePreview = recoverablePreviewVal > 0 ? recoverablePreviewVal.toFixed(3) : '—'
  const wastagePreview = actualWt > 0 ? Math.max(expectedForCompletion - actualWt, 0).toFixed(3) : '—'
  const karatPreview = batchComposition.batch_gold_percent
    ? ((parseFloat(batchComposition.batch_gold_percent) / 100) * 24).toFixed(2)
    : '—'
  const recoveryColor = recoveryPreview === '—' ? 'text-gray-400'
    : parseFloat(recoveryPreview) >= 99 ? 'text-green-600'
    : parseFloat(recoveryPreview) >= 97 ? 'text-yellow-600'
    : 'text-red-600'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Melting</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage melting batches from tested assets</p>
        </div>
      </div>

      {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{success}</div>}

      {/* Cancel batch modal */}
      {cancellingBatchId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-red-700 mb-2">Cancel Batch</h3>
            <p className="text-sm text-gray-500 mb-3">This batch will be cancelled and all assets will return to the Tested queue.</p>
            <ul className="text-xs text-gray-500 mb-4 space-y-1">
              <li>• All assets return to status: tested</li>
              <li>• Action will be audit logged permanently</li>
              <li>• A mandatory reason must be provided</li>
            </ul>
            {cancelError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{cancelError}</div>}
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for cancellation</label>
            <input type="text" required value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
              placeholder="Describe reason..." autoFocus />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setCancellingBatchId(null); setCancelReason(''); setCancelError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
              <button type="button" disabled={cancelling} onClick={handleCancelBatch}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove asset modal */}
      {removingAssetId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-red-700 mb-2">Remove Asset from Batch</h3>
            <p className="text-sm text-gray-500 mb-4">This asset will be removed and returned to the Tested queue.</p>
            {removeAssetError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{removeAssetError}</div>}
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for removal</label>
            <input type="text" required value={removeAssetReason} onChange={e => setRemoveAssetReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
              placeholder="Describe reason..." autoFocus />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setRemovingAssetId(null); setRemovingFromBatchId(null); setRemoveAssetReason(''); setRemoveAssetError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="button" disabled={removingAsset} onClick={handleRemoveAssetFromBatch}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {removingAsset ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-screen overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Create Melting Batch</h3>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {selectedItems.map(item => {
                const pt = getPurityTest(item)
                return (
                  <div key={item.id} className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-yellow-700 text-xs font-medium">{item.asset_code}</span>
                      <span className="text-xs text-gray-400">{daysSince(item.intake_headers?.visit_date)}</span>
                    </div>
                    <p className="font-medium text-gray-800">
                      {item.intake_headers?.customers?.full_name}{' '}
                      <span className="text-xs text-gray-400 font-normal">({item.intake_headers?.customers?.customer_code})</span>
                      {' '}— {item.ornament_type}
                    </p>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      <span>Net: {item.net_weight}g</span>
                      <span>Gold: {pt?.gold_percent}%</span>
                      <span className="text-green-700 font-medium">Pure Gold: {pt?.pure_gold_weight}g</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-gray-200 pt-4 mb-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Assets</p>
                  <p className="text-lg font-bold text-gray-800">{selectedItems.length}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Net Weight</p>
                  <p className="text-lg font-bold text-gray-800">{expectedNetWeight.toFixed(3)}g</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3">
                  <p className="text-xs text-yellow-600">Expected Gold</p>
                  <p className="text-lg font-bold text-yellow-700">{expectedGold.toFixed(3)}g</p>
                </div>
              </div>
              {avgPurity > 0 && (
                <p className="text-xs text-gray-500 text-center mt-2">Avg Purity: {avgPurity.toFixed(2)}%</p>
              )}
            </div>
            {(() => {
              const high = selectedItems.filter(i => parseFloat(getPurityTest(i)?.gold_percent) >= 90).length
              const mid = selectedItems.filter(i => { const g = parseFloat(getPurityTest(i)?.gold_percent); return g >= 80 && g < 90 }).length
              const low = selectedItems.filter(i => parseFloat(getPurityTest(i)?.gold_percent) < 80).length
              if (!high && !mid && !low) return null
              return (
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs">
                  <p className="text-gray-500 font-medium mb-1">Purity Distribution</p>
                  <div className="flex gap-4">
                    {high > 0 && <span className="text-green-600">90%+ : {high} asset{high > 1 ? 's' : ''}</span>}
                    {mid > 0 && <span className="text-yellow-600">80–89% : {mid} asset{mid > 1 ? 's' : ''}</span>}
                    {low > 0 && <span className="text-red-600">Below 80% : {low} asset{low > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              )
            })()}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch Notes <span className="text-gray-400">(optional)</span></label>
              <input type="text" value={batchNotes} onChange={e => setBatchNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="e.g. Old jewellery batch, High purity melt..." />
            </div>
            {createError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{createError}</div>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowConfirm(false); setBatchNotes(''); setCreateError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="button" disabled={creating} onClick={handleCreateBatch}
                className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {creating ? 'Creating...' : 'Confirm Create Batch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View completed batch modal */}
      {viewingBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">Batch Details</h3>
              <button onClick={() => setViewingBatch(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-yellow-700 font-bold text-lg">{viewingBatch.batch_code}</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${viewingBatch.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                {viewingBatch.status}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-4 space-y-0.5">
              <div>Created by {viewingBatch.created_by_user?.full_name} · {viewingBatch.created_at?.split('T')[0]}</div>
              {viewingBatch.completed_at && <div>Completed by {viewingBatch.completed_by_user?.full_name} · {viewingBatch.completed_at?.split('T')[0]}</div>}
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Included Assets ({viewingBatch.asset_count})</p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {viewingBatch.melting_batch_items?.map(bi => {
                const item = bi.intake_items
                const ptArr = Array.isArray(item?.purity_tests) ? item.purity_tests : [item?.purity_tests]
                const purity = ptArr[0]
                return (
                  <div key={bi.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono text-yellow-700">{item?.asset_code}</span>
                      <span className="text-green-700 font-medium">{purity?.pure_gold_weight}g pure gold</span>
                    </div>
                    <p className="text-gray-700">
                      {item?.intake_headers?.customers?.full_name}{' '}
                      <span className="text-gray-400">({item?.intake_headers?.customers?.customer_code})</span>
                      {' '}— {item?.ornament_type}
                    </p>
                    <p className="text-gray-400">Net: {item?.net_weight}g · Gold: {purity?.gold_percent}%</p>
                  </div>
                )
              })}
            </div>
            {viewingBatch.status === 'completed' && (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Melt Results</p>
                <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5 mb-4">
                  <div className="flex justify-between"><span className="text-gray-600">Expected Gold</span><span className="font-medium">{viewingBatch.total_expected_gold}g</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Actual Melted</span><span className="font-medium">{viewingBatch.actual_melted_weight}g</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Wastage</span><span className="font-medium text-orange-600">{viewingBatch.wastage_weight}g</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Recovery</span>
                    <span className={`font-bold ${parseFloat(viewingBatch.recovery_percentage) >= 99 ? 'text-green-600' : parseFloat(viewingBatch.recovery_percentage) >= 97 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {viewingBatch.recovery_percentage}%
                    </span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Batch Composition Analysis</p>
                <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-gray-600">Gold</span><span className="font-medium">{parseFloat(viewingBatch.batch_gold_percent || 0).toFixed(3)}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Silver</span><span className="font-medium">{parseFloat(viewingBatch.batch_silver_percent || 0).toFixed(3)}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Copper</span><span className="font-medium">{parseFloat(viewingBatch.batch_copper_percent || 0).toFixed(3)}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Cadmium</span><span className="font-medium">{parseFloat(viewingBatch.batch_cadmium_percent || 0).toFixed(3)}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Other</span><span className="font-medium">{parseFloat(viewingBatch.batch_other_percent || 0).toFixed(3)}%</span></div>
                  <div className="border-t border-gray-200 pt-1.5 mt-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Karat</span>
                      <span className="font-medium text-yellow-700">
                        {viewingBatch.batch_gold_percent ? ((parseFloat(viewingBatch.batch_gold_percent) / 100) * 24).toFixed(2) : '—'}K
                      </span>
                    </div>
                    <div className="flex justify-between mt-1"><span className="text-gray-600">Recoverable Gold</span><span className="font-bold text-green-700">{viewingBatch.actual_recoverable_gold}g</span></div>
                  </div>
                </div>
              </>
            )}
            {viewingBatch.notes && <p className="mt-3 text-xs text-gray-500">Notes: {viewingBatch.notes}</p>}
            <button onClick={() => setViewingBatch(null)}
              className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg">Close</button>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left — Ready for melting queue */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Ready for Melting ({filteredReady.length})</h3>
              {selectedIds.length > 0 && (
                <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              )}
            </div>
            <input type="text" value={readySearch} onChange={e => setReadySearch(e.target.value)}
              placeholder="Search customer, customer code, asset, ornament or phone..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
          </div>

          {selectedIds.length > 0 && (
            <div className="px-5 py-3 bg-yellow-50 border-b border-yellow-100">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-semibold text-yellow-800">{selectedIds.length} selected</span>
                  <span className="text-yellow-600 ml-2">· Net: {expectedNetWeight.toFixed(3)}g · Gold: {expectedGold.toFixed(3)}g</span>
                  {avgPurity > 0 && <span className="text-yellow-600 ml-2">· Avg: {avgPurity.toFixed(2)}%</span>}
                </div>
                <button onClick={() => setShowConfirm(true)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
                  Create Batch →
                </button>
              </div>
            </div>
          )}

          {loadingReady ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : filteredReady.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No assets ready for melting</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {filteredReady.map(item => {
                const pt = getPurityTest(item)
                const isSelected = selectedIds.includes(item.id)
                return (
                  <div key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`px-5 py-3 cursor-pointer hover:bg-yellow-50 transition ${isSelected ? 'bg-yellow-50 border-l-2 border-yellow-500' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-yellow-500 border-yellow-500' : 'border-gray-300'}`}>
                        {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-yellow-700 font-medium">{item.asset_code}</span>
                          <span className="text-xs text-gray-400">{daysSince(item.intake_headers?.visit_date)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800">
                          {item.intake_headers?.customers?.full_name}{' '}
                          <span className="text-xs text-gray-400 font-normal">({item.intake_headers?.customers?.customer_code})</span>
                        </p>
                        {item.intake_headers?.customers?.phone && (
                          <p className="text-xs text-gray-400">{item.intake_headers.customers.phone}</p>
                        )}
                        <p className="text-sm text-gray-600">{item.ornament_type}</p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-500">
                          <span>Net: {item.net_weight}g</span>
                          <span>Est: {item.estimated_purity}%</span>
                          <span>Tested: {pt?.gold_percent}%</span>
                          {(() => {
                            const tested = parseFloat(pt?.gold_percent || 0)
                            const estimated = parseFloat(item?.estimated_purity || 0)
                            if (!tested || !estimated) return null
                            const diff = tested - estimated
                            const absDiff = Math.abs(diff)
                            const color = absDiff <= 2 ? 'text-green-600' : absDiff <= 5 ? 'text-yellow-600' : 'text-red-600'
                            return <span className={`font-medium ${color}`}>Var: {diff > 0 ? '+' : ''}{diff.toFixed(2)}%</span>
                          })()}
                        </div>
                        <p className="text-xs text-green-700 font-semibold mt-0.5">Pure Gold: {pt?.pure_gold_weight}g</p>
                        <p className="text-xs text-gray-400">Visit: {item.intake_headers?.visit_date}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right — Open batches */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Open Batches ({openBatches.length})</h3>
            </div>
            {loadingOpen ? (
              <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
            ) : openBatches.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No open batches</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {openBatches.map(batch => {
                  const isExpanded = expandedBatchId === batch.id
                  const isCompleting = completingBatchId === batch.id
                  return (
                    <div key={batch.id} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="font-mono text-yellow-700 font-semibold">{batch.batch_code}</span>
                          <span className="text-xs text-gray-400 ml-2">{batch.asset_count} assets · {batch.total_expected_gold}g expected gold</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                            className="text-xs text-yellow-600 hover:text-yellow-800 font-medium hover:underline">
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                          <button onClick={() => { setCompletingBatchId(isCompleting ? null : batch.id); setActualWeight(''); setBatchComposition({ ...emptyComposition }); setCompletionNotes(''); setCompletionError('') }}
                            className="text-xs text-green-600 hover:text-green-800 font-medium hover:underline">
                            {isCompleting ? 'Cancel' : 'Complete'}
                          </button>
                          <button onClick={() => { setCancellingBatchId(batch.id); setCancelReason(''); setCancelError('') }}
                            className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline">Cancel</button>
                        </div>
                      </div>
                      {batch.notes && <p className="text-xs text-gray-400 mb-1">Note: {batch.notes}</p>}
                      <p className="text-xs text-gray-400">Created by {batch.created_by_user?.full_name} · {batch.created_at?.split('T')[0]}</p>

                      {isExpanded && (
                        <div className="mt-3 border border-gray-100 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-500 uppercase">
                              <tr>
                                <th className="px-3 py-2 text-left">Asset</th>
                                <th className="px-3 py-2 text-left">Customer</th>
                                <th className="px-3 py-2 text-left">Ornament</th>
                                <th className="px-3 py-2 text-left">Net</th>
                                <th className="px-3 py-2 text-left">Gold%</th>
                                <th className="px-3 py-2 text-left">Pure Gold</th>
                                <th className="px-3 py-2 text-left">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {batch.melting_batch_items?.map(bi => {
                                const item = bi.intake_items
                                const pt = Array.isArray(item?.purity_tests) ? item.purity_tests[0] : item?.purity_tests
                                return (
                                  <tr key={bi.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 font-mono text-yellow-700">{item?.asset_code}</td>
                                    <td className="px-3 py-2 text-gray-600">
                                      {item?.intake_headers?.customers?.full_name}
                                      <span className="text-gray-400 ml-1">({item?.intake_headers?.customers?.customer_code})</span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{item?.ornament_type}</td>
                                    <td className="px-3 py-2 text-gray-500">{item?.net_weight}g</td>
                                    <td className="px-3 py-2 text-gray-500">{pt?.gold_percent}%</td>
                                    <td className="px-3 py-2 text-green-700 font-medium">{pt?.pure_gold_weight}g</td>
                                    <td className="px-3 py-2">
                                      <button onClick={() => { setRemovingAssetId(item?.id); setRemovingFromBatchId(batch.id); setRemoveAssetReason(''); setRemoveAssetError('') }}
                                        className="text-xs text-red-500 hover:text-red-700 hover:underline">Remove</button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {isCompleting && (
                        <div className="mt-3 border border-green-100 rounded-lg p-4 bg-green-50">
                          <p className="text-sm font-semibold text-gray-700 mb-3">Complete Batch — Enter Melt Results</p>
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Actual Melted Weight (g)</label>
                            <input type="number" step="0.001" min="0" value={actualWeight}
                              onChange={e => setActualWeight(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                              placeholder="Enter actual weight after melting..." />
                          </div>

                          {actualWt > 0 && (
                            <div className="bg-white rounded-lg p-3 mb-3 text-xs space-y-1">
                              <div className="flex justify-between"><span className="text-gray-500">Expected Gold</span><span>{expectedForCompletion}g</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Actual Weight</span><span>{actualWt}g</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Wastage</span><span className="text-orange-600">{wastagePreview}g</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Recovery</span><span className={`font-bold ${recoveryColor}`}>{recoveryPreview}%</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Recoverable Gold</span><span className="text-green-700 font-medium">{recoverablePreview}g</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Batch Karat</span><span className="text-yellow-700 font-medium">{karatPreview}K</span></div>
                            </div>
                          )}

                          <p className="text-xs font-semibold text-gray-600 mb-2">Post-Melt Composition Analysis</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                              { field: 'batch_gold_percent', label: 'Gold (%)', placeholder: 'Enter Gold %' },
                              { field: 'batch_silver_percent', label: 'Silver (%)', placeholder: '0.000' },
                              { field: 'batch_copper_percent', label: 'Copper (%)', placeholder: '0.000' },
                              { field: 'batch_cadmium_percent', label: 'Cadmium (%)', placeholder: '0.000' },
                              { field: 'batch_other_percent', label: 'Other (%)', placeholder: '0.000' },
                            ].map(({ field, label, placeholder }) => (
                              <div key={field}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                                <input type="number" step="0.001" min="0" max="100"
                                  value={batchComposition[field]}
                                  onChange={e => handleCompositionInput(field, e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                                  placeholder={placeholder} />
                              </div>
                            ))}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
                              <div className={`w-full border rounded-lg px-2 py-1.5 text-xs font-medium ${compTotalColor(compTotal)}`}>
                                {compTotal === 0 ? 'Awaiting Input' : `${compTotal.toFixed(3)}% ${compTotal >= 99.5 && compTotal <= 100.5 ? '✓' : compTotal >= 99.0 && compTotal <= 101.0 ? '⚠' : '✕'}`}
                              </div>
                            </div>
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                            <input type="text" value={completionNotes} onChange={e => setCompletionNotes(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                              placeholder="Any observations..." />
                          </div>

                          {completionError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{completionError}</div>}

                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setCompletingBatchId(null); setActualWeight(''); setBatchComposition({ ...emptyComposition }); setCompletionNotes(''); setCompletionError('') }}
                              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                            <button disabled={completing} onClick={handleCompleteBatch}
                              className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                              {completing ? 'Completing...' : 'Complete Batch'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Completed batches */}
      <div className="mt-10">
        <h3 className="text-base font-semibold text-gray-700 mb-4">Completed & Cancelled Batches</h3>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loadingCompleted ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : completedBatches.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No completed batches yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Batch</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Assets</th>
                    <th className="px-4 py-3 text-left">Expected Gold</th>
                    <th className="px-4 py-3 text-left">Actual Weight</th>
                    <th className="px-4 py-3 text-left">Recovery</th>
                    <th className="px-4 py-3 text-left">Gold%</th>
                    <th className="px-4 py-3 text-left">Recoverable</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {completedBatches.map(batch => (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-yellow-700 font-medium text-xs">{batch.batch_code}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${batch.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{batch.asset_count}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{batch.total_expected_gold}g</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{batch.actual_melted_weight ? `${batch.actual_melted_weight}g` : '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {batch.recovery_percentage ? (
                          <span className={`font-medium ${parseFloat(batch.recovery_percentage) >= 99 ? 'text-green-600' : parseFloat(batch.recovery_percentage) >= 97 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {batch.recovery_percentage}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{batch.batch_gold_percent ? `${parseFloat(batch.batch_gold_percent).toFixed(3)}%` : '—'}</td>
                      <td className="px-4 py-3 text-green-700 font-medium text-xs">{batch.actual_recoverable_gold ? `${batch.actual_recoverable_gold}g` : '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        <div>{batch.created_at?.split('T')[0]}</div>
                        <div className="text-gray-300">{daysSince(batch.created_at?.split('T')[0])}</div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setViewingBatch(batch)}
                          className="text-xs text-yellow-600 hover:text-yellow-800 font-medium hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}