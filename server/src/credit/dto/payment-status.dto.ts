import { IsString, IsUUID } from 'class-validator';

export class PaymentStatusDto {
  @IsUUID()
  transactionId: string;

  @IsString()
  status: string;
}
