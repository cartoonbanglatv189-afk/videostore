import { useEffect, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { getDb } from '../firebase'

function toList(val) {
  if (!val) return []
  return Object.entries(val).map(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      const item = { _fbKey: key, ...value }
      if (item.id === undefined || item.id === null) item.id = key
      return item
    }
    return { _fbKey: key, id: key, value }
  })
}

export function useFirebaseList(path) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let cancelled = false
    let unsub = null
    getDb().then(db => {
      if (cancelled || !db) return
      unsub = onValue(
        ref(db, path),
        snapshot => setItems(toList(snapshot.val())),
        err => console.error('Firebase listener error', path, err)
      )
    })
    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [path])

  return items
}

export function useFirebaseObject(path) {
  const [obj, setObj] = useState(null)

  useEffect(() => {
    let cancelled = false
    let unsub = null
    getDb().then(db => {
      if (cancelled || !db) return
      unsub = onValue(
        ref(db, path),
        snapshot => setObj(snapshot.val()),
        err => console.error('Firebase listener error', path, err)
      )
    })
    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [path])

  return obj
}
