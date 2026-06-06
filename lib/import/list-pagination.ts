import type { DateGroup } from "@/lib/import/upload-date-group";

export const PAGE_SIZE_OPTIONS = [20, 30, 40, 100] as const;
export type ListPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_PAGE_SIZE: ListPageSize = 20;

export type PagedList<T> = {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
};

export function paginateList<T>(
  items: T[],
  page: number,
  pageSize: number
): PagedList<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  return {
    items: items.slice(start, end),
    total,
    totalPages,
    page: safePage,
    pageSize,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: end,
  };
}

/** 按日期分组排序后的列表扁平分页（不渲染分组标题） */
export function paginateDateGroups<T>(
  groups: DateGroup<T>[],
  page: number,
  pageSize: number
): PagedList<T> {
  return paginateList(
    groups.flatMap((group) => group.items),
    page,
    pageSize
  );
}
