function validatePath(url: string, prefix: string, allowQuery: boolean): void {
  const query = url.indexOf('?')
  const path = query < 0 ? url : url.slice(0, query)
  if (!path.startsWith(prefix) || (!allowQuery && query >= 0) || /[\\#\s\p{Cc}]/u.test(url))
    throw new Error('非法后台路径')

  for (const segment of path.split('/')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new Error('非法后台路径')
    }
    // 分隔符或点段可能在代理再次解码时改变路由；查询游标不参与路径判断。
    if (
      decoded === '.' ||
      decoded === '..' ||
      /[\\/\s\p{Cc}]/u.test(decoded) ||
      /%(?:25|2e|2f|5c)/i.test(decoded)
    )
      throw new Error('非法后台路径')
  }
}

/** 防止浏览器或反向代理规范化路径后将后台令牌发送到其他接口。 */
export function validateAdminPath(url: string, allowQuery: boolean): void {
  validatePath(url, '/api/v1/admin/', allowQuery)
}

/** 图片兼容既有同源接口，但不能通过路径规范化越出接口范围。 */
export function validateImagePath(url: string): void {
  try {
    validatePath(url, '/api/v1/', true)
  } catch {
    throw new Error('图片地址格式异常')
  }
}
