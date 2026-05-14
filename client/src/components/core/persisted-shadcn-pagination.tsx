import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { getPaginationItems } from "@/lib/list-pagination-url"
import { cn } from "@/lib/utils"

type PersistedShadcnPaginationProps = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

/**
 * Shadcn pagination controls (previous, numbered pages, next).
 * Caller owns URL/state persistence via `onPageChange`.
 */
export function PersistedShadcnPagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PersistedShadcnPaginationProps) {
  if (totalPages <= 1) return null

  const items = getPaginationItems(page, totalPages)

  return (
    <Pagination className={cn(className)}>
      <PaginationContent className="flex-wrap gap-1">
        <PaginationItem>
          <PaginationPrevious
            href="#"
            className={cn(page <= 1 && "pointer-events-none opacity-40")}
            onClick={(e) => {
              e.preventDefault()
              if (page > 1) onPageChange(page - 1)
            }}
          />
        </PaginationItem>
        {items.map((item, idx) =>
          item === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                href="#"
                size="icon"
                isActive={item === page}
                onClick={(e) => {
                  e.preventDefault()
                  onPageChange(item)
                }}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            className={cn(page >= totalPages && "pointer-events-none opacity-40")}
            onClick={(e) => {
              e.preventDefault()
              if (page < totalPages) onPageChange(page + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
