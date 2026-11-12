import { reviewRecord, reviewText } from './review-boundary'

export interface ContentImage {
  id: string
  url: string
  position: number
  scan_state: string
}

/** 图片仅接受服务端授权的同源路径或 HTTPS 地址。 */
export function parseContentImages(value: unknown): ContentImage[] {
  if (!Array.isArray(value) || value.length > 3) throw new Error('图片列表格式异常')
  return value.map((item) => {
    const row = reviewRecord(item)
    const url = reviewText(row['url'])
    if (!url.startsWith('/api/v1/') && !/^https:\/\/[^\s]+$/u.test(url))
      throw new Error('图片地址格式异常')
    const position = row['position']
    if (
      typeof position !== 'number' ||
      !Number.isSafeInteger(position) ||
      position < 0 ||
      position > 2
    )
      throw new Error('图片顺序格式异常')
    return {
      id: reviewText(row['id']),
      url,
      position,
      scan_state: reviewText(row['scan_state']),
    }
  })
}
