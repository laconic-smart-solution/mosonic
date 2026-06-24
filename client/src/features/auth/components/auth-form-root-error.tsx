type AuthFormRootErrorProps = {
  message?: string
}

export function AuthFormRootError({ message }: AuthFormRootErrorProps) {
  if (!message) {
    return null
  }

  return (
    <p
      role="alert"
      className="text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
    >
      {message}
    </p>
  )
}
