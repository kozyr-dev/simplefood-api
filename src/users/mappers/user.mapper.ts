import type { UserDto } from '../dto/user.dto';
import type { User } from '../entities/user.entity';

/** Field by field, so a new column never reaches a response by accident. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role,
    createdAt: user.createdAt,
  };
}
