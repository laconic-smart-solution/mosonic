import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type BreadcrumbOverrideContextValue = {
  label: string | undefined
  setLabel: (label: string | undefined) => void
}

const BreadcrumbOverrideContext = createContext<BreadcrumbOverrideContextValue | null>(
  null,
)

export function BreadcrumbOverrideProvider({ children }: { children: ReactNode }) {
  const [label, setLabelState] = useState<string | undefined>(undefined)

  const setLabel = useCallback((next: string | undefined) => {
    setLabelState(next)
  }, [])

  const value = useMemo(
    () => ({
      label,
      setLabel,
    }),
    [label, setLabel],
  )

  return (
    <BreadcrumbOverrideContext.Provider value={value}>
      {children}
    </BreadcrumbOverrideContext.Provider>
  )
}

export function useBreadcrumbOverride() {
  return useContext(BreadcrumbOverrideContext)
}

/** Set the dynamic last breadcrumb segment; clears on unmount. */
export function useSetBreadcrumbLabel(label: string | undefined) {
  const ctx = useBreadcrumbOverride()

  useEffect(() => {
    ctx?.setLabel(label)
    return () => {
      ctx?.setLabel(undefined)
    }
  }, [ctx, label])
}
