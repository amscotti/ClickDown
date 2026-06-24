export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarSeed: string;
  createdAt: Date;
  updatedAt: Date;
}
