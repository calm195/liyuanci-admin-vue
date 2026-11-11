import { record } from '@/types/admin'
import { ApiError } from './admin'
import { MatchmakingError, parseMatchmakingScore } from './matchmaking'
import { autoPairingStatuses } from '@/types/matchmaking-auto'
import type {
  AutoPairingCommand,
  AutoPairingJob,
  AutoPairingMember,
} from '@/types/matchmaking-auto'
const invalid = () => new Error('自动分配响应格式异常，请重新读取')
function object(value: unknown) {
  if (!record(value)) throw invalid()
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw invalid()
  return value
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw invalid()
  return value
}
function id(value: unknown) {
  const result = text(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(result))
    throw invalid()
  return result
}
function timestamp(value: unknown) {
  const result = text(value)
  if (!Number.isFinite(Date.parse(result))) throw invalid()
  return result
}
function list<T>(value: unknown, parse: (item: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max) throw invalid()
  return value.map(parse)
}
function member(value: unknown): AutoPairingMember {
  const v = object(value)
  return { enrollment_id: id(v['enrollment_id']), name: text(v['name']) }
}
function unmatched(value: unknown) {
  const v = object(value)
  return { ...member(v), reason: text(v['reason']) }
}
export function parseAutoPairingJob(value: unknown): AutoPairingJob {
  const v = object(value)
  const status = autoPairingStatuses.find((status) => status === v['status'])
  if (!status) throw invalid()
  const result: AutoPairingJob = {
    id: id(v['id']),
    activity_id: id(v['activity_id']),
    version: number(v['version']),
    activity_version: number(v['activity_version']),
    status,
    algorithm: text(v['algorithm']),
    participant_count: number(v['participant_count'], 2000),
    eligible_count: number(v['eligible_count'], 2000),
    paired_count: number(v['paired_count'], 1000),
    unmatched_count: number(v['unmatched_count'], 2000),
    excluded_count: number(v['excluded_count'], 2000),
    total_score: number(v['total_score']),
    created_at: timestamp(v['created_at']),
    expires_at: timestamp(v['expires_at']),
    error: text(v['error']),
    pairs: list(
      v['pairs'],
      (item) => {
        const p = object(item)
        return {
          first: member(p['first']),
          second: member(p['second']),
          score: number(p['score'], 200),
          score_details: parseMatchmakingScore(p['score_details']),
        }
      },
      1000,
    ),
    unmatched: list(v['unmatched'], unmatched, 2000),
    excluded: list(v['excluded'], unmatched, 2000),
  }
  if (result.version < 1 || result.activity_version < 1) throw invalid()
  if (status === 'ready' || status === 'applied') {
    if (
      result.pairs.length !== result.paired_count ||
      result.unmatched.length !== result.unmatched_count ||
      result.excluded.length !== result.excluded_count ||
      result.eligible_count !== result.paired_count * 2 + result.unmatched_count ||
      result.participant_count !== result.eligible_count + result.excluded_count
    )
      throw invalid()
    const members = [
      ...result.pairs.flatMap((pair) => [pair.first.enrollment_id, pair.second.enrollment_id]),
      ...result.unmatched.map((row) => row.enrollment_id),
      ...result.excluded.map((row) => row.enrollment_id),
    ]
    if (new Set(members).size !== members.length) throw invalid()
  }
  return result
}
export function createAutoPairingClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
) {
  async function request(
    activityID: string,
    suffix: string,
    signal: AbortSignal,
    command?: AutoPairingCommand,
  ) {
    signal.throwIfAborted()
    if (!allowed()) throw new ApiError(403)
    const response = await transport(
      `/api/v1/admin/matchmaking/activities/${id(activityID)}/auto-pairing-jobs${suffix}`,
      {
        signal,
        method: command ? 'POST' : 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(command
            ? { 'Content-Type': 'application/json', 'Idempotency-Key': command.key }
            : {}),
        },
        ...(command ? { body: JSON.stringify(command.body) } : {}),
      },
    )
    signal.throwIfAborted()
    if (!allowed()) throw new ApiError(403)
    const raw: unknown = await response.json().catch(() => undefined)
    signal.throwIfAborted()
    if (!allowed()) throw new ApiError(403)
    if (!response.ok)
      throw new MatchmakingError(
        response.status,
        record(raw) && typeof raw['error_code'] === 'string' ? raw['error_code'] : '',
      )
    const envelope = object(raw)
    if (envelope['code'] !== 0) throw invalid()
    return envelope['data']
  }
  async function read(activityID: string, suffix: string, signal: AbortSignal) {
    const result = parseAutoPairingJob(await request(activityID, suffix, signal))
    if (result.activity_id !== activityID) throw invalid()
    return result
  }
  return {
    latest(activityID: string, signal: AbortSignal) {
      return read(activityID, '/latest', signal)
    },
    async job(activityID: string, jobID: string, signal: AbortSignal) {
      const result = await read(activityID, `/${id(jobID)}`, signal)
      if (result.id !== jobID) throw invalid()
      return result
    },
    async execute(command: AutoPairingCommand, signal: AbortSignal) {
      const result = object(
        await request(
          command.activityID,
          command.kind === 'apply' ? `/${id(command.jobID)}/apply` : '',
          signal,
          command,
        ),
      )
      const resultID = id(result['id'])
      if (command.kind === 'apply' && resultID !== command.jobID) throw invalid()
      return { id: resultID }
    },
  }
}
