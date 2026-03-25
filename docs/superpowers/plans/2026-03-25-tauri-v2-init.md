# Tauri v2 초기화 — 구현 플랜

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Electron을 제거하고 Tauri v2로 교체하여 Next.js 앱을 macOS 데스크탑 앱으로 실행한다. 개발 모드에서 Tauri WebView가 localhost:3000의 Next.js를 안정적으로 로드하는 것을 확인한다.

**Architecture:** Tauri v2가 macOS 네이티브 WKWebView로 Next.js dev server URL을 로드한다. Rust core가 IPC 커맨드를 제공하고, Next.js 서버는 sidecar 또는 별도 프로세스로 실행된다.

**Tech Stack:** Tauri v2, Rust, Next.js 15, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-25-tauri-v2-migration-design.md`

---

## Task 1: Rust 툴체인 확인 + Tauri CLI 설치

- [ ] **Step 1: Rust 설치 확인**

```bash
rustc --version || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

- [ ] **Step 2: Tauri CLI 설치**

```bash
npm install -D @tauri-apps/cli@latest
```

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "feat(tauri): add @tauri-apps/cli"
```

---

## Task 2: Tauri 프로젝트 초기화

- [ ] **Step 1: Tauri init**

```bash
cd "/Users/rnr/Documents/New project"
npx tauri init
```

프롬프트 응답:
- App name: `Garnet`
- Window title: `Garnet`
- Frontend dev URL: `http://localhost:3000`
- Frontend dist: `../.next-build/standalone`
- Dev command: `npm run dev:next`
- Build command: `npm run build:next`

이렇게 하면 `src-tauri/` 디렉토리가 생성됨.

- [ ] **Step 2: tauri.conf.json 수정**

`src-tauri/tauri.conf.json`을 다음과 같이 설정:

```json
{
  "$schema": "https://raw.githubusercontent.com/nicholasio/tauri-2.0/main/crates/tauri-cli/schema.json",
  "productName": "Garnet",
  "version": "0.5.0",
  "identifier": "com.garnet.app",
  "build": {
    "devUrl": "http://localhost:3000",
    "frontendDist": "../.next-build/standalone"
  },
  "app": {
    "windows": [
      {
        "title": "Garnet",
        "width": 1366,
        "height": 900,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "11.0"
    }
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src-tauri/
git commit -m "feat(tauri): initialize Tauri v2 project structure"
```

---

## Task 3: Tauri Rust 진입점 설정

- [ ] **Step 1: src-tauri/src/main.rs 작성**

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Garnet");
}
```

- [ ] **Step 2: Cargo.toml 확인**

`src-tauri/Cargo.toml`에 다음이 있는지 확인:

```toml
[package]
name = "garnet"
version = "0.5.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

- [ ] **Step 3: build.rs 확인**

```rust
// src-tauri/build.rs
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/
git commit -m "feat(tauri): configure Rust entry point and Cargo dependencies"
```

---

## Task 4: package.json scripts 업데이트

- [ ] **Step 1: Tauri 개발/빌드 스크립트 추가**

`package.json`의 `scripts` 섹션을 수정:

```json
{
  "scripts": {
    "stop:dev": "pkill -f \"next dev -p 3000\" || true; pkill -f \"wait-on tcp:3000\" || true",
    "clean:cache": "chmod -R u+w .next .next-build 2>/dev/null || true; rm -rf .next .next-build node_modules/.cache || true",
    "dev": "npm run stop:dev && npm run clean:cache && npm run dev:next",
    "dev:next": "next dev -p 3000 --turbo",
    "dev:tauri": "npm run stop:dev && npm run clean:cache && tauri dev",
    "build": "npm run build:next && tauri build",
    "build:next": "cross-env NEXT_DIST_DIR=.next-build next build && mkdir -p .next-build/standalone/.next-build && cp -R .next-build/static .next-build/standalone/.next-build/static",
    "start": "next start -p 3000",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev --name init",
    "test": "vitest run",
    "test:watch": "vitest",
    "mcp:server": "node scripts/mcp-server.mjs"
  }
}
```

핵심 변경:
- `dev` → Next.js만 (브라우저 개발, 가장 안정적)
- `dev:tauri` → Tauri + Next.js (데스크탑 테스트)
- `build` → Next.js 빌드 + Tauri 번들 (DMG 생성)
- Electron 관련 스크립트 모두 제거

- [ ] **Step 2: 커밋**

```bash
git add package.json
git commit -m "feat(tauri): update dev/build scripts for Tauri workflow"
```

---

## Task 5: Tauri dev 모드 테스트

- [ ] **Step 1: Next.js dev server 시작**

```bash
npm run dev:next
```

별도 터미널에서 Next.js가 localhost:3000에서 실행 중인지 확인.

- [ ] **Step 2: Tauri dev 시작**

```bash
npx tauri dev
```

첫 실행 시 Rust 컴파일이 수 분 걸림. 완료되면:
- macOS 네이티브 창이 열림
- 타이틀: "Garnet"
- 내용: Next.js 앱이 WKWebView에서 렌더링
- 사이드바, 페이지 이동, Cmd+K 모두 작동 확인

- [ ] **Step 3: 작동 확인 후 커밋**

```bash
git add -A
git commit -m "feat(tauri): verified Tauri dev mode loads Next.js app"
```

---

## Task 6: Tauri 앱 아이콘 설정

- [ ] **Step 1: 기존 아이콘 활용**

기존 Electron 아이콘이 있으면 복사, 없으면 Tauri 기본 아이콘 사용:

```bash
# Tauri가 자동 생성한 아이콘이 src-tauri/icons/에 있음
ls src-tauri/icons/
```

커스텀 아이콘이 필요하면 `npx tauri icon <path-to-1024x1024-png>`로 생성.

- [ ] **Step 2: 커밋 (변경이 있으면)**

---

## Task 7: Electron 코드 제거 준비

아직 삭제하지 않고 `.gitignore`에 추가하여 비활성화:

- [ ] **Step 1: Electron 관련 파일 식별**

삭제 대상 (Phase 2에서 삭제):
- `electron/` 디렉토리
- `dist-electron/` 디렉토리
- package.json의 `"main": "dist-electron/main.js"`
- package.json의 electron, electron-builder, electron-updater 의존성

- [ ] **Step 2: package.json에서 "main" 필드 제거**

`"main": "dist-electron/main.js"` 라인을 제거. Tauri는 이 필드를 사용하지 않음.

- [ ] **Step 3: 커밋**

```bash
git add package.json
git commit -m "refactor: remove Electron main entry point from package.json"
```

---

## Task 8: Tauri 개발 워크플로우 설정

- [ ] **Step 1: Tauri의 beforeDevCommand 설정**

`src-tauri/tauri.conf.json`에 dev 커맨드 추가:

```json
{
  "build": {
    "beforeDevCommand": "npm run dev:next",
    "devUrl": "http://localhost:3000",
    "beforeBuildCommand": "npm run build:next",
    "frontendDist": "../.next-build/standalone"
  }
}
```

이렇게 하면 `npx tauri dev` 한 번으로 Next.js + Tauri가 동시에 시작됨.

- [ ] **Step 2: 테스트**

```bash
npm run dev:tauri
```

Next.js가 자동 시작되고, Tauri 창이 열리면 성공.

- [ ] **Step 3: 커밋**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(tauri): configure beforeDevCommand for unified dev workflow"
```
