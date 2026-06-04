export type User = {
  id: string
  name: string
  email: string
  roleName: string
  /** Public URL when synced from auth server / profile */
  avatarUrl?: string
  phoneNumber?: string
  address?: string
}
