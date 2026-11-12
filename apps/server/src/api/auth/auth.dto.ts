import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'initiator.alpha@renewaldesk.test', maxLength: 254 })
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'demo1234', maxLength: 200, format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class UserDto {
  @ApiProperty({ example: 'u-ini-a' }) id!: string;
  @ApiProperty({ example: 'Инициатор Alpha' }) name!: string;
  @ApiProperty({ example: 'initiator.alpha@renewaldesk.test' }) email!: string;
  @ApiProperty({ example: 'alpha' }) workspace_id!: string;
  @ApiProperty({ example: 'Alpha' }) workspace_name!: string;
  @ApiProperty({ enum: ['initiator', 'approver'], isArray: true, example: ['initiator'] })
  roles!: ('initiator' | 'approver')[];
}

export class LoginResponseDto {
  @ApiProperty({ type: UserDto }) user!: UserDto;
}

export class CsrfDto {
  @ApiProperty({ description: 'Send as X-CSRF-Token header on unsafe requests' })
  csrf_token!: string;
}

export class ErrorDto {
  @ApiProperty({ example: 409 }) status_code!: number;
  @ApiProperty({ example: 'active_renewal_exists' }) error_code!: string;
  @ApiProperty({ example: 'У ресурса уже есть активная заявка' }) message!: string;
}
