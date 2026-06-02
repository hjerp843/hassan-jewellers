import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Customers() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ full_name: '', phone: '', address: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Duplicate detection
  const [duplicateWarning, setDuplicateWarning] = useState([])
  const [duplicateChecking, setDuplicateChecking] = useState(false)
  const [proceedDespiteDuplicate, setProceedDespiteDuplicate] = useState(false)

  // Deactivation modal
  const [deactivatingId, setDeactivatingId] = useState(null)
  const [deactivationReason, setDeactivationReason] = useState('')
  const [deactivatingSaving, setDeactivatingSaving] = useState(false)
  const [deactivationError, setDeactivationError] = useState('')

  // Reactivation modal
  const [reactivatingId, setReactivatingId] = useState(null)
  const [reactivationReason, setReactivationReason] = useState('')
  const [reactivatingSaving, setReactivatingSaving] = useState(false)

  useEffect(() => { fetchCustomers() }, [filter])

  async function fetchCustomers() {
    setLoading(true)
    let query = supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (filter === 'active') query = query.eq('is_active', true)
    if (filter === 'inactive') query = query.eq('is_active', false)
    const { data, error } = await query
    if (error) console.error(error)
    else setCustomers(data)
    setLoading(false)
  }

  async function checkDuplicates(phone) {
    if (!/^\d{10}$/.test(phone)) { setDuplicateWarning([]); return }
    setDuplicateChecking(true)
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, phone, customer_code, address')
      .eq('phone', phone)
    const matches = (data || []).filter(c => c.id !== editingId)
    setDuplicateWarning(matches)
    if (matches.length > 0) setProceedDespiteDuplicate(false)
    setDuplicateChecking(false)
  }

  function openAddForm() {
    setEditingId(null)
    setForm({ full_name: '', phone: '', address: '', notes: '' })
    setDuplicateWarning([])
    setProceedDespiteDuplicate(false)
    setError(''); setSuccess('')
    setShowForm(true)
  }

  function openEditForm(customer) {
    if (!isOwner) return
    setEditingId(customer.id)
    setForm({ full_name: customer.full_name, phone: customer.phone, address: customer.address, notes: customer.notes || '' })
    setDuplicateWarning([])
    setProceedDespiteDuplicate(false)
    setError(''); setSuccess('')
    setShowForm(true)
  }

  function cancelForm() {
  setShowForm(false)
  setEditingId(null)
  setForm({ full_name: '', phone: '', address: '', notes: '' })
  setDuplicateWarning([])
  setProceedDespiteDuplicate(false)
  setError('')
  // Note: success intentionally not cleared here
}

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!/^\d{10}$/.test(form.phone)) { setError('Phone must be exactly 10 digits'); return }

    // Block if duplicates exist and user hasn't confirmed
    if (duplicateWarning.length > 0 && !proceedDespiteDuplicate) {
      setError('Duplicate phone detected. Review existing customers below or confirm to proceed.')
      return
    }

    setSaving(true)

    if (editingId) {
      const original = customers.find(c => c.id === editingId)
      const { error } = await supabase
        .from('customers')
        .update({ full_name: form.full_name, phone: form.phone, address: form.address, notes: form.notes, updated_at: new Date().toISOString() })
        .eq('id', editingId)

      if (error) { setError(error.message); setSaving(false); return }

      const auditFields = ['full_name', 'phone', 'address']
      const auditEntries = auditFields
        .filter(f => String(original[f]) !== String(form[f]))
        .map(f => ({
          changed_by: profile.id,
          changed_by_name: profile.full_name,
          table_name: 'customers',
          record_id: editingId,
          field_name: f,
          old_value: String(original[f]),
          new_value: String(form[f])
        }))
      if (auditEntries.length > 0) await supabase.from('audit_log').insert(auditEntries)

      setSuccess('Customer updated successfully')
    } else {
      const { error } = await supabase.from('customers').insert({
        full_name: form.full_name,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
        created_by: profile.id
      })
      if (error) { setError(error.message); setSaving(false); return }
      setSuccess('Customer added successfully')
    }

    cancelForm(); fetchCustomers()
    setTimeout(() => setSuccess(''), 3000)
    setSaving(false)
  }

  async function handleDeactivate(e) {
    e.preventDefault()
    const finalReason = deactivationReason.trim()
    if (!finalReason) { setDeactivationError('Reason is required'); return }
    setDeactivatingSaving(true)
    setDeactivationError('')

    const customer = customers.find(c => c.id === deactivatingId)

    const { error } = await supabase.from('customers').update({
      is_active: false,
      deactivated_by: profile.id,
      deactivation_reason: finalReason,
      updated_at: new Date().toISOString()
    }).eq('id', deactivatingId)

    if (error) { setDeactivationError(error.message); setDeactivatingSaving(false); return }

    await supabase.from('audit_log').insert({
      changed_by: profile.id,
      changed_by_name: profile.full_name,
      table_name: 'customers',
      record_id: deactivatingId,
      field_name: 'customer_deactivation',
      old_value: JSON.stringify({
        full_name: customer?.full_name,
        phone: customer?.phone,
        address: customer?.address,
        customer_code: customer?.customer_code,
        previous_status: 'active'
      }),
      new_value: JSON.stringify({
        action: 'deactivated',
        reason: finalReason,
        deactivated_by_name: profile.full_name,
        deactivated_at: new Date().toISOString()
      })
    })

    setDeactivatingId(null)
    setDeactivationReason('')
    fetchCustomers()
    setSuccess('Customer deactivated')
    setTimeout(() => setSuccess(''), 3000)
    setDeactivatingSaving(false)
  }

  async function handleReactivate(e) {
    e.preventDefault()
    if (!reactivationReason.trim()) return
    setReactivatingSaving(true)

    const customer = customers.find(c => c.id === reactivatingId)

    const { error } = await supabase.from('customers').update({
      is_active: true,
      reactivated_by: profile.id,
      reactivation_reason: reactivationReason.trim(),
      updated_at: new Date().toISOString()
    }).eq('id', reactivatingId)

    if (!error) {
      await supabase.from('audit_log').insert({
        changed_by: profile.id,
        changed_by_name: profile.full_name,
        table_name: 'customers',
        record_id: reactivatingId,
        field_name: 'customer_reactivation',
        old_value: JSON.stringify({ full_name: customer?.full_name, customer_code: customer?.customer_code, previous_status: 'inactive' }),
        new_value: JSON.stringify({ action: 'reactivated', reason: reactivationReason.trim(), reactivated_by_name: profile.full_name, reactivated_at: new Date().toISOString() })
      })
      setSuccess('Customer reactivated')
      fetchCustomers()
      setTimeout(() => setSuccess(''), 3000)
    }

    setReactivatingId(null)
    setReactivationReason('')
    setReactivatingSaving(false)
  }

  const filtered = customers.filter(c =>
    (c.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.customer_code || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Deactivation Modal */}
      {deactivatingId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-red-700 mb-2">Deactivate Customer</h3>
            <p className="text-sm text-gray-500 mb-4">Customer will be hidden from active lists. All history is preserved. Provide a mandatory reason.</p>
            {deactivationError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{deactivationError}</div>}
            <form onSubmit={handleDeactivate}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
<input type="text" required value={deactivationReason}
  onChange={e => setDeactivationReason(e.target.value)}
  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-2"
  placeholder="Describe reason for deactivation..." />
                <div className="flex justify-end gap-3 mt-4">
                <button type="button"
                  onClick={() => { setDeactivatingId(null); setDeactivationReason(''); ; setDeactivationError('') }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
                <button type="submit" disabled={deactivatingSaving}
                  className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-6 py-2 rounded-lg transition disabled:opacity-50">
                  {deactivatingSaving ? 'Deactivating...' : 'Confirm Deactivate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reactivation Modal */}
      {reactivatingId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-green-700 mb-2">Reactivate Customer</h3>
            <p className="text-sm text-gray-500 mb-4">Customer will be restored to active status. Provide a reason.</p>
            <form onSubmit={handleReactivate}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for reactivation</label>
              <input type="text" required value={reactivationReason}
                onChange={e => setReactivationReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 mb-2"
                placeholder="e.g. Customer returned, error correction..." />
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => { setReactivatingId(null); setReactivationReason('') }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
                <button type="submit" disabled={reactivatingSaving}
                  className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-6 py-2 rounded-lg transition disabled:opacity-50">
                  {reactivatingSaving ? 'Reactivating...' : 'Confirm Reactivate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Customers</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {customers.length} {filter === 'all' ? 'total' : filter === 'active' ? 'active' : 'inactive'} customers
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
              {['active', 'inactive', 'all'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-2 capitalize transition ${filter === f ? 'bg-yellow-500 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {f}
                </button>
              ))}
            </div>
          )}
          {!showForm && (
            <button onClick={openAddForm}
              className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
              + Add Customer
            </button>
          )}
        </div>
      </div>

      {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{success}</div>}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-700 mb-1">
            {editingId ? 'Edit Customer' : 'New Customer'}
            {editingId && <span className="ml-2 text-xs text-purple-600 font-normal">(Owner override — changes are audited)</span>}
          </h3>
          {!isOwner && !editingId && (
            <p className="text-xs text-gray-400 mb-4">Staff can create customers. Only owner can edit saved records.</p>
          )}
          {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

          {/* Duplicate warning */}
          {duplicateWarning.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm font-medium text-yellow-800 mb-2">⚠ Existing customers with this phone number:</p>
              {duplicateWarning.map(c => (
                <div key={c.id} className="text-xs text-yellow-700 mb-1">
                  <span className="font-mono">{c.customer_code}</span> — {c.full_name} — {c.address}
                </div>
              ))}
              <div className="mt-3 flex items-center gap-2">
                <input type="checkbox" id="proceed-anyway" checked={proceedDespiteDuplicate}
                  onChange={e => setProceedDespiteDuplicate(e.target.checked)}
                  className="accent-yellow-500" />
                <label htmlFor="proceed-anyway" className="text-xs text-yellow-800 cursor-pointer">
                  This is a different person — proceed with registration
                </label>
              </div>
            </div>
          )}
          {duplicateChecking && <p className="text-xs text-gray-400 mb-2">Checking for duplicates...</p>}

          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" required value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="Customer full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone (exactly 10 digits)</label>
              <input type="text" required maxLength={10} value={form.phone}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setForm({ ...form, phone: val })
                  setProceedDespiteDuplicate(false)
                  if (val.length === 10) checkDuplicates(val)
                  else setDuplicateWarning([])
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="10-digit number" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" required value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="Full address" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="Any remarks about this customer" />
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={cancelForm}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
              <button type="submit" disabled={saving}
                className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-6 py-2 rounded-lg transition disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Update Customer' : 'Save Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="p-4 border-b border-gray-100">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone or customer code..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No customers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Address</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  {isOwner && (
  <th className="px-4 py-3 text-left">Actions</th>
)}

                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-mono text-yellow-700">{c.customer_code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{c.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                    <td className="px-4 py-3 text-gray-600">{c.address}</td>
                    <td className="px-4 py-3 text-gray-400">{c.notes || '—'}</td>
                    <td className="px-4 py-3">
  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
    c.is_active
      ? 'bg-green-50 text-green-700'
      : 'bg-gray-100 text-gray-500'
  }`}>
    {c.is_active ? 'Active' : 'Inactive'}
  </span>
</td>
                   {isOwner && (
  <td className="px-4 py-3">
    <div className="flex gap-3">
      {c.is_active && (
        <button onClick={() => openEditForm(c)}
          className="text-yellow-600 hover:text-yellow-800 text-xs font-medium hover:underline">
          Edit
        </button>
      )}

      {c.is_active ? (
        <button onClick={() => {
          setDeactivatingId(c.id)
          setDeactivationReason('')
          setDeactivationError('')
        }}
          className="text-red-500 hover:text-red-700 text-xs font-medium hover:underline">
          Deactivate
        </button>
      ) : (
        <button onClick={() => {
          setReactivatingId(c.id)
          setReactivationReason('')
        }}
          className="text-green-600 hover:text-green-800 text-xs font-medium hover:underline">
          Reactivate
        </button>
      )}
    </div>
  </td>
)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}