import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { type SsoTokenClaims } from '../auth/auth.types';
import {
  User,
  type UserDocument,
  UserRole,
  UserStatus,
} from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async upsertFromSsoClaims(args: {
    authServerUserId: string;
    claims: SsoTokenClaims;
  }): Promise<User> {
    const { authServerUserId, claims } = args;

    const email = typeof claims.email === 'string' ? claims.email : undefined;
    const username =
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : undefined;
    const firstName =
      typeof claims.given_name === 'string' ? claims.given_name : undefined;
    const lastName =
      typeof claims.family_name === 'string' ? claims.family_name : undefined;

    const now = new Date();

    const existing = await this.userModel.findOne({ authServerUserId }).exec();
    if (existing) {
      // Do not overwrite role/status from SSO.
      existing.email = email ?? existing.email;
      existing.username = username ?? existing.username;
      existing.firstName = firstName ?? existing.firstName;
      existing.lastName = lastName ?? existing.lastName;
      existing.lastLoginAt = now;
      return await existing.save();
    }

    return await this.userModel.create({
      authServerUserId,
      email,
      username,
      firstName,
      lastName,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      lastLoginAt: now,
    });
  }

  async findByUserId(userId: string): Promise<User | null> {
    return this.userModel.findOne({ userId }).exec();
  }

  async findByAuthServerUserId(authServerUserId: string): Promise<User | null> {
    return this.userModel.findOne({ authServerUserId }).exec();
  }
}
