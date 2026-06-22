import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

/**
 * UsersService owns all database access for the `users` table. Other modules
 * (like AuthModule) call these methods instead of touching the repository
 * directly — a clean separation of concerns.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Create + persist a new user. Caller is responsible for hashing the password. */
  async create(data: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  /** Find by id (used by the JWT strategy on every authenticated request). */
  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /** Find by email WITHOUT the password hash (normal lookups). */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /**
   * Find by email INCLUDING the password hash. Needed only during login to
   * verify the password. We must explicitly re-select the hash because the
   * column is `select: false` on the entity.
   */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }
}
