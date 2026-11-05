import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  type EntityManager,
  type Repository,
} from 'typeorm';
import type { UpdateMeDto } from '../dto/update-me.dto';
import type { UserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';
import { toUserDto } from '../mappers/user.mapper';
import { PasswordService } from './password.service';

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
 * The token's user no longer exists or was blocked since it was issued: the
 * guard's 401, so the client refreshes, which then fails and logs it out.
 */
function noLongerActive(): UnauthorizedException {
  return new UnauthorizedException('Authentication required');
}

/** Same code as a wrong password at change-password (400: see D13). */
export function wrongPassword(): BadRequestException {
  return new BadRequestException({
    message: 'Current password is incorrect',
    code: 'WRONG_PASSWORD',
  });
}

/** User accounts and the caller's own profile. Knows nothing about tokens. */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly dataSource: DataSource,
  ) {}

  /** The caller's account; 401 if it was deleted or blocked meanwhile. */
  async getProfile(id: string): Promise<UserDto> {
    const user = await this.users.findOneBy({ id });
    if (!user || user.blocked) {
      throw noLongerActive();
    }
    return toUserDto(user);
  }

  /**
   * Changes the fields sent. A new email needs the current password; a sent
   * `currentPassword` is checked either way. A taken email or username is a
   * 409, as at registration.
   */
  async updateProfile(
    id: string,
    { currentPassword, ...changes }: UpdateMeDto,
  ): Promise<UserDto> {
    const user = await this.findActiveWithPassword(id);

    const emailChanges =
      changes.email !== undefined && changes.email !== user.email;
    if (emailChanges && currentPassword === undefined) {
      throw new BadRequestException({
        message: 'Changing the email requires currentPassword',
        code: 'CURRENT_PASSWORD_REQUIRED',
      });
    }
    if (
      currentPassword !== undefined &&
      !(await this.passwords.verify(currentPassword, user.passwordHash))
    ) {
      throw wrongPassword();
    }

    // `changes` holds only the keys sent. Nothing sent, nothing written: an
    // empty update would still bump updated_at.
    if (Object.keys(changes).length) {
      try {
        await this.users.update(id, changes);
      } catch (error) {
        throw toConflict(error) ?? error;
      }
    }
    return toUserDto(Object.assign(user, changes));
  }

  /**
   * With `passwordHash`, for checking the password of a logged-in user;
   * 401 if the account was deleted or blocked since the token was issued.
   */
  async findActiveWithPassword(id: string): Promise<User> {
    const user = await this.withPassword()
      .where('user.id = :id', { id })
      .getOne();
    if (!user || user.blocked) {
      throw noLongerActive();
    }
    return user;
  }

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
