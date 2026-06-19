import { Link } from "react-router-dom"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"
import type { BreadcrumbItem as BreadcrumbItemType } from "@/lib/route-breadcrumbs"

type PageBreadcrumbProps = {
  items: BreadcrumbItemType[]
  className?: string
}

export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
  if (items.length === 0) return null

  return (
    <Breadcrumb className={cn("mb-4", className)}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <span key={`${item.label}-${index}`} className="contents">
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={item.href} />}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator /> : null}
            </span>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
