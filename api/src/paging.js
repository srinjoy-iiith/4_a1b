// Reads ?page=&limit= from the URL. The browser never gets more than 100 rows at once.
export function paging(query, defaultLimit = 20) {
  const limit = Math.min(Math.max(parseInt(query.limit) || defaultLimit, 1), 100);
  const page = Math.max(parseInt(query.page) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

export const pageResult = (rows, total, { page, limit }) => ({
  data: rows, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1),
});
