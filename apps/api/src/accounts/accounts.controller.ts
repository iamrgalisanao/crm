import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@crm/shared';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions(Permission.ACCOUNTS_VIEW)
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accounts.list({
      q,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.ACCOUNTS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.ACCOUNTS_CREATE)
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ACCOUNTS_EDIT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.ACCOUNTS_DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.remove(id);
  }
}
