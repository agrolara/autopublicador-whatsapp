import { IsString, IsOptional, IsArray, IsEnum, IsInt, Min, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientAccountDto {
  @ApiProperty({
    description: 'Nombre del cliente o negocio',
    example: 'Sushi Icura',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Nombre de usuario único para login',
    example: 'sushi_icura',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @ApiProperty({
    description: 'Número de WhatsApp registrado para login por OTP y alertas',
    example: '56953616157',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional({
    description: 'Contraseña para login alternativo',
    example: 'Sushi2026!',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    description: 'Sesiones de WhatsApp asignadas a este cliente (vacío = sin sesión asignada aún)',
    example: ['sushi-session'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedSessions?: string[];

  @ApiPropertyOptional({
    description: 'Valor de mensualidad pactada en pesos/dólares',
    example: 35000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyFee?: number;

  @ApiPropertyOptional({
    description: 'Fecha del próximo cobro / vencimiento (YYYY-MM-DD)',
    example: '2026-10-25',
  })
  @IsOptional()
  @IsString()
  nextBillingDate?: string;

  @ApiPropertyOptional({
    description: 'Notas o detalles internos del cliente',
    example: 'Plan Radar + Autopublicador Valle Lo Campino',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClientAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedSessions?: string[];

  @ApiPropertyOptional({ enum: ['active', 'suspended_unpaid', 'trial'] })
  @IsOptional()
  @IsEnum(['active', 'suspended_unpaid', 'trial'])
  paymentStatus?: 'active' | 'suspended_unpaid' | 'trial';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextBillingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}

export class RequestOtpDto {
  @ApiProperty({
    description: 'Teléfono de WhatsApp del cliente para recibir código de acceso',
    example: '56953616157',
  })
  @IsString()
  @MinLength(8)
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Teléfono de WhatsApp registrado',
    example: '56953616157',
  })
  @IsString()
  @MinLength(8)
  phone!: string;

  @ApiProperty({
    description: 'Código de 6 dígitos recibido por WhatsApp',
    example: '849201',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;
}

export class LoginPasswordDto {
  @ApiProperty({
    description: 'Usuario o teléfono de WhatsApp registrado',
    example: 'sushi_icura',
  })
  @IsString()
  usernameOrPhone!: string;

  @ApiProperty({
    description: 'Contraseña o clave de acceso',
    example: 'Sushi2026!',
  })
  @IsString()
  password!: string;
}

export class ClientAccountResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  username?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty()
  role!: string;

  @ApiPropertyOptional()
  allowedSessions?: string[] | null;

  @ApiProperty()
  paymentStatus!: 'active' | 'suspended_unpaid' | 'trial';

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  monthlyFee!: number;

  @ApiPropertyOptional()
  nextBillingDate?: Date | null;

  @ApiPropertyOptional()
  lastUsedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiPropertyOptional()
  clientToken?: string | null;
}
