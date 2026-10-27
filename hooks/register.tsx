import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Checks, Pr, PrView } from '../types'

// Change the tag when PrView's fields change: it declines what an earlier
// version stored, which outlives a reload.
const view = atom({ plugin: 'pr-tracker', key: 'view' } as const, { kind: 'none' } as PrView, {
  shape: 'view-1',
})
const isLoading = atom({ plugin: 'pr-tracker', key: 'isLoading' } as const, false)

const POLL_MS = 60_000
const MIN_GAP_MS = 10_000
const WIDTH = 46
const FIELDS =
  'number,title,url,state,isDraft,baseRefName,reviewDecision,statusCheckRollup,additions,deletions,changedFiles'

const repoFromRemote = (url: string): string => {
  const match = url.trim().match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/)

  return match?.[1] ?? url.trim()
}

const countChecks = (rollup: unknown): Checks => {
  const checks: Checks = { passed: 0, failed: 0, pending: 0 }
  if (!Array.isArray(rollup)) return checks

  for (const item of rollup as Array<Record<string, string | undefined>>) {
    const result = (item.conclusion || item.state || '').toUpperCase()
    const status = (item.status || '').toUpperCase()
    if (status && status !== 'COMPLETED') checks.pending += 1
    else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(result)) checks.passed += 1
    else if (['PENDING', 'EXPECTED', ''].includes(result)) checks.pending += 1
    else checks.failed += 1
  }

  return checks
}

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

let lastAt = 0

async function refresh($: EngineInterface, force = false) {
  const now = await $.clock.now()
  if (!force && now - lastAt < MIN_GAP_MS) return
  lastAt = now
  await update($, isLoading, () => true)

  try {
    const git = (args: string[]) => $.process.run(['git', ...args], { timeoutMs: 5_000 })
    const branchRun = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (branchRun.exitCode !== 0) {
      await update($, view, () => ({ kind: 'none' }) as PrView)
      return
    }
    const branch = branchRun.stdout.trim()
    const remoteRun = await git(['remote', 'get-url', 'origin'])
    const repo = remoteRun.exitCode === 0 ? repoFromRemote(remoteRun.stdout) : 'local repo'

    let ghRun
    try {
      ghRun = await $.process.run(['gh', 'pr', 'view', '--json', FIELDS], { timeoutMs: 15_000 })
    } catch {
      await update($, view, () => ({ kind: 'no-gh', repo, branch, reason: 'gh CLI not found' }) as PrView)
      return
    }

    if (ghRun.exitCode !== 0) {
      const err = ghRun.stderr.toLowerCase()
      const next: PrView = err.includes('no pull requests found')
        ? { kind: 'no-pr', repo, branch }
        : {
            kind: 'no-gh',
            repo,
            branch,
            reason: err.includes('auth') ? 'run gh auth login' : truncate(ghRun.stderr.trim().split('\n')[0] ?? 'gh failed', 36),
          }
      await update($, view, () => next)
      return
    }

    const raw = JSON.parse(ghRun.stdout)
    const pr: Pr = {
      number: raw.number,
      title: raw.title,
      url: raw.url,
      state: raw.state,
      isDraft: Boolean(raw.isDraft),
      base: raw.baseRefName,
      review: raw.reviewDecision || '',
      checks: countChecks(raw.statusCheckRollup),
      additions: raw.additions ?? 0,
      deletions: raw.deletions ?? 0,
      files: raw.changedFiles ?? 0,
    }
    await update($, view, () => ({ kind: 'pr', repo, branch, pr, at: now }) as PrView)
  } catch {
    // A transient failure keeps the last view.
  } finally {
    await update($, isLoading, () => false)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void refresh($, true)
    $.clock.every(POLL_MS, () => void refresh($, true))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void refresh($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    if (e.props.hasSurvey || current.kind === 'none') return next(e)

    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const loading = await read($, isLoading)
    const width = Math.min(WIDTH, Math.max(28, e.viewport?.columns ?? WIDTH))
    const inner = width - 4

    const header = (
      <Box justifyContent="space-between">
        <Text color="claude" bold>
           {truncate(current.repo, inner - 4)}
        </Text>
        <Button key="refresh" label={loading ? '…' : '↻'} onPress={() => refresh($, true)} />
      </Box>
    )

    let body
    let border = 'subtle'

    if (current.kind === 'no-pr') {
      body = (
        <Box flexDirection="column">
          <Text>
            <Text color="suggestion"> {truncate(current.branch, inner - 2)}</Text>
          </Text>
          <Text dimColor>No pull request for this branch</Text>
        </Box>
      )
    } else if (current.kind === 'no-gh') {
      border = 'warning'
      body = (
        <Box flexDirection="column">
          <Text color="suggestion"> {truncate(current.branch, inner - 2)}</Text>
          <Text color="warning">⚠ {current.reason}</Text>
        </Box>
      )
    } else {
      const { pr } = current
      const [stateLabel, stateColor] = pr.isDraft
        ? ['DRAFT', 'inactive']
        : pr.state === 'MERGED'
          ? ['MERGED', 'merged']
          : pr.state === 'CLOSED'
            ? ['CLOSED', 'error']
            : ['OPEN', 'success']
      const [reviewLabel, reviewColor] =
        pr.review === 'APPROVED'
          ? ['✓ approved', 'success']
          : pr.review === 'CHANGES_REQUESTED'
            ? ['✗ changes requested', 'error']
            : pr.review === 'REVIEW_REQUIRED'
              ? ['◷ review required', 'warning']
              : ['· no review', 'inactive']
      const { passed, failed, pending } = pr.checks
      const hasChecks = passed + failed + pending > 0
      border = failed > 0 ? 'error' : stateColor

      body = (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text>
              <Link href={pr.url}>
                <Text bold color="text">#{pr.number}</Text>
              </Link>{' '}
              <Text color={stateColor} bold>● {stateLabel}</Text>
            </Text>
            <Text>
              <Text color="diffAdded">+{pr.additions}</Text>{' '}
              <Text color="diffRemoved">−{pr.deletions}</Text>
            </Text>
          </Box>
          <Text wrap="truncate-end">{pr.title}</Text>
          <Text>
            <Text color="suggestion">{truncate(current.branch, Math.floor(inner / 2))}</Text>
            <Text dimColor> → </Text>
            <Text color="suggestion">{pr.base}</Text>
          </Text>
          <Box justifyContent="space-between">
            {hasChecks ? (
              <Text>
                <Text color="success">✓{passed}</Text>{' '}
                <Text color={failed ? 'error' : 'inactive'}>✗{failed}</Text>{' '}
                <Text color={pending ? 'warning' : 'inactive'}>◷{pending}</Text>
              </Text>
            ) : (
              <Text dimColor>no checks</Text>
            )}
            <Text color={reviewColor}>{reviewLabel}</Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box justifyContent="flex-end">
        <Box
          flexDirection="column"
          width={width}
          borderStyle="round"
          borderColor={border}
          paddingX={1}
        >
          {header}
          {body}
        </Box>
      </Box>
    )
  })
}
