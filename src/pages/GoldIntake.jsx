import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const ORNAMENT_TYPES = [
  "24K GOLD", "BABY BANGLE", "BABY MEHENDI", "BABY RING", "BACK CHAIN", "BANGLE",
  "BLACKBEEDS", "BRACELET", "CHAIN", "CHAINDOLLAR", "CHAINDOLLAR SET", "CROWN",
  "DELIVERY CHARGES", "DIAMOND BANGLE", "DIAMOND BRACELET", "DIAMOND CHAIN PENDANT",
  "DIAMOND EARRING", "DIAMOND NECKLACE", "DIAMOND NECKLACE SET", "DIAMOND NOSEPIN",
  "DIAMOND PENDENT", "DIAMOND PENDENT SET", "DIAMOND RING", "EAR PIERCING", "EARRING",
  "GOLD ANKLET", "GOLD COIN", "GOLD LEG CHAIN", "GOLD ORNAMENT", "HAAR", "JHOOMER",
  "LGD BABY RING", "LGD BANGLE", "LGD BRACELET", "LGD EARRING", "LGD NECKLACE",
  "LGD PENDANT", "LGD RING", "JW DIA BANGLE", "JW DIA BRACELET", "JW DIA EARRING",
  "JW DIA NECKLACE", "JW DIA NOSEPIN", "JW DIA PENDANT", "JW DIA RING",
  "JW SILVER CHAIN", "JW SILVER DIA RING", "MANGTIKA", "MATTAL SET", "MEHENDI",
  "MEHENDI SET", "MISC", "MOHANMALA", "NECKLACE", "NECKLACE SET", "NOSE PIN",
  "OLD BALANCE", "OTHER CHARGES", "PENDENT", "PENDENT SET", "PIN", "PLATINUM CHAIN",
  "PLATINUM DIAMOND RING", "REPAIR", "RING", "SILVER ANKLET", "SILVER BABY ANKLET",
  "SILVER BABY BANGLE", "SILVER BABY BRACELET", "SILVER BABY LEG CHAIN", "SILVER BANGLE",
  "SILVER BRACELET", "SILVER CHAIN", "SILVER CHAIN PENDENT", "SILVER CHAIN PENDENT SET",
  "SILVER COIN", "SILVER EAR RING", "SILVER GLASS", "SILVER HAAR", "SILVER KAAP",
  "SILVER KEYCHAIN", "SILVER LEG RING", "SILVER NECK SET", "SILVER NECKLACE",
  "SILVER PENDENT", "SILVER PENDENT SET", "SILVER RING", "SILVER SAREE PIN", "SILVER SURMA DAN"
]

const emptyItem = {
  ornament_type: '',
  gross_weight: '',
  stone_weight: '0',
  dust_weight: '0',
  estimated_purity: '',
  disposition: '',
  remarks: ''
}

const lockedStatuses = ['melting', 'melted', 'stocked', 'settled', 'closed', 'cancelled']

const dispositionColors = {
  melt: 'bg-orange-50 text-orange-700',
  resale: 'bg-blue-50 text-blue-700',
  exchange: 'bg-purple-50 text-purple-700',
  return: 'bg-gray-100 text-gray-600',
  repair: 'bg-teal-50 text-teal-700'
}

const statusColors = {
  received: 'bg-yellow-50 text-yellow-700',
  on_hold: 'bg-gray-100 text-gray-600',
  tested: 'bg-blue-50 text-blue-700',
  approved: 'bg-green-50 text-green-700',
  melting: 'bg-orange-50 text-orange-700',
  melted: 'bg-red-50 text-red-700',
  stocked: 'bg-teal-50 text-teal-700',
  settled: 'bg-green-100 text-green-800',
  returned: 'bg-gray-100 text-gray-600',
  closed: 'bg-gray-200 text-gray-500',
  cancelled: 'bg-red-100 text-red-500'
}

function validateWeight(val) {
  if (!val && val !== 0) return false
  const str = String(val)
  const match = str.match(/^(\d+)(\.\d+)?$/)
  if (!match) return false
  if (match[2] && match[2].substring(1).length > 3) return false
  return parseFloat(val) >= 0
}

function validatePurity(val) {
  if (!val) return false
  const str = String(val)
  const match = str.match(/^(\d+)(\.\d{1,2})?$/)
  if (!match) return false
  const n = parseFloat(val)
  return n > 0 && n <= 100
}

