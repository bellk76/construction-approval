import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';

@Injectable()
export class RbacService {
  has(user: AuthenticatedUser, permission: string): boolean {
    return user.permissions.includes(permission);
  }

  hasAll(user: AuthenticatedUser, permissions: string[]): boolean {
    return permissions.every((p) => this.has(user, p));
  }
}
