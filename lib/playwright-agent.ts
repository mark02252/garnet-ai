/**
 * Playwright Agent — 브라우저 자동화 기반 서비스
 *
 * 기능:
 * 1. captureUrl() — URL 스크린샷 캡처
 * 2. diffSnapshots() — 두 스크린샷 비교 (변화 감지)
 * 3. extractPageData() — 페이지 텍스트/메타/가격 추출
 * 4. validateUrl() — URL 유효성 + 상태코드 확인
 */

import { chromium, type Browser, type Page } from 'playwright-core'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const SCREENSHOT_DIR = path.join(process.cwd(), '.garnet-config', 'screenshots')
const TIMEOUT_MS = 30_000

// Ensure screenshot directory exists
function ensureDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  }
}

let _browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser
  _browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  return _browser
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  try {
    return await fn(page)
  } finally {
    await context.close()
  }
}

// ── 1. URL 스크린샷 캡처 ──

export type CaptureResult = {
  url: string
  screenshotPath: string
  title: string
  statusCode: number
  capturedAt: string
}

export async function captureUrl(url: string): Promise<CaptureResult> {
  ensureDir()
  return withPage(async (page) => {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS })
    const title = await page.title()
    const statusCode = response?.status() || 0

    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8)
    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = `${hash}_${timestamp}.png`
    const screenshotPath = path.join(SCREENSHOT_DIR, filename)

    await page.screenshot({ path: screenshotPath, fullPage: true })

    return {
      url,
      screenshotPath,
      title,
      statusCode,
      capturedAt: new Date().toISOString(),
    }
  })
}

// ── 2. 스크린샷 비교 (변화 감지) ──

export type DiffResult = {
  url: string
  changed: boolean
  changePercent: number
  previousPath: string
  currentPath: string
  diffDetails: string
}

export async function diffSnapshots(url: string): Promise<DiffResult> {
  ensureDir()
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8)

  // 이전 스크린샷 찾기
  const files = fs.readdirSync(SCREENSHOT_DIR)
    .filter(f => f.startsWith(hash) && f.endsWith('.png'))
    .sort()

  // 새 스크린샷 캡처
  const current = await captureUrl(url)

  if (files.length < 2) {
    return {
      url,
      changed: false,
      changePercent: 0,
      previousPath: '',
      currentPath: current.screenshotPath,
      diffDetails: '첫 번째 캡처 — 비교 대상 없음',
    }
  }

  const previousPath = path.join(SCREENSHOT_DIR, files[files.length - 2])
  const prevSize = fs.statSync(previousPath).size
  const currSize = fs.statSync(current.screenshotPath).size

  // 간단한 파일 크기 기반 변화 감지 (정밀 pixel diff는 추후 추가)
  const sizeDiff = Math.abs(currSize - prevSize)
  const changePercent = prevSize > 0 ? Math.round((sizeDiff / prevSize) * 100) : 0
  const changed = changePercent > 5 // 5% 이상 변화 시 "변경됨"

  return {
    url,
    changed,
    changePercent,
    previousPath,
    currentPath: current.screenshotPath,
    diffDetails: changed
      ? `파일 크기 ${changePercent}% 변화 (${prevSize} → ${currSize} bytes)`
      : '유의미한 변화 없음',
  }
}

// ── 3. 페이지 데이터 추출 ──

export type PageData = {
  url: string
  title: string
  description: string
  ogImage: string
  h1: string[]
  prices: string[]
  promotions: string[]
  links: number
  images: number
  textContent: string // 주요 텍스트 (1000자 제한)
}

export async function extractPageData(url: string): Promise<PageData> {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS })

    const data = await page.evaluate(() => {
      const getMeta = (name: string) =>
        document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content') || ''

      const h1s = Array.from(document.querySelectorAll('h1')).map(el => el.textContent?.trim() || '')

      // 가격 패턴 추출
      const priceRegex = /[\d,]+원|₩[\d,]+|\$[\d,.]+|KRW[\s]?[\d,]+/g
      const bodyText = document.body.innerText || ''
      const prices = [...new Set(bodyText.match(priceRegex) || [])]

      // 프로모션/할인 키워드 추출
      const promoRegex = /\d+%\s*(할인|OFF|세일|SALE)|무료|이벤트|특가|얼리버드/gi
      const promotions = [...new Set(bodyText.match(promoRegex) || [])]

      return {
        title: document.title,
        description: getMeta('description') || getMeta('og:description'),
        ogImage: getMeta('og:image'),
        h1: h1s.filter(Boolean).slice(0, 5),
        prices: prices.slice(0, 10),
        promotions: promotions.slice(0, 5),
        links: document.querySelectorAll('a[href]').length,
        images: document.querySelectorAll('img').length,
        textContent: bodyText.slice(0, 1000),
      }
    })

    return { url, ...data }
  })
}

// ── 4. URL 유효성 검증 ──

export async function validateUrl(url: string): Promise<{
  url: string
  valid: boolean
  statusCode: number
  redirectUrl: string | null
  loadTimeMs: number
}> {
  return withPage(async (page) => {
    const start = Date.now()
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
      const loadTimeMs = Date.now() - start
      return {
        url,
        valid: response !== null && response.status() < 400,
        statusCode: response?.status() || 0,
        redirectUrl: page.url() !== url ? page.url() : null,
        loadTimeMs,
      }
    } catch {
      return {
        url,
        valid: false,
        statusCode: 0,
        redirectUrl: null,
        loadTimeMs: Date.now() - start,
      }
    }
  })
}

// ── Cleanup ──

export async function closeBrowser() {
  if (_browser) {
    await _browser.close()
    _browser = null
  }
}
