import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function PurityTest() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const emptyComposition = {
    gold_percent: '',
    silver_percent: '0',
    copper_percent: '0',
    cadmium_percent: '0',
    other_metals_percent: '0'
  }

  const [pendingItems, setPendingItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [selectedItem, setSelectedItem] = useState(null)
  const [composition, setComposition] = useState({ ...emptyComposition })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [recentTests, setRecentTests] = useState([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [recentSearch, setRecentSearch] = useState('')

  const [viewingTest, setViewingTest] = useState(null)

  const [editingTestId, setEditingTestId] = useState(null)
  const [editComposition, setEditComposition] = useState({ ...emptyComposition })
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [removingTestId, setRemovingTestId] = useState(null)
  const [removeReason, setRemoveReason] = useState('')
  const [removeSaving, setRemoveSaving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  useEffect(() => { fetchPendingItems(); fetchRecentTests() }, [])

  async function fetchPendingItems() {
    setLoading(true)
    const { data } = await supabase
      .from('intake_items')
      .select(`
        id, asset_code, ornament_type, gross_weight, net_weight, estimated_purity, disposition, status, remarks,
        intake_headers (id, visit_date, customers (full_name, customer_code, phone))
      `)
      .eq('status', 'received')
      .order('created_at', { ascending: true })
    if (data) setPendingItems(data)
    setLoading(false)
  }

  async function fetchRecentTests() {
    setLoadingRecent(true)
    const { data } = await supabase
      .from('purity_tests')
      .select(`
        id, tested_purity, estimated_purity, pure_gold_weight, test_date, notes,
        gold_percent, silver_percent, copper_percent, cadmium_percent, other_metals_percent,
        cancellation_reason, cancelled_by, tested_at, created_at, updated_at,
        tested_by_user:users!purity_tests_tested_by_fkey(full_name),
        intake_items (id, asset_code, ornament_type, gross_weight, net_weight, status,
          intake_headers (visit_date, customers (full_name, customer_code, phone)))
      `)
      .is('cancellation_reason', null)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setRecentTests(data)
    setLoadingRecent(false)
  }

  function calcPureGold(netWeight, goldPct) {
    const n = parseFloat(netWeight) || 0
    const g = parseFloat(goldPct) || 0
    if (n <= 0 || g <= 0 || g > 100) return '—'
    return (n * g / 100).toFixed(3)
  }

  function calcKarat(goldPct) {
    const g = parseFloat(goldPct) || 0
    if (g <= 0) return '—'
    return (g / 100 * 24).toFixed(2)
  }

  function calcTotal(comp) {
    return (
      (parseFloat(comp.gold_percent) || 0) +
      (parseFloat(comp.silver_percent) || 0) +
      (parseFloat(comp.copper_percent) || 0) +
      (parseFloat(comp.cadmium_percent) || 0) +
      (parseFloat(comp.other_metals_percent) || 0)
    )
  }

  function totalColor(total) {
    if (total >= 99.5 && total <= 100.5) return 'text-green-600'
    if ((total >= 99.0 && total < 99.5) || (total > 100.5 && total <= 101.0)) return 'text-yellow-600'
    return 'text-red-600'
  }

  function totalLabel(total) {
    if (total >= 99.5 && total <= 100.5) return '✓ Valid'
    if ((total >= 99.0 && total < 99.5) || (total > 100.5 && total <= 101.0)) return '⚠ Check'
    return '✕ Invalid'
  }

  function handleCompositionInput(field, val, setter) {
    const match = String(val).match(/^(\d*)(\.\d{0,3})?$/)
    if (val !== '' && !match) return
    setter(prev => ({ ...prev, [field]: val }))
  }

  async function handleSaveTest(e) {
    e.preventDefault()
    if (saving) return
    setError(''); setSuccess('')
    if (!selectedItem) { setError('Select an ornament to test'); return }

    const gold = parseFloat(composition.gold_percent) || 0
    if (gold <= 0) { setError('Gold % is required'); return }

    const total = calcTotal(composition)
    if (total < 99.0 || total > 101.0) {
      setError(`Total composition is ${total.toFixed(3)}% — must be between 99.0% and 101.0%`)
      return
    }

    const pureGold = calcPureGold(selectedItem.net_weight, composition.gold_percent)
    if (pureGold === '—') { setError('Invalid calculation — check net weight and gold %'); return }

    setSaving(true)

    const { data: existing } = await supabase
      .from('purity_tests')
      .select('id')
      .eq('intake_item_id', selectedItem.id)
      .is('cancellation_reason', null)
      .single()

    if (existing) {
      setError('Purity test already exists for this asset. Remove it first to re-enter.')
      setSaving(false)
      return
    }

    const { error: testError } = await supabase.from('purity_tests').insert({
      intake_item_id: selectedItem.id,
      tested_by: profile.id,
      tested_purity: parseFloat(parseFloat(composition.gold_percent).toFixed(3)),
      gold_percent: parseFloat(parseFloat(composition.gold_percent).toFixed(3)),
      silver_percent: parseFloat(parseFloat(composition.silver_percent || 0).toFixed(3)),
      copper_percent: parseFloat(parseFloat(composition.copper_percent || 0).toFixed(3)),
      cadmium_percent: parseFloat(parseFloat(composition.cadmium_percent || 0).toFixed(3)),
      other_metals_percent: parseFloat(parseFloat(composition.other_metals_percent || 0).toFixed(3)),
      estimated_purity: parseFloat(selectedItem.estimated_purity),
      pure_gold_weight: parseFloat(pureGold),
      test_date: new Date().toISOString().split('T')[0],
      tested_at: new Date().toISOString(),
      notes: notes.trim() || null
    })

    if (testError) { setError(testError.message); setSaving(false); return }

    await supabase.from('intake_items').update({
      status: 'tested',
      updated_at: new Date().toISOString()
    }).eq('id', selectedItem.id)

    setSuccess(`✓ Purity test saved — ${selectedItem.asset_code} moved to Tested queue. Pure gold: ${pureGold}g`)
    setSelectedItem(null); setComposition({ ...emptyComposition }); setNotes('')
    await fetchPendingItems(); await fetchRecentTests()
    setTimeout(() => setSuccess(''), 5000)
    setSaving(false)
  }

  async function saveEditTest(testId, original) {
    setEditError('')
    const gold = parseFloat(editComposition.gold_percent) || 0
    if (gold <= 0) { setEditError('Gold % is required'); return }
    const total = calcTotal(editComposition)
    if (total < 99.0 || total > 101.0) {
      setEditError(`Total composition is ${total.toFixed(3)}% — must be between 99.0% and 101.0%`)
      return
    }
    setEditSaving(true)
    const pureGold = calcPureGold(original.intake_items?.net_weight, editComposition.gold_percent)

    const { error } = await supabase.from('purity_tests').update({
      tested_purity: parseFloat(parseFloat(editComposition.gold_percent).toFixed(3)),
      gold_percent: parseFloat(parseFloat(editComposition.gold_percent).toFixed(3)),
      silver_percent: parseFloat(parseFloat(editComposition.silver_percent || 0).toFixed(3)),
      copper_percent: parseFloat(parseFloat(editComposition.copper_percent || 0).toFixed(3)),
      cadmium_percent: parseFloat(parseFloat(editComposition.cadmium_percent || 0).toFixed(3)),
      other_metals_percent: parseFloat(parseFloat(editComposition.other_metals_percent || 0).toFixed(3)),
      pure_gold_weight: parseFloat(pureGold),
      notes: editNotes || null,
      updated_at: new Date().toISOString()
    }).eq('id', testId)

    if (error) { setEditError(error.message); setEditSaving(false); return }

    const metalFields = ['gold_percent', 'silver_percent', 'copper_percent', 'cadmium_percent', 'other_metals_percent']
    const auditEntries = []
    metalFields.forEach(f => {
      const oldVal = parseFloat(original[f] || 0).toFixed(3)
      const newVal = parseFloat(editComposition[f] || 0).toFixed(3)
      if (oldVal !== newVal) {
        auditEntries.push({
          changed_by: profile.id, changed_by_name: profile.full_name,
          table_name: 'purity_tests', record_id: testId,
          field_name: f, old_value: oldVal, new_value: newVal
        })
      }
    })
    if ((original.notes || '') !== editNotes) {
      auditEntries.push({
        changed_by: profile.id, changed_by_name: profile.full_name,
        table_name: 'purity_tests', record_id: testId,
        field_name: 'notes', old_value: original.notes || '', new_value: editNotes
      })
    }
    if (auditEntries.length > 0) await supabase.from('audit_log').insert(auditEntries)

    setEditingTestId(null)
    setEditComposition({ ...emptyComposition })
    setEditNotes('')
    await fetchRecentTests()
    setEditSaving(false)
  }

  async function handleRemoveTest(e) {
    e.preventDefault()
    const reason = removeReason.trim()
    if (!reason) { setRemoveError('Reason is required'); return }
    setRemoveSaving(true); setRemoveError('')

    const test = recentTests.find(t => t.id === removingTestId)

    const { error } = await supabase.from('purity_tests').update({
      cancellation_reason: reason,
      cancelled_by: profile.id,
      updated_at: new Date().toISOString()
    }).eq('id', removingTestId)

    if (error) { setRemoveError(error.message); setRemoveSaving(false); return }

    if (test?.intake_items?.id) {
      await supabase.from('intake_items').update({
        status: 'received',
        updated_at: new Date().toISOString()
      }).eq('id', test.intake_items.id)
    }

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'purity_tests', record_id: removingTestId,
      field_name: 'purity_test_removal',
      old_value: JSON.stringify({
        asset_code: test?.intake_items?.asset_code,
        ornament_type: test?.intake_items?.ornament_type,
        gold_percent: test?.gold_percent,
        tested_purity: test?.tested_purity,
        estimated_purity: test?.estimated_purity,
        pure_gold_weight: test?.pure_gold_weight,
        test_date: test?.test_date
      }),
      new_value: JSON.stringify({
        action: 'removed', reason,
        removed_by_name: profile.full_name,
        removed_at: new Date().toISOString()
      })
    })

    setRemovingTestId(null); setRemoveReason('')
    await fetchPendingItems(); await fetchRecentTests()
    setRemoveSaving(false)
  }

  const filtered = pendingItems.filter(item => {
    const q = search.toLowerCase()
    if (!q) return true
    if ((item.asset_code || '').toLowerCase().includes(q)) return true
    if ((item.ornament_type || '').toLowerCase().includes(q)) return true
    if ((item.intake_headers?.customers?.full_name || '').toLowerCase().includes(q)) return true
    if ((item.intake_headers?.customers?.customer_code || '').toLowerCase().includes(q)) return true
    if ((item.intake_headers?.customers?.phone || '').toLowerCase().includes(q)) return true
    if ((item.intake_headers?.visit_date || '').toLowerCase().includes(q)) return true
    if ((item.remarks || '').toLowerCase().includes(q)) return true
    return false
  })

  const filteredRecent = recentTests.filter(test => {
    const q = recentSearch.toLowerCase()
    if (!q) return true
    if ((test.intake_items?.asset_code || '').toLowerCase().includes(q)) return true
    if ((test.intake_items?.intake_headers?.customers?.full_name || '').toLowerCase().includes(q)) return true
    if ((test.test_date || '').toLowerCase().includes(q)) return true
    if ((test.tested_by_user?.full_name || '').toLowerCase().includes(q)) return true
    if ((test.notes || '').toLowerCase().includes(q)) return true
    return false
  })

  const goldVal = parseFloat(composition.gold_percent) || 0
  const total = calcTotal(composition)
  const variance = selectedItem ? (goldVal - parseFloat(selectedItem.estimated_purity)).toFixed(2) : null
  const absDiff = selectedItem ? Math.abs(goldVal - parseFloat(selectedItem.estimated_purity)) : 0
  const varianceColor = absDiff <= 2 ? 'text-green-600' : absDiff <= 5 ? 'text-yellow-600' : 'text-red-600'
  const varianceLabel = absDiff <= 2 ? '● NORMAL' : absDiff <= 5 ? '● CHECK' : '● HIGH VARIANCE'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Purity Test</h2>
          <p className="text-sm text-gray-500 mt-0.5">Enter XRF machine composition readings for received ornaments</p>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{success}</div>}

      {/* Remove modal */}
      {removingTestId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-red-700 mb-2">Remove Purity Test</h3>
            <p className="text-sm text-gray-500 mb-3">This purity test will be permanently removed.</p>
            <ul className="text-xs text-gray-500 mb-4 space-y-1">
              <li>• Asset will return to Pending Queue</li>
              <li>• Action will be audit logged permanently</li>
              <li>• A mandatory reason must be provided</li>
            </ul>
            {removeError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{removeError}</div>}
            <form onSubmit={handleRemoveTest}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for removal</label>
              <input type="text" required value={removeReason} onChange={e => setRemoveReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                placeholder="Describe reason..." autoFocus />
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => { setRemovingTestId(null); setRemoveReason(''); setRemoveError('') }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={removeSaving}
                  className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                  {removeSaving ? 'Removing...' : 'Confirm Remove'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewingTest && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">Test Details</h3>
              <button onClick={() => setViewingTest(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="mb-3">
              <span className="font-mono text-yellow-700 font-medium">{viewingTest.intake_items?.asset_code}</span>
              <span className="text-gray-500 text-sm ml-2">{viewingTest.intake_items?.ornament_type}</span>
              <div className="text-xs text-gray-500 mt-0.5">{viewingTest.intake_items?.intake_headers?.customers?.full_name}</div>
              <div className="text-xs text-gray-400 mt-0.5">Visit Date: {viewingTest.intake_items?.intake_headers?.visit_date}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Machine Composition Analysis</p>
              <div className="flex justify-between"><span className="text-gray-600">Gold</span><span className="font-medium text-gray-800">{parseFloat(viewingTest.gold_percent || 0).toFixed(3)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Silver</span><span className="font-medium text-gray-800">{parseFloat(viewingTest.silver_percent || 0).toFixed(3)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Copper</span><span className="font-medium text-gray-800">{parseFloat(viewingTest.copper_percent || 0).toFixed(3)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Cadmium</span><span className="font-medium text-gray-800">{parseFloat(viewingTest.cadmium_percent || 0).toFixed(3)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Other Metals</span><span className="font-medium text-gray-800">{parseFloat(viewingTest.other_metals_percent || 0).toFixed(3)}%</span></div>
              <div className="border-t border-gray-200 pt-1.5 mt-1.5">
                {(() => {
                  const vTotal = (
                    parseFloat(viewingTest.gold_percent || 0) +
                    parseFloat(viewingTest.silver_percent || 0) +
                    parseFloat(viewingTest.copper_percent || 0) +
                    parseFloat(viewingTest.cadmium_percent || 0) +
                    parseFloat(viewingTest.other_metals_percent || 0)
                  )
                  return (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total</span>
                      <span className={`font-medium ${totalColor(vTotal)}`}>
                        {vTotal.toFixed(3)}%
                        {vTotal < 99.0 && <span className="ml-1 text-xs">⚠ Incomplete</span>}
                      </span>
                    </div>
                  )
                })()}
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">Karat</span>
                  <span className="font-medium text-yellow-700">{calcKarat(viewingTest.gold_percent)}K</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">Pure Gold Weight</span>
                  <span className="font-medium text-green-700">{viewingTest.pure_gold_weight}g</span>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-1.5 mt-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-600">Estimated Purity</span>
                  <span className="font-medium text-gray-800">{parseFloat(viewingTest.estimated_purity || 0).toFixed(2)}%</span>
                </div>
                {(() => {
                  const vDiff = parseFloat(viewingTest.gold_percent || viewingTest.tested_purity || 0) - parseFloat(viewingTest.estimated_purity || 0)
                  const vAbs = Math.abs(vDiff)
                  const vColor = vAbs <= 2 ? 'text-green-600' : vAbs <= 5 ? 'text-yellow-600' : 'text-red-600'
                  return (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-600">Variance</span>
                      <span className={`font-medium ${vColor}`}>
                        {vDiff > 0 ? '+' : ''}{vDiff.toFixed(2)}%
                        <span className="ml-1 text-xs">{vAbs <= 2 ? '● NORMAL' : vAbs <= 5 ? '● CHECK' : '● HIGH VARIANCE'}</span>
                      </span>
                    </div>
                  )
                })()}
              </div>
            </div>
            {viewingTest.notes && (
              <div className="mt-3 text-sm">
                <span className="text-gray-500 font-medium">Notes: </span>
                <span className="text-gray-700">{viewingTest.notes}</span>
              </div>
            )}
            <div className="mt-3 text-xs text-gray-400">
              Tested by {viewingTest.tested_by_user?.full_name || '—'} · {viewingTest.test_date}
            </div>
            <button onClick={() => setViewingTest(null)}
              className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg">Close</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Left — pending items */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Pending Items ({filtered.length})</h3>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by asset, ornament, customer, phone, date, remarks..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No items pending purity test</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {filtered.map(item => (
                <button key={item.id} type="button"
                  onClick={() => { setSelectedItem(item); setComposition({ ...emptyComposition }); setNotes(''); setError('') }}
                  className={`w-full text-left px-5 py-3 hover:bg-yellow-50 transition ${selectedItem?.id === item.id ? 'bg-yellow-50 border-l-2 border-yellow-500' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-yellow-700 font-medium">{item.asset_code}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">{item.status}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{item.ornament_type}</p>
                  <p className="text-xs text-gray-500">{item.intake_headers?.customers?.full_name} · {item.intake_headers?.customers?.customer_code}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>Net: {item.net_weight}g</span>
                    <span>Est: {item.estimated_purity}%</span>
                    <span>Visit: {item.intake_headers?.visit_date}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — entry form */}
        <div>
          {selectedItem ? (
            <div className="bg-white border border-yellow-200 rounded-xl p-6">
              {/* Asset summary */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-yellow-700 font-medium text-sm">{selectedItem.asset_code}</span>
                  <button type="button" onClick={() => setSelectedItem(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>
                </div>
                <p className="font-medium text-gray-800 text-sm">{selectedItem.ornament_type}</p>
                <p className="text-xs text-gray-500 mt-0.5">{selectedItem.intake_headers?.customers?.full_name}</p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-gray-600">
                  <div>Gross: <span className="font-medium">{selectedItem.gross_weight}g</span></div>
                  <div>Net: <span className="font-medium">{selectedItem.net_weight}g</span></div>
                  <div>Est. purity: <span className="font-medium text-gray-800">{selectedItem.estimated_purity}%</span></div>
                </div>
                {selectedItem.remarks && <p className="text-xs text-gray-400 mt-1">Note: {selectedItem.remarks}</p>}
              </div>

              <form onSubmit={handleSaveTest} className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Machine Composition Analysis</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { field: 'gold_percent', label: 'Gold (%)', placeholder: 'Enter Gold %' },
                      { field: 'silver_percent', label: 'Silver (%)', placeholder: '0.000' },
                      { field: 'copper_percent', label: 'Copper (%)', placeholder: '0.000' },
                      { field: 'cadmium_percent', label: 'Cadmium (%)', placeholder: '0.000' },
                      { field: 'other_metals_percent', label: 'Other Metals (%)', placeholder: '0.000' },
                    ].map(({ field, label, placeholder }) => (
                      <div key={field}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                        <input type="number" step="0.001" min="0" max="100"
                          value={composition[field]}
                          onChange={e => handleCompositionInput(field, e.target.value, setComposition)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                          placeholder={placeholder} />
                        {field === 'gold_percent' && goldVal > 0 && (
                          <p className="text-xs text-yellow-700 mt-0.5">Karat: {calcKarat(composition.gold_percent)}K</p>
                        )}
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Total Composition</label>
                      <div className={`w-full border rounded-lg px-3 py-2 text-sm font-medium ${
                        total === 0 ? 'border-gray-200 bg-gray-50 text-gray-400' :
                        total >= 99.5 && total <= 100.5 ? 'border-green-300 bg-green-50 text-green-700' :
                        ((total >= 99.0 && total < 99.5) || (total > 100.5 && total <= 101.0)) ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
                        'border-red-300 bg-red-50 text-red-700'
                      }`}>
                        {total === 0 ? 'Awaiting Input' : <>{total.toFixed(3)}% <span className="text-xs ml-1">{totalLabel(total)}</span></>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live results */}
                {goldVal > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
                    <p className="text-xs text-green-700 font-medium">Calculated Results</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-700">Pure Gold Weight</span>
                      <span className="font-bold text-green-800">{calcPureGold(selectedItem.net_weight, composition.gold_percent)}g</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-green-600">Karat</span>
                      <span className="font-medium text-yellow-700">{calcKarat(composition.gold_percent)}K</span>
                    </div>
                    {selectedItem.estimated_purity && (
                      <div className={`flex justify-between text-xs pt-1 border-t border-green-200 ${varianceColor}`}>
                        <span>Variance vs Est. ({selectedItem.estimated_purity}%)</span>
                        <span className="font-semibold">{variance > 0 ? '+' : ''}{variance}% {varianceLabel}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Warnings */}
                {total > 0 && ((total >= 99.0 && total < 99.5) || (total > 100.5 && total <= 101.0)) && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-xs text-yellow-700">
                    ⚠ Total composition is {total.toFixed(3)}% — not close to 100%. Please verify machine reading before saving.
                  </div>
                )}
                {goldVal > 96 && <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-xs text-orange-700">⚠ Unusual gold value (above 96%) — verify machine reading</div>}
                {goldVal > 0 && goldVal < 40 && <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-xs text-orange-700">⚠ Unusual gold value (below 40%) — verify machine reading</div>}
                {parseFloat(composition.cadmium_percent) > 1 && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-700">⚠ High cadmium detected ({composition.cadmium_percent}%) — verify reading and item composition</div>}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    placeholder="Any observations from purity test..." />
                </div>

                <button type="submit" disabled={saving}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Purity Test'}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center justify-center min-h-48">
              <p className="text-gray-400 text-sm">← Select an item from the list to enter purity reading</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Tests */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-700">Recent Purity Tests</h3>
          <input type="text" value={recentSearch} onChange={e => setRecentSearch(e.target.value)}
            placeholder="Search by asset, customer, date, tested by, notes..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 w-80" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loadingRecent ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : filteredRecent.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">{recentSearch ? 'No results found' : 'No purity tests recorded yet'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Asset</th>
                    <th className="px-4 py-3 text-left">Ornament</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Net</th>
                    <th className="px-4 py-3 text-left">Est. Purity</th>
                    <th className="px-4 py-3 text-left">Gold %</th>
                    <th className="px-4 py-3 text-left">Karat</th>
                    <th className="px-4 py-3 text-left">Variance</th>
                    <th className="px-4 py-3 text-left">Pure Gold</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Tested By</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecent.map(test => {
                    const tGold = parseFloat(test.gold_percent || test.tested_purity || 0)
                    const tEst = parseFloat(test.estimated_purity || 0)
                    const tDiff = tGold - tEst
                    const tAbsDiff = Math.abs(tDiff)
                    const tVarColor = tAbsDiff <= 2 ? 'text-green-600' : tAbsDiff <= 5 ? 'text-yellow-600' : 'text-red-600'
                    const isEditing = editingTestId === test.id

                    return (
                      <tr key={test.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-yellow-700 text-xs">{test.intake_items?.asset_code}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{test.intake_items?.ornament_type}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{test.intake_items?.intake_headers?.customers?.full_name}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{test.intake_items?.net_weight}g</td>
                        <td className="px-4 py-3 text-xs text-gray-700">{tEst ? `${tEst}%` : '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          {isEditing ? (
                            <input type="number" step="0.001" min="0" max="100" value={editComposition.gold_percent}
                              onChange={e => handleCompositionInput('gold_percent', e.target.value, setEditComposition)}
                              className="w-20 border border-blue-300 rounded px-2 py-1 text-xs bg-blue-50 focus:outline-none" />
                          ) : (
                            <span className="font-medium text-gray-800">{(parseFloat(tGold) || 0).toFixed(3)}%</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-yellow-700 font-medium">{calcKarat(tGold)}K</td>
                        <td className="px-4 py-3 text-xs">
                          <span className={`font-medium ${tVarColor}`}>
                            {tDiff > 0 ? '+' : ''}{tDiff.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-green-700">{test.pure_gold_weight}g</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{test.test_date}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{test.tested_by_user?.full_name || '—'}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="space-y-1">
                              {['silver_percent', 'copper_percent', 'cadmium_percent', 'other_metals_percent'].map(f => (
                                <div key={f} className="flex items-center gap-1">
                                  <span className="text-xs text-gray-400 w-14">{f.split('_')[0]}</span>
                                  <input type="number" step="0.001" min="0" max="100" value={editComposition[f]}
                                    onChange={e => handleCompositionInput(f, e.target.value, setEditComposition)}
                                    className="w-16 border border-blue-300 rounded px-1 py-0.5 text-xs bg-blue-50 focus:outline-none" />
                                </div>
                              ))}
                              <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                                placeholder="Notes..." className="w-full border border-blue-300 rounded px-2 py-1 text-xs bg-blue-50 focus:outline-none mt-1" />
                              {editError && <div className="text-xs text-red-500">{editError}</div>}
                              <div className="flex gap-1 mt-1">
                                <button onClick={() => saveEditTest(test.id, test)} disabled={editSaving}
                                  className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded disabled:opacity-50">
                                  {editSaving ? '...' : 'Save'}
                                </button>
                                <button onClick={() => { setEditingTestId(null); setEditComposition({ ...emptyComposition }); setEditNotes(''); setEditError('') }}
                                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => setViewingTest(test)}
                                className="text-xs text-gray-600 hover:text-gray-800 font-medium hover:underline">View</button>
                              {isOwner && (
                                <button onClick={() => {
                                  setEditingTestId(test.id)
                                  setEditComposition({
                                    gold_percent: String(test.gold_percent || test.tested_purity || ''),
                                    silver_percent: String(test.silver_percent ?? '0'),
                                    copper_percent: String(test.copper_percent ?? '0'),
                                    cadmium_percent: String(test.cadmium_percent ?? '0'),
                                    other_metals_percent: String(test.other_metals_percent ?? '0')
                                  })
                                  setEditNotes(test.notes || '')
                                  setEditError('')
                                }} className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline">Edit</button>
                              )}
                              <button onClick={() => { setRemovingTestId(test.id); setRemoveReason(''); setRemoveError('') }}
                                className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline">Remove</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}