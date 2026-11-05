export type Role = 'author' | 'reviewer' | 'approver' | 'admin'

export interface User {
  id: string
  name: string
  role: Role
}

export interface DemoUser extends User {
  description: string
}