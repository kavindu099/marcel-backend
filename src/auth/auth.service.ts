import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../users/users.service'
import * as bcrypt from 'bcryptjs'

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(name: string, email: string, password: string) {
    const user = await this.usersService.create(name, email, password)
    const userId = (user._id as { toString(): string }).toString()
    const token = this.signToken(userId, user.email)
    return { token, user: { id: userId, name: user.name, email: user.email } }
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email)
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    const userId = (user._id as { toString(): string }).toString()
    const token = this.signToken(userId, user.email)
    return { token, user: { id: userId, name: user.name, email: user.email } }
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email })
  }
}
