# Tauri v2 마이그레이션 설계

> 날짜: 2026-03-25
> 상태: Draft

## 개요

Garnet의 데스크탑 쉘을 Electron에서 Tauri v2로 교체한다. Next.js 코드베이스는 변경 없이 유지하고, Tauri sidecar로 Next.js 서버를 내장한다.

### 목표

1. Electron의 흰 화면/EPIPE/UI 블로킹 문제를 근본 해결
2. 번들 크기 150-300MB → ~50MB로 축소
3. macOS DMG 배포 + 자동 업데이트 유지
4. 기존 코드 변경 최소화

### 비변경 사항

- Next.js 15 코드 전체 (API 라우트 30+, 페이지, 컴포넌트)
- Prisma/SQLite 데이터베이스
- LLM 연동 (Gemini, OpenAI, Claude, Groq)
- 수집기, 스케줄러, AI 분석 파이프라인
- UI 컴포넌트 (Cmd+K, 코파일럿, 영상 스튜디오 등)

## 아키텍처

```
┌─────────────────────────────────────────┐
│              Tauri v2 App               │
│  ┌──────────┐    ┌───────────────────┐  │
│  │  Rust    │    │   macOS WebView   │  │
│  │  Core    │◄──►│  (WKWebView)      │  │
│  │          │    │                   │  │
│  │ - IPC    │    │  localhost:3000   │  │
│  │ - Store  │    │  ┌─────────────┐  │  │
│  │ - Update │    │  │ Next.js App │  │  │
│  │ - Dialog │    │  └─────────────┘  │  │
│  └──────────┘    └───────────────────┘  │
│        │                                │
│  ┌─────▼──────────────────────────┐     │
│  │    Sidecar: Next.js Server     │     │
│  │    (Node.js + standalone)      │     │
│  │    - API Routes                │     │
│  │    - Prisma/SQLite             │     │
│  │    - LLM, Collectors, etc.    │     │
│  └────────────────────────────────┘     │
│        │                                │
│  ┌─────▼──────┐                         │
│  │  ffmpeg    │  (optional sidecar)     │
│  └────────────┘                         │
└─────────────────────────────────────────┘
```

### 동작 흐름

1. Tauri 앱 시작
2. Rust core가 Next.js standalone 서버를 sidecar로 시작
3. 서버가 `localhost:3000` (또는 동적 포트)에서 준비
4. Tauri WebView가 해당 URL을 로드
5. JS ↔ Rust IPC는 Tauri `invoke` 커맨드로 처리

### Electron vs Tauri 비교

| | Electron | Tauri v2 |
|---|---|---|
| 렌더링 엔진 | Chromium (번들) | macOS WKWebView (네이티브) |
| 번들 크기 | 150-300 MB | ~50 MB (Node.js sidecar 포함) |
| 메모리 사용 | 200-400 MB | 50-100 MB |
| 백엔드 언어 | Node.js | Rust |
| IPC | ipcMain/ipcRenderer | invoke 커맨드 |
| 자동 업데이트 | electron-updater | tauri-plugin-updater |
| 보안 저장소 | safeStorage | tauri-plugin-store |
| 개발 모드 안정성 | 흰 화면/EPIPE 이슈 | 네이티브 WebView, 안정적 |

## 네이티브 기능 매핑

### IPC 통신

Electron의 `ipcMain.handle` / `ipcRenderer.invoke` 패턴을 Tauri의 `#[tauri::command]` / `invoke`로 교체.

**Electron (현재):**
```typescript
// main process
ipcMain.handle('get-meta-connection', async () => { ... });
// renderer
const data = await window.electron.invoke('get-meta-connection');
```

**Tauri (변경 후):**
```rust
#[tauri::command]
fn get_meta_connection(app: AppHandle) -> Result<String, String> { ... }
```
```typescript
// frontend
const data = await invoke('get_meta_connection');
```

### 보안 저장소

| Electron | Tauri |
|----------|-------|
| `safeStorage.encryptString()` | `tauri-plugin-store` (AES 암호화) |
| `safeStorage.decryptString()` | `store.get()` / `store.set()` |

### 자동 업데이트

| Electron | Tauri |
|----------|-------|
| `electron-updater` | `tauri-plugin-updater` |
| GitHub Releases | GitHub Releases (동일) |
| `autoUpdater.checkForUpdates()` | `check()` → `download()` → `install()` |

### 파일 시스템

| Electron | Tauri |
|----------|-------|
| Node.js `fs` | `tauri-plugin-fs` 또는 sidecar Node.js |
| `app.getPath('userData')` | `app_data_dir()` |

### ffmpeg

Tauri sidecar로 ffmpeg 바이너리를 번들하여 `Command::new_sidecar("ffmpeg")`로 실행.

## 프로젝트 구조

