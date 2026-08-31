import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Permission } from '@crm/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USERS_MANAGE)
  list() {
    return this.users.list();
  }

  // Any authenticated user may read the id+name list for assignee/owner pickers.
  @Get('assignable')
  listAssignable() {
    return this.users.listAssignable();
  }

  @Get(':id')
  @RequirePermissions(Permission.USERS_MANAGE)
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }
}
