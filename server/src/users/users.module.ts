import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersBootstrap } from './users.bootstrap';
import { UsersMaintenanceService } from './users-maintenance.service';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [UsersService, UsersBootstrap, UsersMaintenanceService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
