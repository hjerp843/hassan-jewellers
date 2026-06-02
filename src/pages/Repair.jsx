import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const REPAIR_TYPES = [
  'Chain Repair', 'Lock Repair', 'Link Repair', 'Ring Sizing', 'Bangle Adjustment', 'Soldering',
  'Polishing', 'Cleaning', 'Buffing', 'Rhodium Coating', 'Matt Finish',
  'Stone Setting', 'Stone Replacement', 'Stone Tightening', 'Diamond Resetting',
  'Modification', 'Customization', 'Engraving', 'Remake', 'Other'
]

const STATUS_LABELS = {
  pending: 'Pending', assigned: 'Assigned', inprogress: 'In Progress',
  qualitycheck: 'Quality Check', readyfordelivery: 'Ready for Delivery',
  delivered: 'Delivered', cancelled: 'Cancelled'
}

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600', assigned: 'bg-blue-50 text-blue-700',
  inprogress: 'bg-yellow-50 text-yellow-700', qualitycheck: 'bg-purple-50 text-purple-700',
  readyfordelivery: 'bg-green-50 text-green-700', delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-50 text-red-500'
}

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-500', normal: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-50 text-orange-600', urgent: 'bg-red-50 text-red-600'
}

const PRIORITY_DOT = {
  low: 'bg-gray-400', normal: 'bg-blue-500', high: 'bg-orange-500', urgent: 'bg-red-500'
}

const ASSET_STATUS_MAP = {
  pending: 'repair_pending', assigned: 'repair_pending', inprogress: 'repair_inprogress',
  qualitycheck: 'repair_qualitycheck', readyfordelivery: 'repair_ready',
  delivered: 'returned'
}

const SLA_DAYS = { low: 10, normal: 7, high: 3, urgent: 1 }
const STATUS_FLOW = ['pending', 'assigned', 'inprogress', 'qualitycheck', 'readyfordelivery']

const NEXT_STATUS_LABEL = {
  pending: 'Assign Job', assigned: 'Start Work',
  inprogress: 'Send to QC', qualitycheck: 'Mark Ready'
}

