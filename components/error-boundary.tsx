'use client'

import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 text-center">
          <p className="text-sm text-rose-700 mb-2">페이지를 불러오는 중 오류가 발생했습니다.</p>
          <button className="button-secondary text-xs" onClick={() => this.setState({ hasError: false })}>
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
