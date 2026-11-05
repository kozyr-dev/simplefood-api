import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  type EntityManager,
  type Repository,
} from 'typeorm';
import { User } from '../entities/user.entity';

export interface NewUser {
  username: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
}

/** Which unique constraint a duplicate hit, and what the client is told. */
const TAKEN = new Map([
  [
    'UQ_user_email',
    {
      code: 'EMAIL_TAKEN',
      message: 'An account with this email already exists',
    },
  ],
  [
    'UQ_user_username',
    { code: 'USERNAME_TAKEN', message: 'This username is already taken' },
  ],
]);

/**
 * User accounts. Knows nothing about tokens or how passwords are hashed: the
 * auth module passes hashes in.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * For login: by email when the identifier has an `@`, by username
   * otherwise (usernames can't contain one). Both are citext, so case doesn't
   * matter. Loads `passwordHash`.
   */
  findByIdentifierWithPassword(identifier: string): Promise<User | null> {
    const column = identifier.includes('@') ? 'email' : 'username';
    return this.withPassword()
      .where(`user.${column} = :identifier`, { identifier })
      .getOne();
  }

  findByIdWithPassword(id: string): Promise<User | null> {
    return this.withPassword().where('user.id = :id', { id }).getOne();
  }

  /**
   * Inserts a customer. A duplicate email or username becomes a 409
   * (`EMAIL_TAKEN` / `USERNAME_TAKEN`). The database decides, not a lookup
   * first: two parallel registrations can't both pass.
   */
  async create(
    data: NewUser,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<User> {
    const repository = manager.getRepository(User);
    try {
      const user = await repository.save(
        repository.create({ phone: null, ...data }),
      );
      delete user.passwordHash;
      return user;
    } catch (error) {
      throw toConflict(error) ?? error;
    }
  }

  async setPassword(
    id: string,
    passwordHash: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager.getRepository(User).update(id, { passwordHash });
  }

  private withPassword() {
    return this.users.createQueryBuilder('user').addSelect('user.passwordHash');
  }
}

/** A ConflictException for a duplicate email or username, else null. */
function toConflict(error: unknown): ConflictException | null {
  if (!(error instanceof QueryFailedError)) return null;
  const { code, constraint } = error.driverError as {
    code?: string;
    constraint?: string;
  };
  const taken = code === '23505' && TAKEN.get(constraint ?? '');
  return taken ? new ConflictException(taken) : null;
}
