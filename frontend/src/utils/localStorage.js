export function getLiked() {
  try {
    return JSON.parse(localStorage.getItem('likes') || '[]')
  } catch {
    return []
  }
}

export function toggleLike(id) {
  let l = getLiked()
  if (l.includes(id)) l = l.filter(x => x !== id)
  else l.push(id)
  localStorage.setItem('likes', JSON.stringify(l))
}

export function getProgress(id) {
  return parseInt(localStorage.getItem('p_' + id) || 0)
}

export function setProgress(id, value) {
  localStorage.setItem('p_' + id, value)
}

export function getDaily() {
  try {
    const d = JSON.parse(localStorage.getItem('daily') || '{}')
    return d.date === new Date().toDateString() ? d.count : 0
  } catch {
    return 0
  }
}

export function incDaily() {
  localStorage.setItem('daily', JSON.stringify({ date: new Date().toDateString(), count: getDaily() + 1 }))
}

export function hasViewedEvent(videoId) {
  return Boolean(localStorage.getItem('viewed_event_' + videoId))
}

export function markViewedEvent(videoId) {
  localStorage.setItem('viewed_event_' + videoId, 'true')
}