export default function Repair() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const today = new Date().toISOString().split('T')[0]

  const queueRef = useRef(null)
  const activeRef = useRef(null)

  const [repairQueue, setRepairQueue] = useState([])
  const [purityQueue, setPurityQueue] = useState([])
  const [activeRepairs, setActiveRepairs] = useState([])
  const [completedRepairs, setCompletedRepairs] = useState([])
  const [vendors, setVendors] = useState([])
  const [allVendors, setAllVendors] = useState([])
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState({
    total: 0, pending: 0, inprogress: 0, readyForDelivery: 0,
    overdue: 0, vendorJobs: 0, urgent: 0, awaitingJob: 0, waitingPurity: 0
  })

  const [agingBuckets, setAgingBuckets] = useState({ a: 0, b: 0, c: 0, d: 0 })
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Create repair
  const [creatingForItem, setCreatingForItem] = useState(null)
  const [newRepair, setNewRepair] = useState({
    priority: 'normal', purity_test_required: false,
    expected_completion_date: '', promised_date: '', estimated_cost: ''
  })
  const [newTasks, setNewTasks] = useState([{
    repair_type: '', responsibility: 'inhouse', vendor_id: '', description: '',
    labour_cost: '', material_cost: '', vendor_cost: ''
  }])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // View repair
  const [viewingRepair, setViewingRepair] = useState(null)
  const [viewingTasks, setViewingTasks] = useState([])
  const [repairHistory, setRepairHistory] = useState([])
  const [customerHistory, setCustomerHistory] = useState([])
  const [statusError, setStatusError] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Edit repair
  const [editingRepair, setEditingRepair] = useState(null)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Additional cost
  const [addingCostFor, setAddingCostFor] = useState(null)
  const [additionalCost, setAdditionalCost] = useState('')
  const [additionalCostReason, setAdditionalCostReason] = useState('')
  const [addingCost, setAddingCost] = useState(false)

  // Deliver
  const [deliveringRepair, setDeliveringRepair] = useState(null)
  const [deliveryData, setDeliveryData] = useState({ amount_collected: '', payment_method: 'cash', delivery_notes: '' })
  const [delivering, setDelivering] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')

  // Cancel
  const [cancellingRepair, setCancellingRepair] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // Vendor management
  const [showVendors, setShowVendors] = useState(false)
  const [vendorTab, setVendorTab] = useState('active')
  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorSpecFilter, setVendorSpecFilter] = useState('all')
  const [showVendorStats, setShowVendorStats] = useState(false)
  const [vendorStats, setVendorStats] = useState([])
  const [newVendor, setNewVendor] = useState({ vendor_name: '', phone: '', alternate_phone: '', address: '', specialization: '', notes: '' })
  const [editingVendor, setEditingVendor] = useState(null)
  const [editVendorData, setEditVendorData] = useState({})
  const [deactivatingVendor, setDeactivatingVendor] = useState(null)
  const [deactivateReason, setDeactivateReason] = useState('')
  const [addingVendor, setAddingVendor] = useState(false)
  const [vendorError, setVendorError] = useState('')

  const [success, setSuccess] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchRepairQueue(), fetchRepairs(), fetchVendors()])
    setLoading(false)
  }

  async function fetchRepairQueue() {
    const { data: repairItems } = await supabase
      .from('intake_items')
      .select(`
        id, asset_code, ornament_type, gross_weight, net_weight, estimated_purity, status, created_at,
        intake_headers (visit_date, customers (id, full_name, customer_code, phone))
      `)
      .eq('disposition', 'repair')
      .not('status', 'in', '("repair_pending","repair_inprogress","repair_qualitycheck","repair_ready","repair_waiting_purity","returned","cancelled")')
      .order('created_at', { ascending: true })

    const { data: existingRepairs } = await supabase
      .from('repairs')
      .select('intake_item_id')
      .not('status', 'in', '("cancelled","delivered")')

    const activeRepairIds = new Set((existingRepairs || []).map(r => r.intake_item_id))
    const queue = (repairItems || []).filter(item => !activeRepairIds.has(item.id))
    setRepairQueue(queue)

    // Purity queue
    const { data: purityItems } = await supabase
      .from('intake_items')
      .select(`
        id, asset_code, ornament_type, net_weight, estimated_purity, status,
        intake_headers (visit_date, customers (full_name, customer_code, phone)),
        repairs (id, repair_code, status, purity_test_required)
      `)
      .eq('status', 'repair_waiting_purity')
    setPurityQueue(purityItems || [])

    // Fix: update summary with real counts
    setSummary(prev => ({
      ...prev,
      awaitingJob: queue.length,
      waitingPurity: (purityItems || []).length
    }))
  }

  async function fetchRepairs() {
    const { data } = await supabase
      .from('repairs')
      .select(`
        id, repair_code, status, original_asset_status, priority, purity_test_required, promised_date,
        estimated_cost, additional_cost, additional_cost_reason, final_cost,
        payment_received, repair_revenue, amount_collected, payment_method, profit,
        expected_completion_date, delivered_at, created_at, updated_at, delivery_notes,
        qc_repair_complete, qc_polish_complete, qc_stone_secure, qc_weight_verified, qc_customer_request_done,
        created_by_user:users!repairs_created_by_fkey(full_name),
        delivered_by_user:users!repairs_delivered_by_fkey(full_name),
        intake_items (id, asset_code, ornament_type, net_weight, estimated_purity, status,
          intake_headers (visit_date, customers (id, full_name, customer_code, phone))),
        repair_tasks (id, repair_type, responsibility, task_status, vendor_id,
          labour_cost, material_cost, vendor_cost, description, notes,
          vendor:vendors(vendor_name, specialization),
          assigned_user:users!repair_tasks_assigned_to_fkey(full_name))
      `)
      .not('status', 'in', '("delivered","cancelled")')
      .order('created_at', { ascending: false })

    const { data: completed } = await supabase
      .from('repairs')
      .select(`
        id, repair_code, status, priority, final_cost, amount_collected, payment_method,
        repair_revenue, profit, delivered_at, created_at, cancellation_reason,
        intake_items (asset_code, ornament_type, net_weight,
          intake_headers (customers (full_name, customer_code))),
        repair_tasks (repair_type, task_status, responsibility, vendor:vendors(vendor_name))
      `)
      .in('status', ['delivered', 'cancelled'])
      .order('updated_at', { ascending: false })
      .limit(30)

    if (data) {
      setActiveRepairs(data)
      const overdue = data.filter(r => r.expected_completion_date && r.expected_completion_date < today).length
      const vendorJobs = data.filter(r => r.repair_tasks?.some(t => t.responsibility === 'vendor')).length
      const buckets = { a: 0, b: 0, c: 0, d: 0 }
      data.forEach(r => {
        const d = daysSince(r.created_at)
        if (d <= 7) buckets.a++
        else if (d <= 15) buckets.b++
        else if (d <= 30) buckets.c++
        else buckets.d++
      })
      setAgingBuckets(buckets)
      setSummary(prev => ({
        ...prev,
        total: data.length,
        pending: data.filter(r => r.status === 'pending').length,
        inprogress: data.filter(r => r.status === 'inprogress').length,
        readyForDelivery: data.filter(r => r.status === 'readyfordelivery').length,
        overdue, vendorJobs,
        urgent: data.filter(r => r.priority === 'urgent').length,
      }))
    }
    if (completed) setCompletedRepairs(completed)
  }

  async function fetchVendors() {
    const { data } = await supabase.from('vendors').select('*').order('vendor_name')
    if (data) {
      setAllVendors(data)
      setVendors(data.filter(v => v.is_active))
    }
  }

  async function fetchRepairHistory(repairId) {
    const { data } = await supabase
      .from('audit_log')
      .select('field_name, old_value, new_value, changed_by_name, changed_at')
      .eq('table_name', 'repairs')
      .eq('record_id', repairId)
      .order('changed_at', { ascending: true })
    setRepairHistory(data || [])
  }

  async function fetchCustomerHistory(customerId, currentRepairId) {
    if (!customerId) { setCustomerHistory([]); return }
    // Fix: fetch all repairs and filter client-side by customer
    const { data: allActive } = await supabase
      .from('repairs')
      .select(`
        id, repair_code, status, final_cost, amount_collected, delivered_at, created_at,
        repair_tasks (repair_type),
        intake_items (intake_headers (customers (id, full_name)))
      `)
      .in('status', ['delivered', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(100)

    const filtered = (allActive || [])
      .filter(r => r.intake_items?.intake_headers?.customers?.id === customerId && r.id !== currentRepairId)
      .slice(0, 5)
    setCustomerHistory(filtered)
  }

  async function fetchVendorStats() {
    const { data } = await supabase
      .from('repair_tasks')
      .select(`id, task_status, vendor_cost, vendor_sent_date, vendor_actual_return, vendor_expected_return, vendor:vendors(id, vendor_name, specialization)`)
      .eq('responsibility', 'vendor')
    if (data) {
      const stats = {}
      data.forEach(task => {
        if (!task.vendor) return
        const vid = task.vendor.id
        if (!stats[vid]) stats[vid] = {
          id: vid, name: task.vendor.vendor_name, specialization: task.vendor.specialization,
          total: 0, completed: 0, cancelled: 0, active: 0, delayed: 0,
          totalCost: 0, totalDays: 0, completedWithDates: 0, lastJobDate: null
        }
        stats[vid].total++
        stats[vid].totalCost += parseFloat(task.vendor_cost) || 0
        if (task.task_status === 'completed') {
          stats[vid].completed++
          if (task.vendor_sent_date && task.vendor_actual_return) {
            const days = Math.floor((new Date(task.vendor_actual_return) - new Date(task.vendor_sent_date)) / (1000 * 60 * 60 * 24))
            stats[vid].totalDays += days
            stats[vid].completedWithDates++
          }
          // Fix: use Date objects for comparison
          if (task.vendor_expected_return && task.vendor_actual_return &&
            new Date(task.vendor_actual_return) > new Date(task.vendor_expected_return)) {
            stats[vid].delayed++
          }
          if (!stats[vid].lastJobDate || task.vendor_actual_return > stats[vid].lastJobDate) stats[vid].lastJobDate = task.vendor_actual_return
        } else if (task.task_status === 'cancelled') {
          stats[vid].cancelled++
        } else {
          stats[vid].active++
        }
      })
      setVendorStats(Object.values(stats))
    }
  }

  function daysSince(dateStr) {
    if (!dateStr) return 0
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24))
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null
    return Math.floor((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
  }

  function isOverdue(repair) {
    return repair.expected_completion_date && repair.expected_completion_date < today &&
      !['delivered', 'cancelled'].includes(repair.status)
  }

  function calcFinalCost(repair) {
    return parseFloat(((parseFloat(repair?.estimated_cost) || 0) + (parseFloat(repair?.additional_cost) || 0)).toFixed(2))
  }

  function qcAllPassed(repair) {
    return repair?.qc_repair_complete && repair?.qc_polish_complete &&
      repair?.qc_stone_secure && repair?.qc_weight_verified && repair?.qc_customer_request_done
  }

  function nextStatus(current) {
    const idx = STATUS_FLOW.indexOf(current)
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return null
    return STATUS_FLOW[idx + 1]
  }

  function autoExpectedDate(priority) {
    const d = new Date()
    d.setDate(d.getDate() + (SLA_DAYS[priority] || 7))
    return d.toISOString().split('T')[0]
  }

  function validatePhone(p) { return /^[0-9]{10}$/.test(p) }

  async function handleCreateRepair() {
    if (creating) return
    const validTasks = newTasks.filter(t => t.repair_type)
    if (validTasks.length === 0) { setCreateError('Add at least one repair task'); return }
    setCreating(true); setCreateError('')

    const expectedDate = newRepair.expected_completion_date || autoExpectedDate(newRepair.priority)

    const { data: repair, error } = await supabase.from('repairs').insert({
  intake_item_id: creatingForItem.id,
  original_asset_status: creatingForItem.status,
  priority: newRepair.priority,
      purity_test_required: newRepair.purity_test_required,
      expected_completion_date: expectedDate,
      promised_date: newRepair.promised_date || null,
      estimated_cost: parseFloat(newRepair.estimated_cost) || 0,
      final_cost: parseFloat(newRepair.estimated_cost) || 0,
      created_by: profile.id, updated_at: new Date().toISOString()
    }).select().single()

    if (error) { setCreateError(error.message); setCreating(false); return }

    await supabase.from('repair_tasks').insert(validTasks.map(t => ({
      repair_id: repair.id, repair_type: t.repair_type,
      responsibility: t.responsibility,
      vendor_id: t.responsibility === 'vendor' && t.vendor_id ? t.vendor_id : null,
      description: t.description || null,
      labour_cost: parseFloat(t.labour_cost) || 0,
      material_cost: parseFloat(t.material_cost) || 0,
      vendor_cost: parseFloat(t.vendor_cost) || 0
    })))
await supabase.from('intake_items')
  .update({
    status: 'repair_pending',
    updated_at: new Date().toISOString()
  })
  .eq('id', creatingForItem.id)

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'repairs', record_id: repair.id, field_name: 'repair_created',
      old_value: null,
      new_value: JSON.stringify({
        repair_code: repair.repair_code, asset_code: creatingForItem.asset_code,
        priority: newRepair.priority, expected: expectedDate,
        tasks: validTasks.map(t => t.repair_type).join(', '), created_by: profile.full_name
      })
    })

    setCreatingForItem(null)
    setNewRepair({ priority: 'normal', purity_test_required: false, expected_completion_date: '', promised_date: '', estimated_cost: '' })
    setNewTasks([{ repair_type: '', responsibility: 'inhouse', vendor_id: '', description: '', labour_cost: '', material_cost: '', vendor_cost: '' }])
    setSuccess(`✓ ${repair.repair_code} created`)
    setTimeout(() => setSuccess(''), 5000)
    await fetchAll()
    setCreating(false)
  }

  async function handleStatusUpdate(repair, toStatus) {
    setStatusError('')

    // Validation: assigned requires at least 1 task
    if (toStatus === 'assigned') {
      const tasks = repair.repair_tasks || viewingTasks
      if (tasks.length === 0) { setStatusError('Add at least one repair task before assigning'); return }
    }

    // Validation: qualitycheck requires all tasks completed
    if (toStatus === 'qualitycheck') {
      const tasks = viewingTasks.length > 0 ? viewingTasks : (repair.repair_tasks || [])
      const incomplete = tasks.filter(t => t.task_status !== 'completed' && t.task_status !== 'cancelled')
      if (incomplete.length > 0) {
        setStatusError(`Complete all repair tasks first (${incomplete.length} pending)`)
        return
      }
    }

    // Validation: readyfordelivery requires QC
    if (toStatus === 'readyfordelivery' && !qcAllPassed(viewingRepair || repair)) {
      setStatusError('Complete all QC checks before marking Ready for Delivery')
      return
    }

    setUpdatingStatus(true)

    // Fix: purity_test_required — go to waiting_purity instead of ready
    let actualRepairStatus = toStatus
    let actualAssetStatus = ASSET_STATUS_MAP[toStatus]

    if (toStatus === 'readyfordelivery' && repair.purity_test_required) {
      actualAssetStatus = 'repair_waiting_purity'
      // Keep repair status as qualitycheck but update asset
      await supabase.from('intake_items')
        .update({ status: 'repair_waiting_purity', updated_at: new Date().toISOString() })
        .eq('id', repair.intake_items?.id)
      await supabase.from('audit_log').insert({
        changed_by: profile.id, changed_by_name: profile.full_name,
        table_name: 'repairs', record_id: repair.id, field_name: 'status_changed',
        old_value: repair.status,
        new_value: JSON.stringify({ repair_status: 'readyfordelivery', asset_status: 'repair_waiting_purity', note: 'purity test required', changed_by: profile.full_name })
      })
    } else {
      if (actualAssetStatus) {
        await supabase.from('intake_items')
          .update({ status: actualAssetStatus, updated_at: new Date().toISOString() })
          .eq('id', repair.intake_items?.id)
      }
      await supabase.from('audit_log').insert({
        changed_by: profile.id, changed_by_name: profile.full_name,
        table_name: 'repairs', record_id: repair.id, field_name: 'status_changed',
        old_value: repair.status,
        new_value: JSON.stringify({ repair_status: toStatus, asset_status: actualAssetStatus, changed_by: profile.full_name, at: new Date().toISOString() })
      })
    }

    await supabase.from('repairs').update({
      status: actualRepairStatus, updated_at: new Date().toISOString(), updated_by: profile.id
    }).eq('id', repair.id)

    setViewingRepair(null)
    await fetchRepairs(); await fetchRepairQueue()
    setUpdatingStatus(false)
  }

  async function handleQcUpdate(field, value) {
    if (!viewingRepair) return
    await supabase.from('repairs').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', viewingRepair.id)
    setViewingRepair(prev => ({ ...prev, [field]: value }))
    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'repairs', record_id: viewingRepair.id,
      field_name: field, old_value: String(!value), new_value: String(value)
    })
  }

  async function handleTaskStatusUpdate(taskId, newTaskStatus) {
    const old = viewingTasks.find(t => t.id === taskId)?.task_status
    await supabase.from('repair_tasks').update({ task_status: newTaskStatus, updated_at: new Date().toISOString() }).eq('id', taskId)
    setViewingTasks(prev => prev.map(t => t.id === taskId ? { ...t, task_status: newTaskStatus } : t))
    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'repair_tasks', record_id: taskId,
      field_name: 'task_status_changed', old_value: old, new_value: newTaskStatus
    })
  }

  async function handleSaveEdit() {
    setSaving(true); setEditError('')
    await supabase.from('repairs').update({
      priority: editData.priority,
      expected_completion_date: editData.expected_completion_date || null,
      promised_date: editData.promised_date || null,
      estimated_cost: parseFloat(editData.estimated_cost) || 0,
      final_cost: (parseFloat(editData.estimated_cost) || 0) + (parseFloat(editingRepair.additional_cost) || 0),
      purity_test_required: editData.purity_test_required,
      updated_at: new Date().toISOString(), updated_by: profile.id
    }).eq('id', editingRepair.id)

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'repairs', record_id: editingRepair.id,
      field_name: 'repair_edited',
      old_value: JSON.stringify({ priority: editingRepair.priority, expected: editingRepair.expected_completion_date }),
      new_value: JSON.stringify({ priority: editData.priority, expected: editData.expected_completion_date, edited_by: profile.full_name })
    })

    setEditingRepair(null)
    setSuccess('✓ Repair updated')
    setTimeout(() => setSuccess(''), 4000)
    await fetchRepairs()
    setSaving(false)
  }

  async function handleAddCost() {
    const cost = parseFloat(additionalCost)
    if (!cost || cost <= 0 || !additionalCostReason.trim()) return
    setAddingCost(true)
    const repair = activeRepairs.find(r => r.id === addingCostFor)
    const newAdditional = (parseFloat(repair.additional_cost) || 0) + cost
    const newFinal = (parseFloat(repair.estimated_cost) || 0) + newAdditional
    await supabase.from('repairs').update({
      additional_cost: newAdditional, additional_cost_reason: additionalCostReason.trim(),
      final_cost: newFinal, updated_at: new Date().toISOString()
    }).eq('id', addingCostFor)
    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'repairs', record_id: addingCostFor, field_name: 'additional_cost_added',
      old_value: String(repair.additional_cost || 0),
      new_value: JSON.stringify({ amount: cost, reason: additionalCostReason, new_total: newFinal })
    })
    setAddingCostFor(null); setAdditionalCost(''); setAdditionalCostReason('')
    await fetchRepairs()
    setAddingCost(false)
  }

  async function handleDeliver() {
    const amount = parseFloat(deliveryData.amount_collected)
    if (isNaN(amount) || amount < 0) { setDeliveryError('Enter a valid amount'); return }
    if (!deliveryData.payment_method) { setDeliveryError('Select payment method'); return }
    setDelivering(true); setDeliveryError('')

    const repair = activeRepairs.find(r => r.id === deliveringRepair)
    const totalVendorCost = repair.repair_tasks?.reduce((s, t) => s + (parseFloat(t.vendor_cost) || 0), 0) || 0
    const totalMaterialCost = repair.repair_tasks?.reduce((s, t) => s + (parseFloat(t.material_cost) || 0), 0) || 0
    const profit = parseFloat((amount - totalVendorCost - totalMaterialCost).toFixed(2))

    await supabase.from('repairs').update({
      status: 'delivered', delivered_at: new Date().toISOString(), delivered_by: profile.id,
      amount_collected: amount, payment_method: deliveryData.payment_method,
      delivery_notes: deliveryData.delivery_notes || null, payment_received: true,
      repair_revenue: amount, profit, updated_at: new Date().toISOString()
    }).eq('id', deliveringRepair)

    await supabase.from('intake_items')
      .update({ status: 'returned', updated_at: new Date().toISOString() })
      .eq('id', repair.intake_items?.id)

    await supabase.from('audit_log').insert({
      changed_by: profile.id, changed_by_name: profile.full_name,
      table_name: 'repairs', record_id: deliveringRepair, field_name: 'repair_delivered',
      old_value: JSON.stringify({ status: 'readyfordelivery', final_cost: calcFinalCost(repair) }),
      new_value: JSON.stringify({ amount_collected: amount, payment_method: deliveryData.payment_method, profit, delivered_by: profile.full_name, asset_status: 'returned', delivered_at: new Date().toISOString() })
    })

    setDeliveringRepair(null)
    setDeliveryData({ amount_collected: '', payment_method: 'cash', delivery_notes: '' })
    setSuccess(`✓ Delivered — ₹${amount} collected · Profit: ₹${profit}`)
    setTimeout(() => setSuccess(''), 6000)
    await fetchAll()
    setDelivering(false)
  }

  async function handleCancel() {
    const reason = cancelReason.trim()
    if (!reason) { setCancelError('Reason is required'); return }
    setCancelling(true); setCancelError('')

 const repair = activeRepairs.find(r => r.id === cancellingRepair)
const revertTo = repair?.original_asset_status || 'tested'

await supabase.from('repairs').update({
  status: 'cancelled', cancellation_reason: reason,
  cancelled_by: profile.id, cancelled_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}).eq('id', cancellingRepair)

await supabase.from('intake_items')
  .update({ status: revertTo, updated_at: new Date().toISOString() })
  .eq('id', repair?.intake_items?.id)

await supabase.from('audit_log').insert({
  changed_by: profile.id, changed_by_name: profile.full_name,
  table_name: 'repairs', record_id: cancellingRepair, field_name: 'repair_cancelled',
  old_value: repair?.status,
  new_value: JSON.stringify({ reason, cancelled_by: profile.full_name, asset_reverted_to: revertTo })
})

    setCancellingRepair(null); setCancelReason('')
    await fetchAll()
    setCancelling(false)
  }

  async function handleAddVendor() {
    if (!newVendor.vendor_name.trim()) { setVendorError('Vendor name required'); return }
    if (newVendor.phone && !validatePhone(newVendor.phone)) { setVendorError('Phone must be exactly 10 digits'); return }
    if (newVendor.alternate_phone && !validatePhone(newVendor.alternate_phone)) { setVendorError('Alternate phone must be exactly 10 digits'); return }
    setAddingVendor(true); setVendorError('')
    const { error } = await supabase.from('vendors').insert({ ...newVendor, created_by: profile.id })
    if (error) { setVendorError(error.message); setAddingVendor(false); return }
    setNewVendor({ vendor_name: '', phone: '', alternate_phone: '', address: '', specialization: '', notes: '' })
    await fetchVendors()
    setAddingVendor(false)
  }

  async function handleSaveVendorEdit() {
    if (editVendorData.phone && !validatePhone(editVendorData.phone)) { setVendorError('Phone must be 10 digits'); return }
    if (editVendorData.alternate_phone && !validatePhone(editVendorData.alternate_phone)) { setVendorError('Alternate phone must be 10 digits'); return }
    setVendorError('')
    await supabase.from('vendors').update({ ...editVendorData, updated_at: new Date().toISOString() }).eq('id', editingVendor)
    setEditingVendor(null); setEditVendorData({})
    await fetchVendors()
  }

  async function handleDeactivateVendor() {
    if (!deactivateReason.trim()) return
    await supabase.from('vendors').update({
      is_active: false, notes: `Deactivated: ${deactivateReason}`, updated_at: new Date().toISOString()
    }).eq('id', deactivatingVendor)
    setDeactivatingVendor(null); setDeactivateReason('')
    await fetchVendors()
  }

  async function handleReactivateVendor(id) {
    await supabase.from('vendors').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', id)
    await fetchVendors()
  }

  const filteredRepairs = activeRepairs.filter(repair => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      (repair.repair_code || '').toLowerCase().includes(q) ||
      (repair.intake_items?.asset_code || '').toLowerCase().includes(q) ||
      (repair.intake_items?.intake_headers?.customers?.full_name || '').toLowerCase().includes(q) ||
      (repair.intake_items?.intake_headers?.customers?.phone || '').toLowerCase().includes(q) ||
      repair.repair_tasks?.some(t => (t.repair_type || '').toLowerCase().includes(q))
    const matchesStatus = statusFilter === 'all' || repair.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const vendorAlerts = activeRepairs.filter(r =>
    r.repair_tasks?.some(t => t.responsibility === 'vendor' && t.vendor_expected_return && t.vendor_expected_return < today && t.task_status !== 'completed')
  )
  const overdueRepairs = activeRepairs.filter(r => isOverdue(r))
  const readyRepairs = activeRepairs.filter(r => r.status === 'readyfordelivery')
  const totalRevenue = completedRepairs.filter(r => r.status === 'delivered').reduce((s, r) => s + (parseFloat(r.repair_revenue) || 0), 0)
  const totalProfit = completedRepairs.filter(r => r.status === 'delivered').reduce((s, r) => s + (parseFloat(r.profit) || 0), 0)

  const filteredVendors = allVendors.filter(v => {
    const matchesTab = vendorTab === 'active' ? v.is_active : !v.is_active
    const matchesSearch = !vendorSearch || v.vendor_name.toLowerCase().includes(vendorSearch.toLowerCase()) || (v.specialization || '').toLowerCase().includes(vendorSearch.toLowerCase())
    const matchesSpec = vendorSpecFilter === 'all' || v.specialization === vendorSpecFilter
    return matchesTab && matchesSearch && matchesSpec
  })

  const vendorSpecializations = [...new Set(allVendors.map(v => v.specialization).filter(Boolean))]

  function formatHistoryEntry(entry) {
    const time = new Date(entry.changed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    const fieldMap = {
      repair_created: 'Repair Created',
      repair_edited: 'Repair Edited',
      repair_delivered: 'Repair Delivered',
      repair_cancelled: 'Repair Cancelled',
      additional_cost_added: 'Additional Cost Added',
      task_status_changed: `Task → ${entry.new_value}`,
      status_changed: (() => {
        try { const v = JSON.parse(entry.new_value); return `Status → ${STATUS_LABELS[v.repair_status] || v.repair_status}` }
        catch { return `Status → ${entry.new_value}` }
      })(),
      qc_repair_complete: entry.new_value === 'true' ? '✓ QC: Repair Complete' : '✗ QC: Repair Unchecked',
      qc_polish_complete: entry.new_value === 'true' ? '✓ QC: Polish Complete' : '✗ QC: Polish Unchecked',
      qc_stone_secure: entry.new_value === 'true' ? '✓ QC: Stones Secure' : '✗ QC: Stones Unchecked',
      qc_weight_verified: entry.new_value === 'true' ? '✓ QC: Weight Verified' : '✗ QC: Weight Unchecked',
      qc_customer_request_done: entry.new_value === 'true' ? '✓ QC: Customer Request Done' : '✗ QC: Request Unchecked',
    }
    return { time, label: fieldMap[entry.field_name] || entry.field_name, by: entry.changed_by_name }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Repair</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track and manage all repair jobs</p>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <>
              <button onClick={() => { fetchVendorStats(); setShowVendorStats(true) }}
                className="text-xs text-purple-600 border border-purple-200 rounded-lg px-3 py-1.5 hover:bg-purple-50">Vendor Analytics</button>
              <button onClick={() => setShowVendors(true)}
                className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Manage Vendors</button>
            </>
          )}
          <button onClick={fetchAll} className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">↻ Refresh</button>
        </div>
      </div>

      {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{success}</div>}

      {/* Alerts */}
      {(overdueRepairs.length > 0 || vendorAlerts.length > 0 || readyRepairs.length > 0) && (
        <div className="bg-white border border-orange-200 rounded-xl p-4 mb-4 space-y-2">
          {overdueRepairs.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-red-600 font-semibold">🔴 Critical — {overdueRepairs.length} repair{overdueRepairs.length > 1 ? 's' : ''} overdue</p>
              <button onClick={() => { setStatusFilter('all'); activeRef.current?.scrollIntoView({ behavior: 'smooth' }) }} className="text-xs text-red-500 hover:underline">View →</button>
            </div>
          )}
          {vendorAlerts.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-orange-600 font-semibold">🟠 Warning — {vendorAlerts.length} vendor return{vendorAlerts.length > 1 ? 's' : ''} overdue</p>
              <button onClick={() => activeRef.current?.scrollIntoView({ behavior: 'smooth' })} className="text-xs text-orange-500 hover:underline">View →</button>
            </div>
          )}
          {readyRepairs.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-green-600 font-semibold">🟢 Info — {readyRepairs.length} repair{readyRepairs.length > 1 ? 's' : ''} ready for delivery</p>
              <button onClick={() => { setStatusFilter('readyfordelivery'); activeRef.current?.scrollIntoView({ behavior: 'smooth' }) }} className="text-xs text-green-500 hover:underline">View →</button>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Active Repairs', value: summary.total, color: 'text-gray-800', action: () => { setStatusFilter('all'); activeRef.current?.scrollIntoView({ behavior: 'smooth' }) } },
          { label: 'Pending', value: summary.pending, color: 'text-gray-500', action: () => { setStatusFilter('pending'); activeRef.current?.scrollIntoView({ behavior: 'smooth' }) } },
          { label: 'In Progress', value: summary.inprogress, color: 'text-yellow-600', action: () => { setStatusFilter('inprogress'); activeRef.current?.scrollIntoView({ behavior: 'smooth' }) } },
          { label: 'Ready for Delivery', value: summary.readyForDelivery, color: 'text-green-600', action: () => { setStatusFilter('readyfordelivery'); activeRef.current?.scrollIntoView({ behavior: 'smooth' }) } },
          { label: 'Overdue', value: summary.overdue, color: 'text-red-600', action: () => activeRef.current?.scrollIntoView({ behavior: 'smooth' }) },
          { label: 'Urgent', value: summary.urgent, color: 'text-orange-600', action: () => activeRef.current?.scrollIntoView({ behavior: 'smooth' }) },
          { label: 'Vendor Jobs', value: summary.vendorJobs, color: 'text-purple-600', action: null },
          { label: 'Awaiting Job', value: summary.awaitingJob, color: 'text-blue-600', action: () => queueRef.current?.scrollIntoView({ behavior: 'smooth' }) },
        ].map((card, i) => (
          <div key={i} onClick={card.action || undefined}
            className={`bg-white border border-gray-200 rounded-xl p-4 ${card.action ? 'cursor-pointer hover:shadow-md hover:border-yellow-300 transition' : ''}`}>
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue — owner only */}
      {isOwner && completedRepairs.filter(r => r.status === 'delivered').length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Repair Revenue</p>
            <p className="text-2xl font-bold text-green-600">₹{totalRevenue.toFixed(0)}</p>
            <p className="text-xs text-gray-400">{completedRepairs.filter(r => r.status === 'delivered').length} deliveries</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Profit</p>
            <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{totalProfit.toFixed(0)}</p>
            <p className="text-xs text-gray-400">after vendor + material costs</p>
          </div>
        </div>
      )}

      {/* Aging */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Repair Aging</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '0–7 days', count: agingBuckets.a, bg: 'bg-gray-50', text: 'text-gray-600', sub: 'on track' },
            { label: '8–15 days', count: agingBuckets.b, bg: 'bg-yellow-50', text: 'text-yellow-600', sub: 'monitor' },
            { label: '16–30 days', count: agingBuckets.c, bg: 'bg-orange-50', text: 'text-orange-600', sub: 'attention' },
            { label: '30+ days', count: agingBuckets.d, bg: 'bg-red-50', text: 'text-red-600', sub: 'critical' },
          ].map(b => (
            <div key={b.label} className={`${b.bg} rounded-lg p-3 text-center`}>
              <p className="text-xs text-gray-500">{b.label}</p>
              <p className={`text-xl font-bold ${b.text}`}>{b.count}</p>
              <p className={`text-xs ${b.text}`}>{b.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Purity Queue */}
      {purityQueue.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-blue-100">
            <h3 className="text-sm font-semibold text-blue-700">⚗ Awaiting Purity Test After Repair ({purityQueue.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-100 text-blue-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Asset</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Ornament</th>
                  <th className="px-4 py-2 text-left">Repair Job</th>
                  <th className="px-4 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {purityQueue.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50">
                    <td className="px-4 py-2 font-mono text-yellow-700 text-xs">{item.asset_code}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{item.intake_headers?.customers?.full_name}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">{item.ornament_type} · {item.net_weight}g</td>
                    <td className="px-4 py-2 text-xs font-mono text-blue-700">{item.repairs?.[0]?.repair_code}</td>
                    <td className="px-4 py-2 text-xs text-blue-600">Go to Purity Test to process</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Repair Queue — table */}
      <div ref={queueRef} className="bg-white border border-blue-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-blue-100 bg-blue-50">
          <h3 className="text-sm font-semibold text-blue-700">Repair Queue — Awaiting Job Creation ({repairQueue.length})</h3>
        </div>
        {repairQueue.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">No items awaiting repair job</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Asset</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Ornament</th>
                  <th className="px-4 py-3 text-left">Net</th>
                  <th className="px-4 py-3 text-left">Est. Purity</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Days in Shop</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {repairQueue.map(item => {
                  const days = daysSince(item.intake_headers?.visit_date)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-yellow-700 text-xs">{item.asset_code}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{item.intake_headers?.customers?.full_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{item.intake_headers?.customers?.phone}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{item.ornament_type}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{item.net_weight}g</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{item.estimated_purity}%</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-xs">{item.status}</span>
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium ${days <= 7 ? 'text-gray-400' : days <= 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {days === 0 ? 'Today' : `${days}d`}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setCreatingForItem(item)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Create Job</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Repairs */}
      <div ref={activeRef} className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-700">Active Repairs ({filteredRepairs.length})</h3>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400">
              <option value="all">All Status</option>
              {Object.entries(STATUS_LABELS).filter(([k]) => !['delivered', 'cancelled'].includes(k)).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by repair code, asset, customer, phone, repair type..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
        ) : filteredRepairs.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No active repairs</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Repair</th>
                  <th className="px-4 py-3 text-left">Asset</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Tasks</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Due</th>
                  <th className="px-4 py-3 text-left">Days</th>
                  <th className="px-4 py-3 text-left">Cost</th>
                  <th className="px-4 py-3 text-left">By</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRepairs.map(repair => {
                  const daysOpen = daysSince(repair.created_at)
                  const overdue = isOverdue(repair)
                  const daysLeft = daysUntil(repair.expected_completion_date)
                  const next = nextStatus(repair.status)
                  return (
                    <tr key={repair.id} className={`hover:bg-gray-50 ${overdue ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-yellow-700 text-xs font-medium">{repair.repair_code}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono text-yellow-700">{repair.intake_items?.asset_code}</div>
                        <div className="text-gray-500">{repair.intake_items?.ornament_type}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-gray-700">{repair.intake_items?.intake_headers?.customers?.full_name}</div>
                        <div className="text-gray-400">{repair.intake_items?.intake_headers?.customers?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-36">
                        {repair.repair_tasks?.map((t, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.task_status === 'completed' ? 'bg-green-500' : t.task_status === 'inprogress' ? 'bg-yellow-500' : 'bg-gray-300'}`} />
                            <span className={`truncate ${t.task_status === 'completed' ? 'line-through text-gray-400' : 'text-gray-600'}`}>{t.repair_type}</span>
                            {t.responsibility === 'vendor' && <span className="text-purple-500">V</span>}
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit ${PRIORITY_COLORS[repair.priority]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[repair.priority]}`} />
                          {repair.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[repair.status]}`}>{STATUS_LABELS[repair.status]}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {repair.expected_completion_date ? (
                          <div>
                            <span className={overdue ? 'text-red-600 font-bold' : daysLeft !== null && daysLeft <= 1 ? 'text-orange-600' : 'text-gray-500'}>
                              {repair.expected_completion_date}
                            </span>
                            {overdue && <div className="text-red-500 text-xs">{Math.abs(daysLeft ?? 0)}d late</div>}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium ${daysOpen <= 7 ? 'text-gray-400' : daysOpen <= 30 ? 'text-yellow-600' : 'text-red-600'}`}>{daysOpen}d</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-gray-700">₹{calcFinalCost(repair)}</div>
                        {repair.additional_cost > 0 && <div className="text-orange-500">+₹{repair.additional_cost}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{repair.created_by_user?.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <button onClick={() => {
                            setViewingRepair(repair); setViewingTasks(repair.repair_tasks || [])
                            setStatusError(''); fetchRepairHistory(repair.id)
                            fetchCustomerHistory(repair.intake_items?.intake_headers?.customers?.id, repair.id)
                          }} className="text-xs text-yellow-600 hover:text-yellow-800 font-medium hover:underline">View</button>
                          <button onClick={() => {
                            setEditingRepair(repair)
                            setEditData({
                              priority: repair.priority,
                              expected_completion_date: repair.expected_completion_date || '',
                              promised_date: repair.promised_date || '',
                              estimated_cost: repair.estimated_cost || '',
                              purity_test_required: repair.purity_test_required || false
                            })
                            setEditError('')
                          }} className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline">Edit</button>
                          {next && repair.status !== 'qualitycheck' && (
                            <button onClick={() => handleStatusUpdate(repair, next)}
                              className="text-xs text-green-600 hover:text-green-800 font-medium hover:underline whitespace-nowrap">
                              {NEXT_STATUS_LABEL[repair.status]}
                            </button>
                          )}
                          {repair.status === 'readyfordelivery' && (
                            <button onClick={() => setDeliveringRepair(repair.id)}
                              className="text-xs text-green-600 hover:text-green-800 font-medium hover:underline">Deliver</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Completed Repairs */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-700">Completed & Cancelled ({completedRepairs.length})</h3>
        </div>
        {completedRepairs.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No completed repairs yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Repair</th>
                  <th className="px-4 py-3 text-left">Asset</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Tasks</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Final Cost</th>
                  <th className="px-4 py-3 text-left">Collected</th>
                  <th className="px-4 py-3 text-left">Profit</th>
                  <th className="px-4 py-3 text-left">Payment</th>
                  <th className="px-4 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {completedRepairs.map(repair => (
                  <tr key={repair.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-yellow-700 text-xs">{repair.repair_code}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono text-yellow-700">{repair.intake_items?.asset_code}</div>
                      <div className="text-gray-500">{repair.intake_items?.ornament_type}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-gray-700">{repair.intake_items?.intake_headers?.customers?.full_name}</div>
                      <div className="text-gray-400">{repair.intake_items?.intake_headers?.customers?.customer_code}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {repair.repair_tasks?.map((t, i) => <span key={i} className="mr-1">{t.repair_type}{t.responsibility === 'vendor' ? ' V' : ''}</span>)}
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[repair.status]}`}>{STATUS_LABELS[repair.status]}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-700">₹{repair.final_cost || 0}</td>
                    <td className="px-4 py-3 text-xs text-green-700 font-medium">{repair.amount_collected ? `₹${repair.amount_collected}` : '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {repair.profit != null ? <span className={repair.profit >= 0 ? 'text-green-600 font-medium' : 'text-red-500'}>₹{repair.profit}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{repair.payment_method || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{(repair.delivered_at || repair.created_at)?.split('T')[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Vendor Analytics */}
      {showVendorStats && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">Vendor Analytics</h3>
              <button onClick={() => setShowVendorStats(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {vendorStats.length === 0 ? <p className="text-sm text-gray-400">No vendor data yet</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Vendor</th>
                      <th className="px-3 py-2 text-left">Jobs</th>
                      <th className="px-3 py-2 text-left">Done</th>
                      <th className="px-3 py-2 text-left">Active</th>
                      <th className="px-3 py-2 text-left">Cancelled</th>
                      <th className="px-3 py-2 text-left">Avg Days</th>
                      <th className="px-3 py-2 text-left">Late</th>
                      <th className="px-3 py-2 text-left">On Time %</th>
                      <th className="px-3 py-2 text-left">Total Cost</th>
                      <th className="px-3 py-2 text-left">Last Job</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vendorStats.map(v => {
                      const onTimePct = v.completed > 0 ? Math.round(((v.completed - v.delayed) / v.completed) * 100) : 0
                      return (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800 text-xs">{v.name}</div>
                            <div className="text-gray-400 text-xs">{v.specialization}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">{v.total}</td>
                          <td className="px-3 py-2 text-xs text-green-600">{v.completed}</td>
                          <td className="px-3 py-2 text-xs text-yellow-600">{v.active}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{v.cancelled}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{v.completedWithDates > 0 ? `${Math.round(v.totalDays / v.completedWithDates)}d` : '—'}</td>
                          <td className="px-3 py-2 text-xs text-red-500">{v.delayed}</td>
                          <td className="px-3 py-2 text-xs"><span className={`font-medium ${onTimePct >= 90 ? 'text-green-600' : onTimePct >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>{v.completed > 0 ? `${onTimePct}%` : '—'}</span></td>
                          <td className="px-3 py-2 text-xs text-purple-600">₹{v.totalCost.toFixed(0)}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{v.lastJobDate || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => setShowVendorStats(false)} className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg">Close</button>
          </div>
        </div>
      )}

      {/* Vendor Management */}
      {showVendors && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">Vendor Management</h3>
              <button onClick={() => { setShowVendors(false); setEditingVendor(null); setDeactivatingVendor(null) }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {deactivatingVendor && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-red-700 mb-2">Reason for deactivation *</p>
                <input type="text" value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)}
                  className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none mb-2" placeholder="Reason..." autoFocus />
                <div className="flex gap-2">
                  <button onClick={handleDeactivateVendor} disabled={!deactivateReason.trim()}
                    className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg disabled:opacity-50">Confirm</button>
                  <button onClick={() => { setDeactivatingVendor(null); setDeactivateReason('') }} className="text-xs text-gray-500 hover:bg-gray-100 px-4 py-1.5 rounded-lg">Cancel</button>
                </div>
              </div>
            )}

            {editingVendor && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-blue-700 mb-3">Edit Vendor</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={editVendorData.vendor_name || ''} onChange={e => setEditVendorData(p => ({ ...p, vendor_name: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Vendor name..." />
                  <input type="text" value={editVendorData.specialization || ''} onChange={e => setEditVendorData(p => ({ ...p, specialization: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Specialization..." />
                  <input type="text" maxLength={10} value={editVendorData.phone || ''} onChange={e => setEditVendorData(p => ({ ...p, phone: e.target.value.replace(/\D/g, '') }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Phone (10 digits)..." />
                  <input type="text" maxLength={10} value={editVendorData.alternate_phone || ''} onChange={e => setEditVendorData(p => ({ ...p, alternate_phone: e.target.value.replace(/\D/g, '') }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Alternate phone..." />
                  <input type="text" value={editVendorData.address || ''} onChange={e => setEditVendorData(p => ({ ...p, address: e.target.value }))}
                    className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Address..." />
                </div>
                {vendorError && <div className="text-xs text-red-600 mt-1">{vendorError}</div>}
                <div className="flex gap-2 mt-2">
                  <button onClick={handleSaveVendorEdit} className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg">Save</button>
                  <button onClick={() => { setEditingVendor(null); setEditVendorData({}); setVendorError('') }} className="text-xs text-gray-500 hover:bg-gray-100 px-4 py-1.5 rounded-lg">Cancel</button>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">Add New Vendor</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Vendor Name *</label>
                  <input type="text" value={newVendor.vendor_name} onChange={e => setNewVendor(p => ({ ...p, vendor_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Vendor name..." />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Specialization</label>
                  <input type="text" value={newVendor.specialization} onChange={e => setNewVendor(p => ({ ...p, specialization: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="e.g. Stone Setting..." />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone (10 digits)</label>
                  <input type="text" maxLength={10} value={newVendor.phone} onChange={e => setNewVendor(p => ({ ...p, phone: e.target.value.replace(/\D/g, '') }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="10-digit phone..." />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Alternate Phone</label>
                  <input type="text" maxLength={10} value={newVendor.alternate_phone} onChange={e => setNewVendor(p => ({ ...p, alternate_phone: e.target.value.replace(/\D/g, '') }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Alternate..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Address</label>
                  <input type="text" value={newVendor.address} onChange={e => setNewVendor(p => ({ ...p, address: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Address..." />
                </div>
              </div>
              {vendorError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mt-2">{vendorError}</div>}
              <button disabled={addingVendor} onClick={handleAddVendor}
                className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
                {addingVendor ? 'Adding...' : 'Add Vendor'}
              </button>
            </div>

            <div className="flex gap-1 mb-3">
              <button onClick={() => setVendorTab('active')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${vendorTab === 'active' ? 'bg-yellow-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Active ({allVendors.filter(v => v.is_active).length})
              </button>
              <button onClick={() => setVendorTab('inactive')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${vendorTab === 'inactive' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Inactive ({allVendors.filter(v => !v.is_active).length})
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <input type="text" value={vendorSearch} onChange={e => setVendorSearch(e.target.value)}
                placeholder="Search vendors..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none" />
              <select value={vendorSpecFilter} onChange={e => setVendorSpecFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none">
                <option value="all">All Specializations</option>
                {vendorSpecializations.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              {filteredVendors.map(v => (
                <div key={v.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{v.vendor_name}</p>
                    <p className="text-xs text-gray-400">{v.specialization}{v.phone ? ` · ${v.phone}` : ''}</p>
                    {!v.is_active && v.notes && <p className="text-xs text-red-400">{v.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    {v.is_active && (
                      <button onClick={() => { setEditingVendor(v.id); setEditVendorData({ vendor_name: v.vendor_name, specialization: v.specialization || '', phone: v.phone || '', alternate_phone: v.alternate_phone || '', address: v.address || '' }); setVendorError('') }}
                        className="text-xs text-blue-600 hover:underline">Edit</button>
                    )}
                    {v.is_active ? (
                      <button onClick={() => setDeactivatingVendor(v.id)} className="text-xs text-red-500 hover:underline">Deactivate</button>
                    ) : (
                      <button onClick={() => handleReactivateVendor(v.id)} className="text-xs text-green-600 hover:underline">Reactivate</button>
                    )}
                  </div>
                </div>
              ))}
              {filteredVendors.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No vendors found</p>}
            </div>
            <button onClick={() => { setShowVendors(false); setEditingVendor(null); setDeactivatingVendor(null) }}
              className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg">Close</button>
          </div>
        </div>
      )}

      {/* Create Repair Modal */}
      {creatingForItem && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-screen overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Create Repair Job</h3>
            <div className="bg-yellow-50 rounded-lg px-4 py-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-yellow-700 font-medium text-sm">{creatingForItem.asset_code}</span>
                <span className="text-xs text-gray-400">{daysSince(creatingForItem.intake_headers?.visit_date)} days in shop</span>
              </div>
              <p className="text-sm text-gray-700">{creatingForItem.intake_headers?.customers?.full_name} — {creatingForItem.ornament_type}</p>
              <div className="flex gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                <span>Net: {creatingForItem.net_weight}g</span>
                <span>Est Purity: {creatingForItem.estimated_purity}%</span>
                <span>Phone: {creatingForItem.intake_headers?.customers?.phone}</span>
                <span>{creatingForItem.intake_headers?.customers?.customer_code}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select value={newRepair.priority}
                  onChange={e => { const p = e.target.value; setNewRepair(prev => ({ ...prev, priority: p, expected_completion_date: autoExpectedDate(p) })) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
                  <option value="low">Low (10 days SLA)</option>
                  <option value="normal">Normal (7 days SLA)</option>
                  <option value="high">High (3 days SLA)</option>
                  <option value="urgent">Urgent (1 day SLA)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expected Completion</label>
                <input type="date" value={newRepair.expected_completion_date || autoExpectedDate(newRepair.priority)} min={today}
                  onChange={e => setNewRepair(p => ({ ...p, expected_completion_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Promise Date to Customer</label>
                <input type="date" value={newRepair.promised_date} min={today}
                  onChange={e => setNewRepair(p => ({ ...p, promised_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estimated Cost (₹)</label>
                <input type="number" min="0" value={newRepair.estimated_cost}
                  onChange={e => setNewRepair(p => ({ ...p, estimated_cost: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="0" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <input type="checkbox" id="purity_req" checked={newRepair.purity_test_required}
                  onChange={e => setNewRepair(p => ({ ...p, purity_test_required: e.target.checked }))}
                  className="w-4 h-4 accent-yellow-500" />
                <label htmlFor="purity_req" className="text-sm text-gray-700">Purity Test Required After Repair</label>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600 uppercase">Repair Tasks</p>
                <button onClick={() => setNewTasks(p => [...p, { repair_type: '', responsibility: 'inhouse', vendor_id: '', description: '', labour_cost: '', material_cost: '', vendor_cost: '' }])}
                  className="text-xs text-yellow-600 hover:text-yellow-800 font-medium">+ Add Task</button>
              </div>
              <div className="space-y-3">
                {newTasks.map((task, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Repair Type *</label>
                        <select value={task.repair_type}
                          onChange={e => setNewTasks(p => p.map((t, i) => i === idx ? { ...t, repair_type: e.target.value } : t))}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400">
                          <option value="">Select type...</option>
                          {REPAIR_TYPES.map(rt => <option key={rt} value={rt}>{rt}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Responsibility</label>
                        <select value={task.responsibility}
                          onChange={e => setNewTasks(p => p.map((t, i) => i === idx ? { ...t, responsibility: e.target.value, vendor_id: '' } : t))}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400">
                          <option value="inhouse">In-House</option>
                          <option value="vendor">Vendor</option>
                        </select>
                      </div>
                      {task.responsibility === 'vendor' && (
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Select Vendor</label>
                          <select value={task.vendor_id}
                            onChange={e => setNewTasks(p => p.map((t, i) => i === idx ? { ...t, vendor_id: e.target.value } : t))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400">
                            <option value="">Select vendor...</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name} — {v.specialization}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Description</label>
                        <input type="text" value={task.description}
                          onChange={e => setNewTasks(p => p.map((t, i) => i === idx ? { ...t, description: e.target.value } : t))}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
                          placeholder="Describe the work..." />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Labour Cost (₹)</label>
                        <input type="number" min="0" value={task.labour_cost}
                          onChange={e => setNewTasks(p => p.map((t, i) => i === idx ? { ...t, labour_cost: e.target.value } : t))}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Material Cost (₹)</label>
                        <input type="number" min="0" value={task.material_cost}
                          onChange={e => setNewTasks(p => p.map((t, i) => i === idx ? { ...t, material_cost: e.target.value } : t))}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none" placeholder="0" />
                      </div>
                      {task.responsibility === 'vendor' && (
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Vendor Cost (₹)</label>
                          <input type="number" min="0" value={task.vendor_cost}
                            onChange={e => setNewTasks(p => p.map((t, i) => i === idx ? { ...t, vendor_cost: e.target.value } : t))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none" placeholder="0" />
                        </div>
                      )}
                    </div>
                    {newTasks.length > 1 && (
                      <div className="flex justify-end">
                        <button onClick={() => setNewTasks(p => p.filter((_, i) => i !== idx))} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {createError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{createError}</div>}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setCreatingForItem(null); setCreateError('') }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button disabled={creating} onClick={handleCreateRepair}
                className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Repair Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Repair Modal */}
      {editingRepair && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Edit Repair — {editingRepair.repair_code}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select value={editData.priority} onChange={e => setEditData(p => ({ ...p, priority: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expected Completion</label>
                <input type="date" value={editData.expected_completion_date}
                  onChange={e => setEditData(p => ({ ...p, expected_completion_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Promise Date to Customer</label>
                <input type="date" value={editData.promised_date}
                  onChange={e => setEditData(p => ({ ...p, promised_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estimated Cost (₹)</label>
                <input type="number" min="0" value={editData.estimated_cost}
                  onChange={e => setEditData(p => ({ ...p, estimated_cost: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="edit_purity" checked={editData.purity_test_required}
                  onChange={e => setEditData(p => ({ ...p, purity_test_required: e.target.checked }))}
                  className="w-4 h-4 accent-yellow-500" />
                <label htmlFor="edit_purity" className="text-sm text-gray-700">Purity Test Required After Repair</label>
              </div>
            </div>
            {editError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mt-3">{editError}</div>}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setEditingRepair(null); setEditError('') }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button disabled={saving} onClick={handleSaveEdit}
                className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Repair Modal */}
      {viewingRepair && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-gray-800">{viewingRepair.repair_code}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[viewingRepair.status]}`}>{STATUS_LABELS[viewingRepair.status]}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[viewingRepair.priority]}`}>{viewingRepair.priority}</span>
                {isOverdue(viewingRepair) && <span className="text-xs text-red-600 font-medium">🔴 Overdue</span>}
              </div>
              <button onClick={() => setViewingRepair(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-yellow-700 font-medium">{viewingRepair.intake_items?.asset_code}</span>
                <span className="text-xs text-gray-400">{daysSince(viewingRepair.created_at)} days open</span>
              </div>
              <p className="text-sm text-gray-700">{viewingRepair.intake_items?.intake_headers?.customers?.full_name} — {viewingRepair.intake_items?.ornament_type}</p>
              <div className="flex gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                <span>Net: {viewingRepair.intake_items?.net_weight}g</span>
                <span>Phone: {viewingRepair.intake_items?.intake_headers?.customers?.phone}</span>
                {viewingRepair.expected_completion_date && (
                  <span className={daysUntil(viewingRepair.expected_completion_date) !== null && daysUntil(viewingRepair.expected_completion_date) < 0 ? 'text-red-600 font-medium' : ''}>
                    Due: {viewingRepair.expected_completion_date}
                  </span>
                )}
                {viewingRepair.promised_date && <span className="text-blue-600 font-medium">Promised: {viewingRepair.promised_date}</span>}
                {viewingRepair.purity_test_required && <span className="text-blue-600 font-medium">⚗ Purity Required</span>}
              </div>
              <p className="text-xs text-gray-400 mt-1">Created by {viewingRepair.created_by_user?.full_name || '—'}</p>
            </div>

            {/* Tasks */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Repair Tasks</p>
              <div className="space-y-2">
                {viewingTasks.map(task => (
                  <div key={task.id} className="bg-gray-50 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{task.repair_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${task.responsibility === 'vendor' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                          {task.responsibility === 'vendor' ? `${task.vendor?.vendor_name || 'Vendor'}` : 'In-House'}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {task.task_status === 'pending' && (
                          <button onClick={() => handleTaskStatusUpdate(task.id, 'inprogress')}
                            className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded">Start</button>
                        )}
                        {task.task_status === 'inprogress' && (
                          <button onClick={() => handleTaskStatusUpdate(task.id, 'completed')}
                            className="text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded">Complete</button>
                        )}
                        {task.task_status === 'completed' && <span className="text-xs text-green-600 font-medium">✓ Done</span>}
                      </div>
                    </div>
                    {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* QC */}
            {['qualitycheck', 'readyfordelivery'].includes(viewingRepair.status) && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Quality Check</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {[
                    { field: 'qc_repair_complete', label: 'Repair Completed' },
                    { field: 'qc_polish_complete', label: 'Polish Completed' },
                    { field: 'qc_stone_secure', label: 'Stones Secure' },
                    { field: 'qc_weight_verified', label: 'Weight Verified' },
                    { field: 'qc_customer_request_done', label: 'Customer Request Completed' },
                  ].map(({ field, label }) => (
                    <label key={field} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={viewingRepair[field] || false}
                        onChange={e => handleQcUpdate(field, e.target.checked)}
                        className="w-4 h-4 accent-green-500" />
                      <span className={`text-sm ${viewingRepair[field] ? 'text-green-700 line-through' : 'text-gray-700'}`}>{label}</span>
                    </label>
                  ))}
                </div>
                {!qcAllPassed(viewingRepair) && <p className="text-xs text-orange-600 mt-1">Complete all checks to proceed</p>}
              </div>
            )}

            {/* Costing */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Costing</p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-gray-500">Estimated Cost</span><span>₹{viewingRepair.estimated_cost || 0}</span></div>
                {viewingRepair.additional_cost > 0 && (
                  <>
                    <div className="flex justify-between"><span className="text-gray-500">Additional Cost</span><span className="text-orange-600">+₹{viewingRepair.additional_cost}</span></div>
                    {viewingRepair.additional_cost_reason && <div className="text-xs text-gray-400 pl-2">Reason: {viewingRepair.additional_cost_reason}</div>}
                  </>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                  <span className="font-medium text-gray-700">Final Cost</span>
                  <span className="font-bold text-gray-800">₹{calcFinalCost(viewingRepair)}</span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            {repairHistory.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Repair Timeline</p>
                <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
                  {repairHistory.map((entry, i) => {
                    const { time, label, by } = formatHistoryEntry(entry)
                    return (
                      <div key={i} className="relative">
                        <div className="absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full bg-yellow-400 border-2 border-white" />
                        <p className="text-xs font-medium text-gray-700">{label}</p>
                        <p className="text-xs text-gray-400">{time} · {by}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Customer History */}
            {customerHistory.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer's Previous Repairs</p>
                <div className="space-y-1">
                  {customerHistory.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-2 gap-2">
                      <span className="font-mono text-yellow-700">{h.repair_code}</span>
                      <span className="text-gray-500 flex-1">{h.repair_tasks?.map(t => t.repair_type).join(', ')}</span>
                      <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[h.status]}`}>{STATUS_LABELS[h.status]}</span>
                      <span className="text-green-700">{h.amount_collected ? `₹${h.amount_collected}` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {statusError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{statusError}</div>}

            <div className="flex flex-wrap gap-2 justify-end">
              {/* Additional cost — owner only */}
              {isOwner && !['delivered', 'cancelled', 'readyfordelivery'].includes(viewingRepair.status) && (
                <button onClick={() => { setAddingCostFor(viewingRepair.id); setViewingRepair(null) }}
                  className="text-xs text-orange-600 border border-orange-200 hover:bg-orange-50 px-3 py-1.5 rounded-lg">
                  + Additional Cost
                </button>
              )}
              {nextStatus(viewingRepair.status) && (
                <button disabled={updatingStatus} onClick={() => handleStatusUpdate(viewingRepair, nextStatus(viewingRepair.status))}
                  className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-1.5 rounded-lg disabled:opacity-50">
                  {updatingStatus ? '...' : NEXT_STATUS_LABEL[viewingRepair.status] || `Move to ${STATUS_LABELS[nextStatus(viewingRepair.status)]}`}
                </button>
              )}
              {viewingRepair.status === 'readyfordelivery' && (
                <button onClick={() => { setDeliveringRepair(viewingRepair.id); setViewingRepair(null) }}
                  className="text-xs bg-green-500 hover:bg-green-600 text-white font-medium px-4 py-1.5 rounded-lg">
                  Deliver Item
                </button>
              )}
              {!['delivered', 'cancelled'].includes(viewingRepair.status) && (
                <button onClick={() => { setCancellingRepair(viewingRepair.id); setViewingRepair(null) }}
                  className="text-xs text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">Cancel</button>
              )}
              <button onClick={() => setViewingRepair(null)}
                className="text-xs text-gray-500 hover:bg-gray-100 px-4 py-1.5 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Additional Cost Modal — owner only */}
      {addingCostFor && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Add Additional Cost</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Amount (₹)</label>
                <input type="number" min="0" value={additionalCost} onChange={e => setAdditionalCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Enter amount..." autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <input type="text" value={additionalCostReason} onChange={e => setAdditionalCostReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Reason for additional cost..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setAddingCostFor(null); setAdditionalCost(''); setAdditionalCostReason('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button disabled={addingCost || !additionalCost || !additionalCostReason} onClick={handleAddCost}
                className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {addingCost ? 'Adding...' : 'Add Cost'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliver Modal */}
      {deliveringRepair && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Deliver Repair Item</h3>
            {(() => {
              const repair = activeRepairs.find(r => r.id === deliveringRepair)
              const finalCost = calcFinalCost(repair)
              const collected = parseFloat(deliveryData.amount_collected) || 0
              const diff = collected - finalCost
              return (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
                    <p className="font-medium text-gray-700">{repair?.intake_items?.asset_code} — {repair?.intake_items?.ornament_type}</p>
                    <p className="text-gray-500">{repair?.intake_items?.intake_headers?.customers?.full_name} · {repair?.intake_items?.intake_headers?.customers?.phone}</p>
                    <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                      <span className="text-gray-500">Final Cost</span>
                      <span className="font-medium text-gray-800">₹{finalCost}</span>
                    </div>
                    {collected > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Difference</span>
                        <span className={`font-medium ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {diff === 0 ? 'Exact' : diff > 0 ? `+₹${diff.toFixed(2)} overpaid` : `₹${Math.abs(diff).toFixed(2)} short`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount Collected (₹) *</label>
                      <input type="number" min="0" value={deliveryData.amount_collected}
                        onChange={e => setDeliveryData(p => ({ ...p, amount_collected: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        placeholder="Enter amount..." autoFocus />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                      <select value={deliveryData.payment_method}
                        onChange={e => setDeliveryData(p => ({ ...p, payment_method: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                      <input type="text" value={deliveryData.delivery_notes}
                        onChange={e => setDeliveryData(p => ({ ...p, delivery_notes: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        placeholder="Any notes..." />
                    </div>
                    {diff < 0 && collected > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                        ⚠ Amount is ₹{Math.abs(diff).toFixed(2)} less than final cost. This will be recorded as a short payment.
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
            {deliveryError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mt-3">{deliveryError}</div>}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setDeliveringRepair(null); setDeliveryData({ amount_collected: '', payment_method: 'cash', delivery_notes: '' }); setDeliveryError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button disabled={delivering} onClick={handleDeliver}
                className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {delivering ? 'Delivering...' : 'Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingRepair && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-red-700 mb-2">Cancel Repair Job</h3>
            <p className="text-sm text-gray-500 mb-4">Repair will be cancelled and asset will revert to tested status. Action is permanently logged.</p>
            {cancelError && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-3">{cancelError}</div>}
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
              placeholder="Reason for cancellation..." autoFocus />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setCancellingRepair(null); setCancelReason(''); setCancelError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
              <button disabled={cancelling} onClick={handleCancel}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}