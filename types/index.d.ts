export type Checks = { passed: number; failed: number; pending: number }

export type Pr = {
  number: number
  title: string
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  base: string
  review: string
  checks: Checks
  additions: number
  deletions: number
  files: number
}

export type PrView =
  | { kind: 'none' }
  | { kind: 'no-pr'; repo: string; branch: string }
  | { kind: 'no-gh'; repo: string; branch: string; reason: string }
  | { kind: 'pr'; repo: string; branch: string; pr: Pr; at: number }

declare module 'claude-code' {
  interface PluginState {
    'pr-tracker': { view: Shaped<PrView>; isLoading: boolean }
  }
}
