import { record } from '@/types/admin'
import type {
  RandomAvatar,
  RandomProfileCommand,
  RandomProfileDraw,
  RandomProfileSnapshot,
  RandomWord,
  RandomWordKind,
} from '@/types/random-profiles'
import { adminRequest, ApiError } from './admin'

export const maxRandomAvatarNameLength = 80
export const maxRandomWordLength = 38
export const maxRandomNicknameLength = 40
export const maxRandomAvatarBytes = 2 * 1024 * 1024

const endpoint = '/admin/random-profiles'
const identifier = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const idPattern = new RegExp(`^${identifier}$`, 'iu')
const imagePattern = new RegExp(`^/random-profiles/images/${identifier}$`, 'iu')

export class RandomProfileError extends ApiError {
  constructor(
    status: number,
    public code: string,
  ) {
    super(status)
  }
}

function invalid(): never {
  throw new Error('随机资料响应格式异常')
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value)) return invalid()
  return value
}

function label(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > maxLength) return invalid()
  return value
}

function imagePath(value: unknown): string {
  if (typeof value !== 'string' || !imagePattern.test(value)) return invalid()
  return `/api/v1${value}`
}

function status(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalid()
  return value
}

function entry(value: Record<string, unknown>) {
  const version = value['version']
  const updated = value['updated_at']
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    typeof updated !== 'string' ||
    !Number.isFinite(Date.parse(updated))
  )
    return invalid()
  return { id: id(value['id']), enabled: status(value['enabled']), version, updated_at: updated }
}

function avatar(value: unknown): RandomAvatar {
  if (!record(value)) return invalid()
  return {
    ...entry(value),
    name: label(value['name'], maxRandomAvatarNameLength),
    image_path: imagePath(value['image_path']),
  }
}

function word(value: unknown): RandomWord {
  if (!record(value)) return invalid()
  return { ...entry(value), text: label(value['text'], maxRandomWordLength) }
}

function list<T extends { id: string }>(value: unknown, parse: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) return invalid()
  const items = value.map(parse)
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalid()
  return items
}

async function request(
  path: `/admin/random-profiles${string}`,
  token: string,
  signal: AbortSignal,
  init?: RequestInit,
) {
  const reply = await adminRequest(path, token, { ...init, signal }, async (input, options) => {
    const response = await fetch(input, options)
    if (response.status === 400 || response.status === 409 || response.status === 422) {
      const error: unknown = await response.json().catch(() => null)
      if (record(error) && typeof error['error_code'] === 'string')
        throw new RandomProfileError(response.status, error['error_code'])
    }
    return response
  })
  if (
    !record(reply) ||
    reply['code'] !== 0 ||
    typeof reply['request_id'] !== 'string' ||
    typeof reply['message'] !== 'string' ||
    !record(reply['data'])
  )
    return invalid()
  return reply['data']
}

export async function readRandomProfiles(
  token: string,
  signal: AbortSignal,
): Promise<RandomProfileSnapshot> {
  const data = await request(endpoint, token, signal)
  return {
    avatars: list(data['avatars'], avatar),
    adjectives: list(data['adjectives'], word),
    nouns: list(data['nouns'], word),
  }
}

function json(method: 'POST' | 'PUT', body: object, key?: string): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(body),
  }
}

export async function drawRandomProfile(
  token: string,
  previous: RandomProfileDraw | null,
  signal: AbortSignal,
): Promise<RandomProfileDraw> {
  const data = await request(
    `${endpoint}/draw`,
    token,
    signal,
    json(
      'POST',
      previous
        ? { previous_avatar_id: previous.avatar_id, previous_nickname: previous.nickname }
        : {},
    ),
  )
  return {
    avatar_id: id(data['avatar_id']),
    image_path: imagePath(data['image_path']),
    nickname: label(data['nickname'], maxRandomNicknameLength),
    can_reroll: status(data['can_reroll']),
  }
}

function image(form: FormData, file: File, key: string): RequestInit {
  form.append('file', file)
  return { method: 'POST', headers: { 'Idempotency-Key': key }, body: form }
}

export async function submitRandomProfile(
  token: string,
  command: RandomProfileCommand,
  key: string,
  signal: AbortSignal,
): Promise<RandomAvatar | RandomWord> {
  let result: RandomAvatar | RandomWord
  switch (command.type) {
    case 'createAvatar': {
      const body = new FormData()
      body.set('name', command.name)
      result = avatar(
        await request(`${endpoint}/avatars`, token, signal, image(body, command.file, key)),
      )
      break
    }
    case 'replaceImage': {
      const body = new FormData()
      body.set('expected_version', String(command.item.version))
      result = avatar(
        await request(
          `${endpoint}/avatars/${id(command.item.id)}/image`,
          token,
          signal,
          image(body, command.file, key),
        ),
      )
      break
    }
    case 'editAvatar':
      result = avatar(
        await request(
          `${endpoint}/avatars/${id(command.item.id)}`,
          token,
          signal,
          json(
            'PUT',
            {
              name: command.name,
              enabled: command.enabled,
              expected_version: command.item.version,
            },
            key,
          ),
        ),
      )
      break
    case 'createWord': {
      const kind: RandomWordKind = command.pool === 'adjectives' ? 'adjective' : 'noun'
      result = word(
        await request(
          `${endpoint}/words`,
          token,
          signal,
          json('POST', { kind, text: command.text }, key),
        ),
      )
      break
    }
    case 'editWord':
      result = word(
        await request(
          `${endpoint}/words/${id(command.item.id)}`,
          token,
          signal,
          json(
            'PUT',
            {
              text: command.text,
              enabled: command.enabled,
              expected_version: command.item.version,
            },
            key,
          ),
        ),
      )
      break
  }
  if (
    'item' in command &&
    (result.id !== command.item.id || result.version <= command.item.version)
  )
    return invalid()
  return result
}
