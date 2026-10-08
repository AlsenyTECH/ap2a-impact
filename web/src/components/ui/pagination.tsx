import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

function Pagination({ page, totalPages, onPageChange, className, ...props }: PaginationProps) {
  const clampedTotal = Math.max(totalPages, 1)

  return (
    <div
      className={cn('flex items-center justify-between gap-4', className)}
      role="navigation"
      aria-label="Pagination"
      {...props}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeft />
        Précédent
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} / {clampedTotal}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= clampedTotal}
      >
        Suivant
        <ChevronRight />
      </Button>
    </div>
  )
}

export { Pagination }
