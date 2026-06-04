function Loader() {
  return (
    <div
      className="bg-background flex min-h-screen items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading content"
    >
      <div className="flex items-center gap-1.5">
        <span className="bg-primary/70 h-2.5 w-2.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
        <span className="bg-primary h-2.5 w-2.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
        <span className="bg-primary/70 h-2.5 w-2.5 animate-bounce rounded-full" />
      </div>
    </div>
  )
}

export default Loader
