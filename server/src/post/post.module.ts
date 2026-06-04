import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { McpModule } from '../mcp/mcp.module';
import { Upload, UploadSchema } from '../upload/schemas/upload.schema';
import { UsersModule } from '../users/users.module';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { Post, PostSchema } from './schemas/post.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Upload.name, schema: UploadSchema },
    ]),
    UsersModule,
    McpModule,
  ],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService, MongooseModule],
})
export class PostModule {}
