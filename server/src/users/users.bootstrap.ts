import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, type UserDocument, UserRole } from './schemas/user.schema';

@Injectable()
export class UsersBootstrap implements OnModuleInit {
  private readonly log = new Logger(UsersBootstrap.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultAdmin();

    const raw = this.config
      .get<string>('ADMIN_BOOTSTRAP_AUTH_SERVER_USER_IDS')
      ?.trim();
    if (!raw) return;

    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return;

    const res = await this.userModel.updateMany(
      { authServerUserId: { $in: ids } },
      { $set: { role: UserRole.ADMIN } },
    );
    this.log.log(`Bootstrapped ADMIN role for ${res.modifiedCount} user(s).`);
  }

  private async seedDefaultAdmin(): Promise<void> {
    const enabled =
      (this.config.get<string>('DEFAULT_ADMIN_ENABLED') ?? 'false')
        .trim()
        .toLowerCase() === 'true';
    if (!enabled) return;

    const authServerUserId = this.config
      .get<string>('DEFAULT_ADMIN_AUTH_SERVER_USER_ID')
      ?.trim();
    const username = this.config.get<string>('DEFAULT_ADMIN_USERNAME')?.trim();
    const email = this.config.get<string>('DEFAULT_ADMIN_EMAIL')?.trim();
    const firstName = this.config.get<string>('DEFAULT_ADMIN_FIRST_NAME')?.trim();
    const lastName = this.config.get<string>('DEFAULT_ADMIN_LAST_NAME')?.trim();

    if (!authServerUserId) {
      this.log.warn(
        'DEFAULT_ADMIN_ENABLED=true but DEFAULT_ADMIN_AUTH_SERVER_USER_ID is not set; skipping seed.',
      );
      return;
    }

    const existing = await this.userModel
      .findOne({ authServerUserId })
      .exec();

    if (existing) {
      existing.role = UserRole.ADMIN;
      if (username) existing.username = username;
      if (email) existing.email = email;
      if (firstName) existing.firstName = firstName;
      if (lastName) existing.lastName = lastName;
      await existing.save();
      this.log.log(
        `Default admin ensured (existing): authServerUserId=${authServerUserId}`,
      );
      return;
    }

    await this.userModel.create({
      authServerUserId,
      username: username || 'admin',
      email,
      firstName,
      lastName,
      role: UserRole.ADMIN,
    });

    this.log.log(
      `Default admin created: authServerUserId=${authServerUserId}`,
    );
  }
}
