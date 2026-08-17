import { IsIn } from 'class-validator';
import { UserRole } from '../../auth/auth.constants';

export class ChangeUserRoleDto {
  @IsIn(Object.values(UserRole))
  role!: string;
}
