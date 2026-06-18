import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SsoClientService } from '../../auth/sso-client.service';
import { PlanService } from '../../plan/plan.service';
import {
  User,
  type UserDocument,
  UserRole,
  UserStatus,
} from '../../users/schemas/user.schema';

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
export class AdminUserProvisioningService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly sso: SsoClientService,
    private readonly planService: PlanService,
  ) {}

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
      await this.planService.assignDefaultPlan(user.userId);
      return { user, sso: ssoResp };
    } catch (e) {
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
