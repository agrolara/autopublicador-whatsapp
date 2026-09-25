import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { CurrentApiKey, Public } from './decorators/auth.decorators';
import { ApiKey } from './entities/api-key.entity';
import { AuthService } from './auth.service';
import { LoginPasswordDto, RequestOtpDto, VerifyOtpDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthValidateController {
  constructor(private readonly authService: AuthService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate an API key' })
  @ApiHeader({ name: 'X-API-Key', description: 'API key to validate' })
  @ApiResponse({ status: 200, description: 'API key is valid' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  validate(@CurrentApiKey() apiKey?: ApiKey): { valid: boolean; role?: string; name?: string; username?: string | null; allowedSessions?: string[] | null; paymentStatus?: string } {
    if (!apiKey) {
      return { valid: false };
    }
    return {
      valid: true,
      role: apiKey.role,
      name: apiKey.name,
      username: apiKey.username,
      allowedSessions: apiKey.allowedSessions,
      paymentStatus: apiKey.paymentStatus,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with username/phone and password' })
  async login(@Body() dto: LoginPasswordDto) {
    return this.authService.loginWithPassword(dto.usernameOrPhone, dto.password);
  }

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP verification code via WhatsApp' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestWhatsAppOtp(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code and authenticate' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyWhatsAppOtp(dto.phone, dto.code);
  }
}
