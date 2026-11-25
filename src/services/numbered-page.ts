/** 校验选用页码查询时的响应边界。旧游标页没有这些字段。 */
export function parseNumberedPage(
  data: Record<string, unknown>,
  count: number,
  next: string | null,
  limit = 50,
) {
  const { page, page_size: size, total } = data
  if (page === undefined && size === undefined && total === undefined) return {}
  if (
    next !== null ||
    typeof page !== 'number' ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > limit ||
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    page > Math.max(1, Math.ceil(total / size)) ||
    count !== Math.min(size, Math.max(0, total - (page - 1) * size))
  )
    throw new Error('分页数据不符合约定，请刷新后重试')
  return { page, page_size: size, total }
}
