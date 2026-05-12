import { Injectable, ConflictException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument } from './schemas/user.schema'
import * as bcrypt from 'bcryptjs'

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(name: string, email: string, password: string): Promise<UserDocument> {
    const exists = await this.userModel.findOne({ email })
    if (exists) throw new ConflictException('Email already registered')

    const passwordHash = await bcrypt.hash(password, 12)
    return this.userModel.create({ name, email, passwordHash })
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email })
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-passwordHash')
  }
}
