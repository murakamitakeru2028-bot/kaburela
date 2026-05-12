#!/usr/bin/env node
// Compact correlation/*.json into upper-triangle + 2-decimal precision form.
// Also removes unused stock-correlations/ (legacy 銘柄相関 tab).
//
// Format change:
//   before: { stocks: [...], matrix: number[N][N] }   // 17MB, full symmetric
//   after:  { stocks: [...], upper: number[N*(N-1)/2] } // ~5MB, upper triangle only
//
// Diagonal is implicitly 1.0; lower triangle is implicitly mirrored.
// Run: node scripts/compact-data.mjs

import { readFileSync, writeFileSync, statSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PERIODS = ['1M', '3M', '6M', '1Y', '3Y', '5Y']

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

function round2(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.round(v * 100) / 100
}

function compactCorrelation(period) {
  const path = join(ROOT, 'public', 'data', 'correlation', `${period}.json`)
  if (!existsSync(path)) {
    console.warn(`skip: ${path} (not found)`)
    return
  }
  const before = statSync(path).size
  const raw = JSON.parse(readFileSync(path, 'utf8'))

  // Already compact?
  if (Array.isArray(raw.upper) && !raw.matrix) {
    console.log(`${period}: already compact (${fmtMB(before)})`)
    return
  }

  const { stocks, matrix } = raw
  if (!Array.isArray(stocks) || !Array.isArray(matrix)) {
    console.warn(`skip: ${path} (unexpected shape)`)
    return
  }
  const n = stocks.length
  const upper = new Array((n * (n - 1)) / 2)
  let k = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      upper[k++] = round2(matrix[i]?.[j] ?? 0)
    }
  }
  writeFileSync(path, JSON.stringify({ stocks, upper }))
  const after = statSync(path).size
  console.log(`${period}: ${fmtMB(before)} → ${fmtMB(after)} (${((1 - after / before) * 100).toFixed(0)}% reduction)`)
}

function removeUnusedStockCorrelations() {
  const dir = join(ROOT, 'public', 'data', 'stock-correlations')
  if (!existsSync(dir)) return
  const subdirs = readdirSync(dir)
  let total = 0
  for (const sub of subdirs) {
    const subPath = join(dir, sub)
    try {
      for (const f of readdirSync(subPath)) {
        total += statSync(join(subPath, f)).size
      }
    } catch {
      // ignore
    }
  }
  rmSync(dir, { recursive: true, force: true })
  console.log(`removed stock-correlations/ (freed ${fmtMB(total)})`)
}

console.log('Compacting correlation data...')
for (const period of PERIODS) {
  compactCorrelation(period)
}

console.log('\nRemoving unused stock-correlations/...')
removeUnusedStockCorrelations()

console.log('\nDone.')
