export type RandomWordKind = 'adjective' | 'noun'
export type RandomPool = 'avatars' | 'adjectives' | 'nouns'

interface RandomProfileEntry {
  id: string
  enabled: boolean
  version: number
  updated_at: string
}

export interface RandomAvatar extends RandomProfileEntry {
  name: string
  image_path: string
}

export interface RandomWord extends RandomProfileEntry {
  text: string
}

export interface RandomProfileSnapshot {
  avatars: RandomAvatar[]
  adjectives: RandomWord[]
  nouns: RandomWord[]
}

export interface RandomProfileDraw {
  avatar_id: string
  image_path: string
  nickname: string
  can_reroll: boolean
}

export type RandomProfileCommand =
  | { type: 'createAvatar'; name: string; file: File }
  | { type: 'editAvatar'; item: RandomAvatar; name: string; enabled: boolean }
  | { type: 'replaceImage'; item: RandomAvatar; file: File }
  | { type: 'createWord'; pool: Exclude<RandomPool, 'avatars'>; text: string }
  | {
      type: 'editWord'
      pool: Exclude<RandomPool, 'avatars'>
      item: RandomWord
      text: string
      enabled: boolean
    }
