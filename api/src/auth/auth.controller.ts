import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, minutes } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.auth.login(body.username, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }
}
