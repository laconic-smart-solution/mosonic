import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SsoClientService } from '../auth/sso-client.service';
import {
  User,
  type UserDocument,
  UserRole,
  UserStatus,
} from '../users/schemas/user.schema';

function tryGet(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly sso: SsoClientService,
  ) {}

  async statsUsers() {
    const [total, admins, customers, disabled] = await Promise.all([
      this.userModel.countDocuments({}).exec(),
      this.userModel.countDocuments({ role: UserRole.ADMIN }).exec(),
      this.userModel.countDocuments({ role: UserRole.CUSTOMER }).exec(),
      this.userModel.countDocuments({ status: UserStatus.DISABLED }).exec(),
    ]);

    const now = new Date();
    const daysAgo = (d: number) =>
      new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const [new7d, new30d] = await Promise.all([
      this.userModel.countDocuments({ createdAt: { $gte: daysAgo(7) } }).exec(),
      this.userModel
        .countDocuments({ createdAt: { $gte: daysAgo(30) } })
        .exec(),
    ]);

    return { total, admins, customers, disabled, new7d, new30d };
  }

  async listUsers(args: {
    q?: string;
    role?: UserRole;
    status?: UserStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, args.page ?? 1);
    const limit = Math.min(100, Math.max(1, args.limit ?? 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (args.role) filter.role = args.role;
    if (args.status) filter.status = args.status;
    if (args.q) {
      const q = args.q.trim();
      if (q) {
        filter.$or = [
          { email: { $regex: q, $options: 'i' } },
          { username: { $regex: q, $options: 'i' } },
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } },
          { authServerUserId: { $regex: q, $options: 'i' } },
        ];
      }
    }

    const [total, data] = await Promise.all([
      this.userModel.countDocuments(filter).exec(),
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const totalPages = Math.ceil(total / limit) || 0;
    return { data, meta: { total, page, limit, totalPages } };
  }

  async createUserViaSso(args: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
  }) {
    const ssoResp = await this.sso.signUp({
      email: args.email,
      username: args.username,
      password: args.password,
      firstName: args.firstName,
      lastName: args.lastName,
    });

    const authServerUserId =
      tryGet(ssoResp, ['data', 'userId']) ??
      tryGet(ssoResp, ['data', 'userID']) ??
      tryGet(ssoResp, ['data', 'userid']) ??
      tryGet(ssoResp, ['data', 'user_id']) ??
      tryGet(ssoResp, ['userId']);

    if (typeof authServerUserId !== 'string' || !authServerUserId) {
      throw new BadGatewayException('SSO sign-up returned no userId');
    }

    try {
      const user = await this.userModel.create({
        authServerUserId,
        email: args.email,
        username: args.username,
        firstName: args.firstName,
        lastName: args.lastName,
        role: args.role,
        status: UserStatus.ACTIVE,
      });
      return { user, sso: ssoResp };
    } catch (e) {
      // Rollback SSO user (best-effort).
      try {
        await this.sso.deleteUser(authServerUserId);
      } catch {
        // ignore
      }
      throw e;
    }
  }

  async updateRole(userId: string, role: UserRole) {
    const user = await this.userModel.findOne({ userId }).exec();
    if (!user) throw new NotFoundException('User not found');
    user.role = role;
    return await user.save();
  }

  async updateStatus(userId: string, status: UserStatus) {
    const user = await this.userModel.findOne({ userId }).exec();
    if (!user) throw new NotFoundException('User not found');
    user.status = status;
    return await user.save();
  }

  async deleteUser(userId: string) {
    const user = await this.userModel.findOne({ userId }).exec();
    if (!user) throw new NotFoundException('User not found');
    await user.deleteOne();
    return { success: true };
  }
}
