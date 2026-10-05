const DIM_BOILERPLATE_KEY = 'dripfeed.dimBoilerplate'

export function loadDimBoilerplate(): boolean {
  try {
    return localStorage.getItem(DIM_BOILERPLATE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveDimBoilerplate(enabled: boolean): void {
  try {
    localStorage.setItem(DIM_BOILERPLATE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/**
 * Dim paragraph-like chunks in `body` that also occur in another recent post.
 * Matching normalized text rather than markup lets equivalent RSS HTML match.
 */
export function dimRepeatedChunks(body: string, recentBodies: string[]): string {
  const parser = new DOMParser()
  const documents = recentBodies.map((html) => parser.parseFromString(html, 'text/html'))
  const chunksByDocument = documents.map((doc) => {
    const chunks = new Set<string>()
    for (const element of doc.querySelectorAll('p, li, blockquote, footer, aside, h1, h2, h3, h4, h5, h6')) {
      const text = normalizeChunk(element.textContent ?? '')
      if (text.length >= 20) chunks.add(text)
    }
    return chunks
  })

  const counts = new Map<string, number>()
  for (const chunks of chunksByDocument) {
    for (const chunk of chunks) counts.set(chunk, (counts.get(chunk) ?? 0) + 1)
  }
  const repeated = new Set([...counts].filter(([, count]) => count >= 2).map(([chunk]) => chunk))
  if (repeated.size === 0) return body

  const current = parser.parseFromString(body, 'text/html')
  for (const element of current.querySelectorAll('p, li, blockquote, footer, aside, h1, h2, h3, h4, h5, h6')) {
    if (repeated.has(normalizeChunk(element.textContent ?? ''))) {
      element.classList.add('dim-boilerplate')
    }
  }
  return current.body.innerHTML
}

function normalizeChunk(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}
