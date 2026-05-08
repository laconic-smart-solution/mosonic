import Loader from "@/components/core/loader"
import { Suspense, type JSX } from "react"

export default function PageLoader<P extends JSX.IntrinsicAttributes>(
  Component: React.ComponentType<P>,
) {
  return function WrappedComponent(props: P) {
    return (
      <Suspense fallback={<Loader />}>
        <Component {...(props as P)} />
      </Suspense>
    )
  }
}