function OrnamentInput({ value, onChange, isOwner, placeholder = "Type to search ornament..." }) {
  const [search, setSearch] = useState(value || '')
  const [showDrop, setShowDrop] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = ORNAMENT_TYPES.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10)

  function handleSelect(val) {
    setSearch(val)
    setShowDrop(false)
    setIsCustom(false)
    onChange(val)
  }

  return (
    <div ref={ref} className="relative">
      {isCustom && isOwner ? (
        <div className="flex gap-1">
          <input type="text" value={search}
            onChange={e => { setSearch(e.target.value); onChange(e.target.value) }}
            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-purple-50"
            placeholder="Enter custom ornament type..." autoFocus />
          <button type="button" onClick={() => { setIsCustom(false); setSearch(''); onChange('') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2">✕</button>
        </div>
      ) : (
        <input type="text" value={search}
          onChange={e => { setSearch(e.target.value); setShowDrop(true) }}
          onFocus={() => setShowDrop(true)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
          placeholder={placeholder} />
      )}
      {showDrop && !isCustom && (
        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
          {filtered.length > 0 ? filtered.map(o => (
            <button key={o} type="button" onClick={() => handleSelect(o)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-yellow-50 border-b border-gray-50 last:border-0">{o}</button>
          )) : <div className="px-3 py-2 text-sm text-gray-400">No match found</div>}
          {isOwner && (
            <button type="button" onClick={() => { setIsCustom(true); setShowDrop(false) }}
              className="w-full text-left px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 border-t border-gray-100 font-medium">
              + Custom / Other
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const DispositionSelect = ({ value, onChange, className }) => (
  <select value={value} onChange={onChange} className={className}>
    <option value="" disabled>Select disposition...</option>
    <option value="melt">Melt</option>
    <option value="resale">Resale</option>
    <option value="exchange">Exchange</option>
    <option value="return">Return to Customer (Testing)</option>
    <option value="repair">Repair / Polish</option>
  </select>
)

export default function GoldIntake() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const today = new Date().toISOString().split('T')[0]

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickForm, setQuickForm] = useState({ full_name: '', phone: '', address: '', notes: '' })
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickError, setQuickError] = useState('')

  const [items, setItems] = useState([{ ...emptyItem }])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [recentIntakes, setRecentIntakes] = useState([])
  const [loadingIntakes, setLoadingIntakes] = useState(true)
  const [intakeSearch, setIntakeSearch] = useState('')

  const [viewingIntake, setViewingIntake] = useState(null)
  const [addingToIntakeId, setAddingToIntakeId] = useState(null)
  const [addItemForm, setAddItemForm] = useState({ ...emptyItem })
  const [addItemSaving, setAddItemSaving] = useState(false)
  const [addItemError, setAddItemError] = useState('')

  const [editingItemId, setEditingItemId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [cancellingItemId, setCancellingItemId] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const [editingDateId, setEditingDateId] = useState(null)
  const [editDateValue, setEditDateValue] = useState('')
  const [editDateSaving, setEditDateSaving] = useState(false)

  useEffect(() => { fetchRecentIntakes() }, [])

  async function fetchRecentIntakes() {
    setLoadingIntakes(true)
    const { data } = await supabase
      .from('intake_headers')
      .select(`*, customers (full_name, customer_code, phone),
        intake_items (id, asset_code, ornament_type, gross_weight, stone_weight, dust_weight, net_weight, estimated_purity, disposition, status, remarks, cancelled_by, cancellation_reason, updated_at)`)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setRecentIntakes(data)
    setLoadingIntakes(false)
  }

  const filteredIntakes = recentIntakes.filter(intake => {
    if (!intakeSearch.trim()) return true
    const q = intakeSearch.toLowerCase()
    const customer = intake.customers
    if (customer?.full_name?.toLowerCase().includes(q)) return true
    if (customer?.customer_code?.toLowerCase().includes(q)) return true
    if (customer?.phone?.toLowerCase().includes(q)) return true
    if (intake.intake_items?.some(item => item.asset_code?.toLowerCase().includes(q))) return true
if (intake.intake_items?.some(item => item.ornament_type?.toLowerCase().includes(q))) return true
if (intake.intake_items?.some(item => item.remarks?.toLowerCase().includes(q))) return true
if (intake.visit_date?.toLowerCase().includes(q)) return true
return false
  })

  async function searchCustomers(val) {
    setCustomerSearch(val)
    setShowDropdown(true)
    if (!val.trim()) { setCustomerResults([]); return }
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, phone, customer_code, address')
      .eq('is_active', true)
      .or(`full_name.ilike.%${val}%,phone.ilike.%${val}%,customer_code.ilike.%${val}%`)
      .limit(8)
    setCustomerResults(data || [])
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setCustomerSearch(c.full_name + ' — ' + c.customer_code)
    setShowDropdown(false)
    setCustomerResults([])
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setCustomerSearch('')
    setCustomerResults([])
  }

  async function handleQuickAdd(e) {
    e.preventDefault()
    setQuickError('')
    if (!/^\d{10}$/.test(quickForm.phone)) { setQuickError('Phone must be exactly 10 digits'); return }
    setQuickSaving(true)
    const { data, error } = await supabase
      .from('customers')
      .insert({ full_name: quickForm.full_name, phone: quickForm.phone, address: quickForm.address, notes: quickForm.notes, created_by: profile.id })
      .select().single()
    if (error) { setQuickError(error.message) }
    else { selectCustomer(data); setShowQuickAdd(false); setQuickForm({ full_name: '', phone: '', address: '', notes: '' }) }
    setQuickSaving(false)
  }

  function addItem() { setItems([...items, { ...emptyItem }]) }
  function removeItem(i) { if (items.length === 1) return; setItems(items.filter((_, idx) => idx !== i)) }
  function updateItem(i, field, value) { const u = [...items]; u[i] = { ...u[i], [field]: value }; setItems(u) }

  function calcNet(item) {
    const g = parseFloat(item.gross_weight) || 0
    const s = parseFloat(item.stone_weight) || 0
    const d = parseFloat(item.dust_weight) || 0
    const net = g - s - d
    return net >= 0 ? net.toFixed(3) : '—'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    setError(''); setSuccess('')
    if (!selectedCustomer) { setError('Please select a customer'); return }
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.ornament_type) { setError(`Ornament ${i + 1}: select an ornament type`); return }
      if (!item.disposition) { setError(`Ornament ${i + 1}: select a disposition`); return }
      if (!validateWeight(item.gross_weight) || parseFloat(item.gross_weight) <= 0) { setError(`Ornament ${i + 1}: enter valid gross weight`); return }
      if (!validatePurity(item.estimated_purity)) { setError(`Ornament ${i + 1}: purity must be 0.01–100`); return }
      if (parseFloat(item.gross_weight) - (parseFloat(item.stone_weight) || 0) - (parseFloat(item.dust_weight) || 0) < 0) { setError(`Ornament ${i + 1}: stone + dust cannot exceed gross weight`); return }
    }
    setSaving(true)
    const { data: header, error: headerError } = await supabase
      .from('intake_headers')
      .insert({ customer_id: selectedCustomer.id, staff_id: profile.id, visit_date: today, status: 'open' })
      .select().single()
    if (headerError) { setError(headerError.message); setSaving(false); return }
    const { error: itemsError } = await supabase.from('intake_items').insert(
      items.map(item => ({
        intake_header_id: header.id,
        ornament_type: item.ornament_type,
        gross_weight: parseFloat(parseFloat(item.gross_weight).toFixed(3)),
        stone_weight: parseFloat(parseFloat(item.stone_weight || 0).toFixed(3)),
        dust_weight: parseFloat(parseFloat(item.dust_weight || 0).toFixed(3)),
        estimated_purity: parseFloat(parseFloat(item.estimated_purity).toFixed(2)),
        disposition: item.disposition,
        remarks: item.remarks || null,
        status: 'received'
      }))
    )
    if (itemsError) { setError(itemsError.message); setSaving(false); return }
    setSuccess(`Intake recorded for ${selectedCustomer.full_name}`)
    clearCustomer(); setItems([{ ...emptyItem }])
    fetchRecentIntakes(); setTimeout(() => setSuccess(''), 4000); setSaving(false)
  }

  function startEdit(item) {
    setEditingItemId(item.id)
    setEditForm({
      ornament_type: item.ornament_type,
      gross_weight: item.gross_weight,
      stone_weight: item.stone_weight,
      dust_weight: item.dust_weight,
      estimated_purity: item.estimated_purity,
      disposition: item.disposition,
      remarks: item.remarks || ''
    })
    setEditError('')
  }

  function cancelEdit() { setEditingItemId(null); setEditForm({}); setEditError('') }

  async function saveEdit(itemId, originalItem) {
    setEditError('')
    const g = parseFloat(editForm.gross_weight) || 0
    const s = parseFloat(editForm.stone_weight) || 0
    const d = parseFloat(editForm.dust_weight) || 0
    if (!editForm.ornament_type) { setEditError('Select ornament type'); return }
    if (!editForm.disposition) { setEditError('Select disposition'); return }
    if (!validateWeight(editForm.gross_weight) || g <= 0) { setEditError('Invalid gross weight'); return }
    if (!validatePurity(editForm.estimated_purity)) { setEditError('Invalid purity'); return }
    if (s + d > g) { setEditError('Stone + dust cannot exceed gross weight'); return }
    setEditSaving(true)
    const { error } = await supabase.from('intake_items').update({
      ornament_type: editForm.ornament_type,
      gross_weight: parseFloat(g.toFixed(3)),
      stone_weight: parseFloat(s.toFixed(3)),
      dust_weight: parseFloat(d.toFixed(3)),
      estimated_purity: parseFloat(parseFloat(editForm.estimated_purity).toFixed(2)),
      disposition: editForm.disposition,
      remarks: editForm.remarks || null,
      updated_at: new Date().toISOString()
    }).eq('id', itemId)
    if (error) { setEditError(error.message); setEditSaving(false); return }
    const auditFields = ['ornament_type', 'gross_weight', 'stone_weight', 'dust_weight', 'estimated_purity', 'disposition', 'remarks']
    const normalize = val => val ?? ''
const auditEntries = auditFields
  .filter(f => String(normalize(originalItem[f])) !== String(normalize(editForm[f])))
      .map(f => ({ changed_by: profile.id, changed_by_name: profile.full_name, table_name: 'intake_items', record_id: itemId, field_name: f, old_value: String(normalize(originalItem[f])), new_value: String(normalize(editForm[f])) }))
    if (auditEntries.length > 0) await supabase.from('audit_log').insert(auditEntries)
    cancelEdit(); fetchRecentIntakes(); setEditSaving(false)
  }

  async function handleCancelItem(e) {
    e.preventDefault()
    const finalReason = cancelReason.trim()
    if (!finalReason) { setCancelError('Cancellation reason is required'); return }
    setCancelSaving(true); setCancelError('')
    const item = recentIntakes.flatMap(i => i.intake_items || []).find(i => i.id === cancellingItemId)
    const { error } = await supabase.from('intake_items').update({
      status: 'cancelled', cancelled_by: profile.id, cancellation_reason: finalReason, updated_at: new Date().toISOString()
    }).eq('id', cancellingItemId)
    if (error) { setCancelError(error.message); setCancelSaving(false); return }
    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name, table_name: 'intake_items',
      record_id: cancellingItemId, field_name: 'full_asset_cancellation',
      old_value: JSON.stringify({ asset_code: item?.asset_code, ornament_type: item?.ornament_type, gross_weight: item?.gross_weight, stone_weight: item?.stone_weight, dust_weight: item?.dust_weight, net_weight: item?.net_weight, estimated_purity: item?.estimated_purity, disposition: item?.disposition, remarks: item?.remarks, previous_status: item?.status }),
      new_value: JSON.stringify({ action: 'cancelled', cancellation_reason: finalReason, cancelled_by: profile.id, cancelled_at: new Date().toISOString() })
    })
    setCancellingItemId(null); setCancelReason(''); fetchRecentIntakes(); setCancelSaving(false)
  }

  async function handleAddItemToIntake(intake) {
    if (addItemSaving) return
    setAddItemError('')
    if (!addItemForm.ornament_type) { setAddItemError('Select an ornament type'); return }
    if (!addItemForm.disposition) { setAddItemError('Select a disposition'); return }
    if (!validateWeight(addItemForm.gross_weight) || parseFloat(addItemForm.gross_weight) <= 0) { setAddItemError('Enter valid gross weight'); return }
    if (!validatePurity(addItemForm.estimated_purity)) { setAddItemError('Purity must be 0.01–100'); return }
    if (parseFloat(addItemForm.gross_weight) - (parseFloat(addItemForm.stone_weight) || 0) - (parseFloat(addItemForm.dust_weight) || 0) < 0) { setAddItemError('Stone + dust cannot exceed gross weight'); return }
    setAddItemSaving(true)
    const { data: newItem, error } = await supabase.from('intake_items').insert({
      intake_header_id: addingToIntakeId,
      ornament_type: addItemForm.ornament_type,
      gross_weight: parseFloat(parseFloat(addItemForm.gross_weight).toFixed(3)),
      stone_weight: parseFloat(parseFloat(addItemForm.stone_weight || 0).toFixed(3)),
      dust_weight: parseFloat(parseFloat(addItemForm.dust_weight || 0).toFixed(3)),
      estimated_purity: parseFloat(parseFloat(addItemForm.estimated_purity).toFixed(2)),
      disposition: addItemForm.disposition, remarks: addItemForm.remarks || null, status: 'received'
    }).select().single()
    if (error) { setAddItemError(error.message); setAddItemSaving(false); return }

    // Audit if owner is adding to a past intake
    if (isOwner && intake.visit_date !== today) {
      await supabase.from('audit_log').insert({
        changed_by: profile.id,
        changed_by_name: profile.full_name,
        table_name: 'intake_headers',
        record_id: addingToIntakeId,
        field_name: 'ornament_added_to_past_intake',
        old_value: intake.visit_date,
      new_value: JSON.stringify({
  intake_visit_date: intake.visit_date,
  asset_code: newItem?.asset_code || 'pending',
  ornament_type: addItemForm.ornament_type,
  added_by_name: profile.full_name,
  added_at: new Date().toISOString()
        })
      })
    }

    setAddingToIntakeId(null); setAddItemForm({ ...emptyItem }); fetchRecentIntakes()
    setAddItemSaving(false)
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
  const editInputCls = "w-full border border-blue-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50"

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Gold Intake</h2>
          <p className="text-sm text-gray-500 mt-0.5">Record old gold brought in by customers</p>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{success}</div>}

      {editingDateId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-700 mb-4">Edit Visit Date</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Visit Date</label>
            <input type="date" value={editDateValue} onChange={e => setEditDateValue(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 mb-4" />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setEditingDateId(null); setEditDateValue('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="button" disabled={editDateSaving} onClick={async () => {
                if (!editDateValue) return
if (editDateValue > today) {
  alert('Future dates are not allowed for intake records')
  return
}
setEditDateSaving(true)
                const intake = recentIntakes.find(i => i.id === editingDateId)
                await supabase.from('intake_headers').update({ visit_date: editDateValue }).eq('id', editingDateId)
                await supabase.from('audit_log').insert({
                  changed_by: profile.id, changed_by_name: profile.full_name,
                  table_name: 'intake_headers', record_id: editingDateId,
                  field_name: 'visit_date', old_value: intake?.visit_date, new_value: editDateValue
                })
                setEditingDateId(null); setEditDateValue(''); fetchRecentIntakes(); setEditDateSaving(false)
              }} className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {editDateSaving ? 'Saving...' : 'Save Date'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancellingItemId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-red-700 mb-2">Remove Asset</h3>
            <p className="text-sm text-gray-500 mb-3">This asset will be permanently removed from the intake.</p>
<ul className="text-xs text-gray-500 mb-4 space-y-1">
  <li>• Asset will be marked as cancelled</li>
  <li>• Action will be audit logged permanently</li>
  <li>• A mandatory reason must be provided</li>
</ul>
            {cancelError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{cancelError}</div>}
            <form onSubmit={handleCancelItem}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for removal</label>
              <input type="text" required value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-2"
                placeholder="Describe reason for removal..." />
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => { setCancellingItemId(null); setCancelReason(''); setCancelError('') }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={cancelSaving}
                  className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                  {cancelSaving ? 'Removing...' : 'Confirm Remove'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-700 mb-4">Step 1 — Select Customer</h3>
          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <div>
                <p className="font-medium text-gray-800">{selectedCustomer.full_name}</p>
                <p className="text-sm text-gray-500">{selectedCustomer.customer_code} · {selectedCustomer.phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">Visit Date: {today}</p>
              </div>
              <button type="button" onClick={clearCustomer} className="text-sm text-red-500 hover:underline">Change</button>
            </div>
          ) : (
            <div className="relative">
              <input type="text" value={customerSearch} onChange={e => searchCustomers(e.target.value)}
                onFocus={() => customerSearch && setShowDropdown(true)}
                placeholder="Search by name, phone or customer code..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              {showDropdown && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                  {customerResults.length > 0 ? customerResults.map(c => (
                    <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                      className="w-full text-left px-4 py-3 hover:bg-yellow-50 border-b border-gray-100 last:border-0">
                      <p className="text-sm font-medium text-gray-800">{c.full_name}</p>
                      <p className="text-xs text-gray-500">{c.customer_code} · {c.phone}</p>
                    </button>
                  )) : customerSearch.trim() ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      No customer found.{' '}
                      <button type="button" onClick={() => { setShowDropdown(false); setShowQuickAdd(true) }}
                        className="text-yellow-600 font-medium hover:underline">+ Add new customer</button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {showQuickAdd && (
          <div className="bg-white border border-yellow-300 rounded-xl p-6">
            <h3 className="text-base font-semibold text-gray-700 mb-4">Quick Add Customer</h3>
            {quickError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{quickError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" required value={quickForm.full_name} onChange={e => setQuickForm({ ...quickForm, full_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Customer full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (exactly 10 digits)</label>
                <input type="text" required maxLength={10} value={quickForm.phone}
                  onChange={e => setQuickForm({ ...quickForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="10-digit number" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" required value={quickForm.address} onChange={e => setQuickForm({ ...quickForm, address: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Full address" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                <input type="text" value={quickForm.notes} onChange={e => setQuickForm({ ...quickForm, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Any remarks" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setShowQuickAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="button" onClick={handleQuickAdd} disabled={quickSaving}
                className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {quickSaving ? 'Saving...' : 'Save & Select'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-700">Step 2 — Ornaments</h3>
            <button type="button" onClick={addItem}
              className="text-sm text-yellow-600 hover:text-yellow-800 font-medium border border-yellow-300 px-3 py-1.5 rounded-lg hover:bg-yellow-50 transition">
              + Add Ornament
            </button>
          </div>
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-600">Ornament {i + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Ornament Type {!isOwner && <span className="text-gray-400">(predefined list)</span>}
                      {isOwner && <span className="text-purple-500 ml-1">(owner: custom allowed)</span>}
                    </label>
                    <OrnamentInput value={item.ornament_type} onChange={val => updateItem(i, 'ornament_type', val)} isOwner={isOwner} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Gross Weight (g)</label>
                    <input type="number" step="0.001" min="0" value={item.gross_weight} onChange={e => updateItem(i, 'gross_weight', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="0.000" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stone Weight (g)</label>
                    <input type="number" step="0.001" min="0" value={item.stone_weight} onChange={e => updateItem(i, 'stone_weight', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="0.000" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dust Weight (g)</label>
                    <input type="number" step="0.001" min="0" value={item.dust_weight} onChange={e => updateItem(i, 'dust_weight', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="0.000" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Est. Purity (%)</label>
                    <input type="number" step="0.01" min="0.01" max="100" value={item.estimated_purity} onChange={e => updateItem(i, 'estimated_purity', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="91.6" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Net Weight (auto)</label>
                    <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 font-mono">{calcNet(item)} g</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Disposition</label>
                    <DispositionSelect value={item.disposition} onChange={e => updateItem(i, 'disposition', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                    <input type="text" value={item.remarks} onChange={e => updateItem(i, 'remarks', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="Identifying marks, hallmark, design notes..." />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-8 py-2.5 rounded-lg transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Intake'}
          </button>
        </div>
      </form>

      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-700">Recent Intakes</h3>
          <input type="text" value={intakeSearch} onChange={e => setIntakeSearch(e.target.value)}
           placeholder="Search by name, code, phone, asset, ornament, date..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 w-72" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loadingIntakes ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : filteredIntakes.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">{intakeSearch ? 'No results found' : 'No intakes recorded yet'}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredIntakes.map(intake => {
                const activeItems = intake.intake_items?.filter(item => item.status !== 'cancelled') || []
                const isArchived = activeItems.length === 0
                const canAddItem = !isArchived && intake.status === 'open' && (isOwner || intake.visit_date === today)
                return (
                  <div key={intake.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium text-gray-800">{intake.customers?.full_name}</span>
                        <span className="text-gray-400 text-sm ml-2">{intake.customers?.customer_code}</span>
                        <span className="text-gray-400 text-sm ml-2">· {intake.customers?.phone}</span>
                        <div className="text-xs text-gray-500 mt-1">
                          Visit Date: {intake.visit_date}
                          {isOwner && intake.visit_date !== today && !isArchived && intake.status === 'open' && (
                            <span className="ml-2 text-orange-500 font-medium">past intake</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          isArchived ? 'bg-red-50 text-red-500' :
                          intake.status === 'completed' ? 'bg-green-50 text-green-700' :
                          intake.status === 'in_progress' ? 'bg-blue-50 text-blue-700' :
                          'bg-yellow-50 text-yellow-700'
                        }`}>{isArchived ? 'Archived' : intake.status}</span>
                        {isOwner && !isArchived && (
                          <button onClick={() => { setEditingDateId(intake.id); setEditDateValue(intake.visit_date) }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline">
                            Edit Date
                          </button>
                        )}
                        <button onClick={() => setViewingIntake(viewingIntake?.id === intake.id ? null : intake)}
                          className="text-xs text-yellow-600 hover:text-yellow-800 font-medium hover:underline">
                          {viewingIntake?.id === intake.id ? 'Hide' : 'View'}
                        </button>
                        {canAddItem && (
                          <button onClick={() => { setAddingToIntakeId(addingToIntakeId === intake.id ? null : intake.id); setAddItemForm({ ...emptyItem }); setAddItemError('') }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline">
                            {addingToIntakeId === intake.id ? 'Cancel' : '+ Add Item'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-2">
                      {activeItems.map(item => (
                        <span key={item.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                          {item.asset_code} · {item.ornament_type} · {item.net_weight}g
                          <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${dispositionColors[item.disposition] || 'bg-gray-100 text-gray-500'}`}>{item.disposition}</span>
                        </span>
                      ))}
                    </div>

                    {canAddItem && addingToIntakeId === intake.id && (
                      <div className="mt-3 border border-blue-100 rounded-lg p-4 bg-blue-50">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-gray-700">Add Ornament to this Intake</h4>
                          <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded px-2 py-1">Visit Date: {intake.visit_date}</span>
                        </div>
                        {isOwner && intake.visit_date !== today && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700 mb-3">
                            ⚠ You are adding an ornament to a past intake ({intake.visit_date}). This action will be audit logged.
                          </div>
                        )}
                        {addItemError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{addItemError}</div>}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Ornament Type</label>
                            <OrnamentInput value={addItemForm.ornament_type} onChange={val => setAddItemForm({ ...addItemForm, ornament_type: val })} isOwner={isOwner} />
                          </div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Gross Weight (g)</label>
                            <input type="number" step="0.001" min="0" value={addItemForm.gross_weight} onChange={e => setAddItemForm({ ...addItemForm, gross_weight: e.target.value })} className={inputCls} placeholder="0.000" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Stone Weight (g)</label>
                            <input type="number" step="0.001" min="0" value={addItemForm.stone_weight} onChange={e => setAddItemForm({ ...addItemForm, stone_weight: e.target.value })} className={inputCls} placeholder="0.000" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Dust Weight (g)</label>
                            <input type="number" step="0.001" min="0" value={addItemForm.dust_weight} onChange={e => setAddItemForm({ ...addItemForm, dust_weight: e.target.value })} className={inputCls} placeholder="0.000" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Est. Purity (%)</label>
                            <input type="number" step="0.01" min="0.01" max="100" value={addItemForm.estimated_purity} onChange={e => setAddItemForm({ ...addItemForm, estimated_purity: e.target.value })} className={inputCls} placeholder="91.6" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Net Weight (auto)</label>
                            <div className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-700 font-mono">{calcNet(addItemForm)} g</div></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Disposition</label>
                            <DispositionSelect value={addItemForm.disposition} onChange={e => setAddItemForm({ ...addItemForm, disposition: e.target.value })} className={inputCls} /></div>
                          <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                            <input type="text" value={addItemForm.remarks} onChange={e => setAddItemForm({ ...addItemForm, remarks: e.target.value })} className={inputCls} placeholder="Identifying marks..." /></div>
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                          <button type="button" onClick={() => { setAddingToIntakeId(null); setAddItemForm({ ...emptyItem }) }}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                          <button type="button" onClick={() => handleAddItemToIntake(intake)} disabled={addItemSaving}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                            {addItemSaving ? 'Saving...' : 'Add Ornament'}
                          </button>
                        </div>
                      </div>
                    )}

                    {viewingIntake?.id === intake.id && (
                      <div className="mt-3 border border-gray-100 rounded-lg overflow-hidden">
                        {editError && <div className="bg-red-50 text-red-600 text-xs px-4 py-2">{editError}</div>}
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 text-gray-500 uppercase">
                            <tr>
                              <th className="px-3 py-2 text-left">Asset</th>
                              <th className="px-3 py-2 text-left">Type</th>
                              <th className="px-3 py-2 text-left">Gross</th>
                              <th className="px-3 py-2 text-left">Stone</th>
                              <th className="px-3 py-2 text-left">Dust</th>
                              <th className="px-3 py-2 text-left">Net</th>
                              <th className="px-3 py-2 text-left">Purity</th>
                              <th className="px-3 py-2 text-left">Disposition</th>
                              <th className="px-3 py-2 text-left">Status</th>
                              <th className="px-3 py-2 text-left">Remarks</th>
                              <th className="px-3 py-2 text-left">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {intake.intake_items?.map(item => {
                              const isEditing = editingItemId === item.id
                              const isLocked = lockedStatuses.includes(item.status)
                              const isCancelled = item.status === 'cancelled'
                              const canRemove = !isArchived && !isLocked && !isCancelled
                              const canEdit = !isArchived && isOwner && !isLocked && !isCancelled
                              const editNet = isEditing ? (() => {
                                const g = parseFloat(editForm.gross_weight) || 0
                                const s = parseFloat(editForm.stone_weight) || 0
                                const d = parseFloat(editForm.dust_weight) || 0
                                const n = g - s - d
                                return n >= 0 ? n.toFixed(3) : '—'
                              })() : null
                              return (
                                <tr key={item.id} className={`hover:bg-gray-50 ${isEditing ? 'bg-blue-50' : ''} ${isCancelled ? 'opacity-50 bg-red-50' : ''}`}>
                                  <td className="px-3 py-2 font-mono text-yellow-700">{item.asset_code}</td>
                                  <td className="px-3 py-2">
                                    {isEditing ? <OrnamentInput value={editForm.ornament_type} onChange={val => setEditForm({ ...editForm, ornament_type: val })} isOwner={isOwner} /> : item.ornament_type}
                                  </td>
                                  <td className="px-3 py-2">{isEditing ? <input type="number" step="0.001" min="0" value={editForm.gross_weight} onChange={e => setEditForm({ ...editForm, gross_weight: e.target.value })} className={editInputCls} /> : `${item.gross_weight}g`}</td>
                                  <td className="px-3 py-2">{isEditing ? <input type="number" step="0.001" min="0" value={editForm.stone_weight} onChange={e => setEditForm({ ...editForm, stone_weight: e.target.value })} className={editInputCls} /> : `${item.stone_weight}g`}</td>
                                  <td className="px-3 py-2">{isEditing ? <input type="number" step="0.001" min="0" value={editForm.dust_weight} onChange={e => setEditForm({ ...editForm, dust_weight: e.target.value })} className={editInputCls} /> : `${item.dust_weight}g`}</td>
                                  <td className="px-3 py-2 font-medium">{isEditing ? <div className="border border-gray-200 rounded px-2 py-1 bg-white font-mono text-gray-700">{editNet} g</div> : `${item.net_weight}g`}</td>
                                  <td className="px-3 py-2">{isEditing ? <input type="number" step="0.01" min="0.01" max="100" value={editForm.estimated_purity} onChange={e => setEditForm({ ...editForm, estimated_purity: e.target.value })} className={editInputCls} /> : `${item.estimated_purity}%`}</td>
                                  <td className="px-3 py-2">
                                    {isEditing ? (
                                      <DispositionSelect value={editForm.disposition} onChange={e => setEditForm({ ...editForm, disposition: e.target.value })} className={editInputCls} />
                                    ) : <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dispositionColors[item.disposition] || 'bg-gray-100 text-gray-500'}`}>{item.disposition}</span>}
                                  </td>
                                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-500'}`}>{item.status}</span></td>
                                  <td className="px-3 py-2">
                                    {isEditing
                                      ? <input value={editForm.remarks} onChange={e => setEditForm({ ...editForm, remarks: e.target.value })} className={editInputCls} />
                                      : isCancelled
                                        ? <div>
                                            <span className="text-gray-400">{item.remarks || '—'}</span>
                                            {item.cancellation_reason && <div className="text-red-400 mt-0.5">Cancelled: {item.cancellation_reason}</div>}
                                            {item.updated_at && <div className="text-gray-300 mt-0.5">At: {new Date(item.updated_at).toLocaleString()}</div>}
                                          </div>
                                        : <span>{item.remarks || '—'}</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {isCancelled ? (
                                      <span className="text-xs text-red-400">Cancelled</span>
                                    ) : isEditing ? (
                                      <div className="flex gap-2">
                                        <button onClick={() => saveEdit(item.id, item)} disabled={editSaving}
                                          className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded disabled:opacity-50">
                                          {editSaving ? '...' : 'Save'}
                                        </button>
                                        <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Cancel</button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-2">
                                        {canEdit && <button onClick={() => startEdit(item)} className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline">Edit</button>}
                                        {canRemove && <button onClick={() => { setCancellingItemId(item.id); setCancelReason(''); setCancelError('') }} className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline">Remove</button>}
                                        {isLocked && <span className="text-xs text-gray-300">Locked</span>}
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
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}