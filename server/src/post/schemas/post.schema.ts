import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

export enum PostStatus {
  Pending = 'pending',
  Scheduled = 'scheduled',
  Published = 'published',
  Failed = 'failed',
  Cancelled = 'cancelled',
  Partial = 'partial',
}

export enum PlatformPostStatus {
  Pending = 'pending',
  Scheduled = 'scheduled',
  Published = 'published',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

@Schema({ _id: false })
export class PlatformResult {
  @Prop({ required: true })
  platform: string;

  @Prop({
    type: String,
    enum: Object.values(PlatformPostStatus),
    default: PlatformPostStatus.Pending,
  })
  status: PlatformPostStatus;

  @Prop({ type: String, default: null })
  platformUrl: string | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ type: String, default: null })
  failureReason: string | null;
}

const PlatformResultSchema = SchemaFactory.createForClass(PlatformResult);

@Schema({
  collection: 'posts',
  timestamps: true,
})
export class Post {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  postId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  uploadRef: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  @Prop({ required: true, index: true })
  contentRef: string;

  @Prop({ type: String, default: null, index: true })
  zernioPostId: string | null;

  @Prop({ type: [String], required: true })
  channels: string[];

  @Prop({ type: Date, default: null })
  scheduledAt: Date | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({
    type: String,
    enum: Object.values(PostStatus),
    required: true,
    default: PostStatus.Pending,
  })
  status: PostStatus;

  @Prop({ type: [PlatformResultSchema], default: [] })
  platformResults: PlatformResult[];

  @Prop({ type: Number, default: 0, min: 0 })
  retryCount: number;

  @Prop({ type: String, default: null })
  failureReason: string | null;

  @Prop({ type: Boolean, default: false })
  publishedNow: boolean;
}

export const PostSchema = SchemaFactory.createForClass(Post);
export type PostDocument = HydratedDocument<Post>;

PostSchema.index({ uploadRef: 1, status: 1 });
PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ userId: 1, status: 1 });
PostSchema.index({ ruleRef: 1, createdAt: -1 });
PostSchema.index({ zernioPostId: 1 }, { sparse: true });
PostSchema.index({ status: 1, scheduledAt: 1 });
