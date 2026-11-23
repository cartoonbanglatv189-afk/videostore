import { useState } from 'react'
import { useFirebaseList } from '../../hooks/useFirebase'
import { api } from '../../api'
import { confirmDelete, writeWithFallback } from './shared'
import { useToast } from '../../context/ToastContext'

export default function CategorySection() {
  const { showToast } = useToast()
  const filters = useFirebaseList('filters')

  const [cId, setCId] = useState('')
  const [cName, setCName] = useState('')

  const addCategory = async () => {
    if (!cId || !cName) return
    await writeWithFallback('filters', { id: cId, name: cName }, api.addFilter, { id: cId, name: cName })
    setCId('')
    setCName('')
    showToast('Added!')
  }

  return (
    <>
      <input type="text" value={cId} onChange={e => setCId(e.target.value)} placeholder="ID (viral)" />
      <input type="text" value={cName} onChange={e => setCName(e.target.value)} placeholder="Name (ভাইরাল)" />
      <button className="action-btn" onClick={addCategory}>
        Add
      </button>
      <div>
        {filters.map(f => (
          <div key={f._fbKey} className="list-item">
            <span>{f.name}</span>
            <button className="del-btn" onClick={() => confirmDelete('filters', api.deleteFilter, f._fbKey)}>
              X
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
