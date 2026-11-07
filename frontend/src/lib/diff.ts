export type DiffSegment =
  | { type: 'same' | 'added' | 'removed'; value: string }

export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

function tokenize(text: string): string[] {
  return text.match(/\s*[\p{L}\p{N}_]+|\s*[^\s\p{L}\p{N}_]+|\s+/gu) ?? []
}

export function diffText(previous: string, current: string): DiffSegment[] {
  const before = tokenize(previous)
  const after = tokenize(current)
  const lengths = Array.from(
    { length: before.length + 1 },
    () => new Uint32Array(after.length + 1),
  )

  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lengths[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex]
        ? lengths[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(lengths[beforeIndex + 1][afterIndex], lengths[beforeIndex][afterIndex + 1])
    }
  }

  const segments: DiffSegment[] = []
  function append(type: DiffSegment['type'], value: string) {
    const last = segments[segments.length - 1]
    if (last?.type === type) last.value += value
    else segments.push({ type, value })
  }

  let beforeIndex = 0
  let afterIndex = 0
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (
      beforeIndex < before.length
      && afterIndex < after.length
      && before[beforeIndex] === after[afterIndex]
    ) {
      append('same', before[beforeIndex])
      beforeIndex += 1
      afterIndex += 1
    } else if (
      beforeIndex < before.length
      && (
        afterIndex === after.length
        || lengths[beforeIndex + 1][afterIndex] >= lengths[beforeIndex][afterIndex + 1]
      )
    ) {
      append('removed', before[beforeIndex])
      beforeIndex += 1
    } else {
      append('added', after[afterIndex])
      afterIndex += 1
    }
  }

  const groupedSegments: DiffSegment[] = []
  let removed = ''
  let added = ''
  let removedWhitespace = ''
  let addedWhitespace = ''
  let sharedWhitespace = ''

  function flushEditBlock() {
    if (removed) groupedSegments.push({ type: 'removed', value: removed })
    if (added) groupedSegments.push({ type: 'added', value: added })
    removed = ''
    added = ''
    removedWhitespace = ''
    addedWhitespace = ''
  }

  for (const segment of segments) {
    if (segment.type === 'same' && /^\s+$/.test(segment.value)) {
      if (removed || added) sharedWhitespace += segment.value
      else groupedSegments.push(segment)
      continue
    }

    if (segment.type === 'same') {
      flushEditBlock()
      if (sharedWhitespace) {
        groupedSegments.push({ type: 'same', value: sharedWhitespace })
        sharedWhitespace = ''
      }
      groupedSegments.push(segment)
      continue
    }

    if (sharedWhitespace) {
      removedWhitespace += sharedWhitespace
      addedWhitespace += sharedWhitespace
      sharedWhitespace = ''
    }

    if (segment.type === 'removed') {
      if (removed) removed += removedWhitespace
      removedWhitespace = ''
      removed += segment.value
    } else {
      if (added) added += addedWhitespace
      addedWhitespace = ''
      added += segment.value
    }
  }

  flushEditBlock()
  if (sharedWhitespace) groupedSegments.push({ type: 'same', value: sharedWhitespace })

  return groupedSegments
}