```
garnet/
├── src-tauri/               # Tauri Rust 코드 (신규)
│   ├── Cargo.toml
│   ├── tauri.conf.json      # Tauri 설정 (창 크기, 업데이터, 권한 등)
│   ├── capabilities/        # 권한 설정
│   ├── src/
│   │   ├── main.rs          # Tauri 진입점
│   │   ├── commands.rs      # IPC 커맨드 (store, meta-connection 등)
│   │   └── sidecar.rs       # Next.js 서버 sidecar 관리
│   └── icons/               # 앱 아이콘
├── app/                     # Next.js (변경 없음)
├── components/              # React 컴포넌트 (변경 없음)
├── lib/                     # 비즈니스 로직 (변경 없음)
├── prisma/                  # DB 스키마 (변경 없음)
├── electron/                # 삭제 예정
├── dist-electron/           # 삭제 예정
└── package.json             # scripts 업데이트
```

## Tauri 설정 (tauri.conf.json)

```json
{
  "productName": "Garnet",
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
    ]
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "updater"],
    "icon": ["icons/icon.icns"],
    "macOS": {
      "minimumSystemVersion": "11.0"
    }
  },
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/USER/garnet/releases/latest/download/latest.json"],
      "pubkey": "..."
    }
  }
}
```

## 개발 워크플로우

### 개발 모드

```bash
# 터미널 1: Next.js dev server
npm run dev:next    # next dev -p 3000 --turbo

# 터미널 2: Tauri dev (WebView가 localhost:3000을 로드)
npm run tauri dev
```

또는 `concurrently`로 한 번에:
```bash
npm run dev         # concurrently "npm:dev:next" "npm:tauri dev"
```

### 프로덕션 빌드

```bash
npm run build       # Next.js standalone build + Tauri bundle
# 출력: src-tauri/target/release/bundle/dmg/Garnet.dmg
```

빌드 순서:
1. `next build` (standalone output)
2. Node.js sidecar 준비 (standalone + node binary)
3. `tauri build` (Rust 컴파일 + DMG 생성)

## Sidecar: Next.js 서버 관리

### 시작

```rust
// src-tauri/src/sidecar.rs
use tauri::Manager;
use std::process::Command;

pub fn start_nextjs_server(app: &tauri::AppHandle) -> Result<u16, String> {
    let port = find_available_port();
    let server_path = app.path().resource_dir()
        .join("nextjs-server");

    Command::new(server_path.join("node"))
        .arg(server_path.join("server.js"))
        .env("PORT", port.to_string())
        .env("DATABASE_URL", get_db_path(app))
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(port)
}
```

### 종료

앱 종료 시 sidecar 프로세스도 함께 종료:
```rust
app.on_event(|event| {
    if let tauri::RunEvent::Exit = event {
        kill_nextjs_server();
    }
});
```

### 포트 관리

- 개발 모드: 고정 포트 3000 (Next.js dev server)
- 프로덕션: 동적 포트 할당 (포트 충돌 방지)

## 마이그레이션 순서

### Phase 1: Tauri 프로젝트 초기화
1. Rust 툴체인 설치 확인
2. `npm create tauri-app` 또는 수동 `src-tauri/` 생성
3. `tauri.conf.json` 설정 (devUrl: localhost:3000)
4. 기본 Tauri 앱이 Next.js dev server를 로드하는지 확인

### Phase 2: IPC 커맨드 마이그레이션
5. Electron IPC 핸들러 목록 추출
6. Tauri Rust 커맨드로 재구현
7. 프론트엔드 IPC 호출을 Tauri invoke로 교체
8. `preload.js` 제거

### Phase 3: 플러그인 설정
9. tauri-plugin-store (보안 저장소)
10. tauri-plugin-updater (자동 업데이트)
11. tauri-plugin-dialog (파일 선택)
12. tauri-plugin-opener (URL 열기)
13. ffmpeg sidecar 설정

### Phase 4: 프로덕션 빌드
14. Next.js standalone 빌드 + Node.js sidecar 패키징
15. Tauri 번들 (DMG)
16. 자동 업데이트 엔드포인트 설정
17. Electron 코드 삭제

### Phase 5: 정리
18. package.json scripts 업데이트
19. Electron 의존성 제거
20. CI/CD 설정 (GitHub Actions)
21. README 업데이트

## 삭제 대상

| 파일/디렉토리 | 이유 |
|-------------|------|
| `electron/` | Tauri로 대체 |
| `dist-electron/` | Tauri로 대체 |
| `electron-builder` 설정 | Tauri 번들러로 대체 |
| `package.json`의 electron 관련 scripts | Tauri scripts로 대체 |
| `electron`, `electron-builder`, `electron-updater` 패키지 | 불필요 |
| `wait-on`, `cross-env`, `concurrently` | Tauri CLI가 처리 (일부 유지 가능) |

## 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| Node.js sidecar 크기 | standalone 빌드 + 트리쉐이킹으로 최소화 |
| macOS 코드 서명 | Apple Developer 계정 필요, Tauri가 자동 처리 |
| Rust 컴파일 시간 | 첫 빌드만 느림, 이후 incremental |
| WKWebView 호환성 | Safari 최신 엔진 사용, 99% 호환 |
| Prisma SQLite 경로 | Tauri `app_data_dir()` 기반으로 동적 설정 |
